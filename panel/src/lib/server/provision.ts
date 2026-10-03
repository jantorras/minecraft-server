import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { bridgeFor } from './bridge';
import { dockerRestart, dockerStatus } from './docker';
import { rconCommand } from './rcon';
import { PROVISION_STEPS, type ProvisionStep } from '$lib/servers';
import {
	backendsOf,
	containerName,
	deleteServerRow,
	getServer,
	markSetupDone,
	mcRoot,
	setServerStatus,
	type McServer
} from './servers';

// Crea i reconfigura els servidors: escriu els fitxers de cada un a MC_ROOT/servers/<slug>/
// i l'engega amb `docker compose`. Tot és idempotent: tornar-ho a executar sobre un
// servidor que ja existeix només hi aplica els canvis.

const execFileAsync = promisify(execFile);

export class ProvisionError extends Error {}

/** Xarxa Docker que comparteixen els servidors, els proxys i MariaDB (la crea install.sh). */
const NETWORK = 'mcnet';
const PAPER_PORT = 25565;
const VELOCITY_PORT = 25577;
const BOOT_TIMEOUT_MS = 8 * 60_000;

const BASE_GROUPS = [
	{ name: 'membre', weight: 10, prefix: '&7[Membre] ', parents: ['default'] },
	{ name: 'mod', weight: 50, prefix: '&9[Mod] ', parents: ['membre'] },
	{ name: 'admin', weight: 100, prefix: '&c[Admin] ', parents: ['mod'] },
	{ name: 'owner', weight: 1000, prefix: '&6[Owner] ', parents: ['admin'] }
];

/** Món pla fet només d'aire: res de terreny, ni estructures, ni la plataforma de pedra per defecte. */
const VOID_WORLD = JSON.stringify({
	layers: [{ block: 'minecraft:air', height: 1 }],
	biome: 'minecraft:the_void',
	features: false,
	lakes: false
});
/** Alçada del terra de la plataforma dels mons buits. */
const PLATFORM_Y = 63;

/** Variables del món segons el tipus triat en crear el servidor. */
function worldEnv(server: McServer): Record<string, string> {
	if (server.worldType === 'flat') return { LEVEL_TYPE: 'FLAT' };
	if (server.worldType !== 'void') return {};
	return {
		LEVEL_TYPE: 'FLAT',
		GENERATOR_SETTINGS: VOID_WORLD,
		GENERATE_STRUCTURES: 'false',
		// Pensat com a sala d'espera: sense monstres i sense poder trencar la plataforma.
		DIFFICULTY: 'peaceful',
		MODE: 'adventure',
		SPAWN_PROTECTION: '0'
	};
}

/** Cadena YAML entre cometes dobles. Compose interpola `$`, així que s'escapa com `$$`. */
const yamlString = (value: string) => JSON.stringify(value.replace(/\$/g, '$$$$'));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(file: string): Promise<boolean> {
	return fs
		.access(file)
		.then(() => true)
		.catch(() => false);
}

/** Variables de LuckPerms: tots els servidors comparteixen la mateixa base de dades de rols. */
function luckPermsEnv(server: McServer): Record<string, string> {
	if (!env.LP_DB_ADDRESS || !env.LP_DB_PASSWORD) return {};
	return {
		LUCKPERMS_SERVER: server.slug,
		LUCKPERMS_STORAGE_METHOD: 'mariadb',
		LUCKPERMS_DATA_ADDRESS: env.LP_DB_ADDRESS,
		LUCKPERMS_DATA_DATABASE: env.LP_DB_NAME || 'luckperms',
		LUCKPERMS_DATA_USERNAME: env.LP_DB_USER || 'luckperms',
		LUCKPERMS_DATA_PASSWORD: env.LP_DB_PASSWORD,
		// Perquè un canvi de rol fet en un servidor arribi als altres sense reiniciar.
		LUCKPERMS_MESSAGING_SERVICE: 'sql'
	};
}

export function composeFile(server: McServer): string {
	const uid = String(process.getuid?.() ?? 1000);
	const gid = String(process.getgid?.() ?? 1000);
	const paper = server.type === 'paper';
	const latest = server.version.toUpperCase() === 'LATEST';

	const environment: Record<string, string> = paper
		? {
				EULA: 'TRUE',
				TYPE: 'PAPER',
				VERSION: latest ? 'LATEST' : server.version,
				MEMORY: server.memory,
				// Opcions de la JVM afinades per a servidors de Minecraft (menys aturades per GC).
				USE_AIKAR_FLAGS: 'true',
				UID: uid,
				GID: gid,
				MOTD: server.name,
				// Darrere d'un proxy és el proxy qui valida els comptes amb Mojang.
				ONLINE_MODE: server.proxyId === null ? 'TRUE' : 'FALSE',
				ENABLE_RCON: 'true',
				RCON_PASSWORD: server.rconPassword ?? '',
				...worldEnv(server),
				...luckPermsEnv(server)
			}
		: {
				TYPE: 'VELOCITY',
				...(latest ? {} : { VELOCITY_VERSION: server.version }),
				MEMORY: server.memory,
				UID: uid,
				GID: gid,
				...luckPermsEnv(server)
			};

	const ports: string[] = [];
	if (paper) {
		// RCON i Bridge només per a la mateixa VM (el panell); mai cap a la xarxa.
		ports.push(`127.0.0.1:${server.rconPort}:25575`);
		ports.push(`127.0.0.1:${new URL(server.bridgeUrl!).port}:8765`);
	}
	if (server.hostPort !== null) ports.push(`${server.hostPort}:${paper ? PAPER_PORT : VELOCITY_PORT}`);

	return [
		'# Generat pel panell. Els canvis fets a mà es perden quan es reconfigura el servidor.',
		'services:',
		`  ${paper ? 'minecraft' : 'proxy'}:`,
		`    image: ${paper ? 'itzg/minecraft-server' : 'itzg/mc-proxy'}`,
		`    container_name: ${containerName(server.slug)}`,
		'    restart: unless-stopped',
		'    stdin_open: true',
		'    tty: true',
		// Sense límit, el registre del contenidor creix per sempre i omple el disc.
		'    logging:',
		'      driver: json-file',
		'      options:',
		'        max-size: "10m"',
		'        max-file: "3"',
		'    networks:',
		`      - ${NETWORK}`,
		'    ports:',
		...ports.map((p) => `      - "${p}"`),
		'    environment:',
		...Object.entries(environment).map(([k, v]) => `      ${k}: ${yamlString(v)}`),
		'    volumes:',
		`      - ./data:${paper ? '/data' : '/server'}`,
		'networks:',
		`  ${NETWORK}:`,
		'    external: true',
		''
	].join('\n');
}

export function bridgeConfig(server: McServer): string {
	return [
		'# Generat pel panell.',
		'api:',
		'  # 0.0.0.0 dins del contenidor; Docker només el publica a 127.0.0.1 de la VM.',
		'  host: 0.0.0.0',
		'  port: 8765',
		`  token: '${server.bridgeToken}'`,
		'',
		'personal-meta-priority: 1000',
		''
	].join('\n');
}

function velocityBlock(secret: string | null): string {
	return [
		'  velocity:',
		`    enabled: ${secret !== null}`,
		'    online-mode: true',
		`    secret: '${secret ?? ''}'`,
		''
	].join('\n');
}

/**
 * Bloc `proxies.velocity` de config/paper-global.yml. Si el fitxer encara no existeix
 * (primera arrencada) se n'escriu un amb només aquest bloc i Paper hi afegeix la resta.
 */
export function patchPaperGlobal(current: string | null, secret: string | null): string {
	if (current === null) return `proxies:\n${velocityBlock(secret)}`;
	const block = /^ {2}velocity:\n(?: {4}.*\n?)*/m;
	if (!block.test(current)) {
		throw new ProvisionError('No trobo el bloc «proxies.velocity» a config/paper-global.yml; revisa’l a mà.');
	}
	return current.replace(block, () => velocityBlock(secret));
}

function velocityServers(backends: McServer[]): string {
	return [
		'[servers]',
		'# Generat pel panell: els servidors normals que pengen d’aquest proxy.',
		...backends.map((b) => `"${b.slug}" = "${containerName(b.slug)}:${PAPER_PORT}"`),
		'# On entren els jugadors en connectar-se (el primer que respongui).',
		`try = [${backends.map((b) => `"${b.slug}"`).join(', ')}]`,
		'',
		''
	].join('\n');
}

/** velocity.toml: el crea sencer el primer cop; després només en reescriu la secció [servers]. */
export function patchVelocityToml(current: string | null, proxy: McServer, backends: McServer[]): string {
	if (current === null) {
		return [
			'# Creat pel panell. Pots editar-lo, però la secció [servers] la reescriu el panell.',
			'config-version = "2.7"',
			`bind = "0.0.0.0:${VELOCITY_PORT}"`,
			`motd = ${JSON.stringify(`<#09add3>${proxy.name}`)}`,
			'show-max-players = 100',
			'online-mode = true',
			'force-key-authentication = true',
			'player-info-forwarding-mode = "modern"',
			'forwarding-secret-file = "forwarding.secret"',
			'',
			velocityServers(backends) + '[forced-hosts]',
			''
		].join('\n');
	}
	const normalized = current.replace(/\r\n/g, '\n');
	const section = /^\[servers\]\n[\s\S]*?(?=^\[|(?![\s\S]))/m;
	if (!section.test(normalized)) return `${normalized.trimEnd()}\n\n${velocityServers(backends)}`;
	return normalized.replace(section, () => velocityServers(backends));
}

async function readOrNull(file: string): Promise<string | null> {
	return fs.readFile(file, 'utf8').catch(() => null);
}

async function seedPlugins(server: McServer): Promise<void> {
	const catalogue = path.join(mcRoot()!, 'plugins', server.type);
	const target = path.join(server.dataDir!, 'plugins');
	await fs.mkdir(target, { recursive: true });
	const jars = (await fs.readdir(catalogue).catch(() => [])).filter((f) => f.endsWith('.jar'));
	for (const jar of jars) {
		// Sense trepitjar el que ja hi hagi: un plugin actualitzat a mà no es fa enrere.
		await fs.copyFile(path.join(catalogue, jar), path.join(target, jar), fsConstants.COPYFILE_EXCL).catch((e) => {
			if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
		});
	}
}

async function writeFiles(server: McServer): Promise<void> {
	const data = server.dataDir!;
	await fs.mkdir(data, { recursive: true });
	await fs.mkdir(server.backupsDir!, { recursive: true });
	await seedPlugins(server);

	if (server.type === 'paper') {
		const bridgeDir = path.join(data, 'plugins', 'Bridge');
		await fs.mkdir(bridgeDir, { recursive: true });
		await fs.writeFile(path.join(bridgeDir, 'config.yml'), bridgeConfig(server), { mode: 0o600 });

		const proxy = server.proxyId === null ? null : getServer(server.proxyId);
		const paperGlobal = path.join(data, 'config', 'paper-global.yml');
		const current = await readOrNull(paperGlobal);
		// Un servidor nou sense proxy no necessita cap paper-global.yml propi.
		if (proxy || current !== null) {
			await fs.mkdir(path.dirname(paperGlobal), { recursive: true });
			await fs.writeFile(paperGlobal, patchPaperGlobal(current, proxy?.forwardingSecret ?? null));
		}
	} else {
		await fs.writeFile(path.join(data, 'forwarding.secret'), server.forwardingSecret ?? '', { mode: 0o600 });
		await writeVelocityToml(server);
	}

	await fs.writeFile(path.join(server.dir!, 'docker-compose.yml'), composeFile(server), { mode: 0o600 });
}

async function writeVelocityToml(proxy: McServer): Promise<void> {
	const file = path.join(proxy.dataDir!, 'velocity.toml');
	await fs.writeFile(file, patchVelocityToml(await readOrNull(file), proxy, backendsOf(proxy.id)));
}

async function compose(server: McServer, args: string[], timeoutMs: number): Promise<void> {
	try {
		await execFileAsync('docker', ['compose', ...args], { cwd: server.dir!, timeout: timeoutMs });
	} catch (e) {
		const err = e as { stderr?: string; message: string };
		const detail = (err.stderr || err.message).trim().split('\n').slice(-3).join(' ');
		throw new ProvisionError(`docker compose ${args[0]} ha fallat: ${detail}`);
	}
}

// Handshake (estat «status») + petició d'estat del protocol de Minecraft, per a localhost.
const STATUS_PING = Buffer.concat([
	Buffer.from([0x0f, 0x00, 0x00, 0x09]),
	Buffer.from('localhost'),
	Buffer.from([0x63, 0xdd, 0x01]),
	Buffer.from([0x01, 0x00])
]);

/**
 * Respon el servidor a un ping de la llista de servidors? No n'hi ha prou que el port
 * accepti connexions: Docker les accepta abans que el servidor de dins estigui a punt.
 */
function answersPing(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ host: '127.0.0.1', port });
		const done = (ok: boolean) => {
			socket.destroy();
			resolve(ok);
		};
		socket.setTimeout(3000, () => done(false));
		socket.on('connect', () => socket.write(STATUS_PING));
		socket.on('data', () => done(true));
		socket.on('error', () => done(false));
		socket.on('close', () => done(false));
	});
}

/** Espera que el servidor respongui de debò (RCON a Paper, el port de joc al proxy). */
async function waitReady(server: McServer): Promise<void> {
	const deadline = Date.now() + BOOT_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const ready =
			server.type === 'paper'
				? await rconCommand(server, 'list').then(
						() => true,
						() => false
					)
				: await answersPing(server.hostPort!);
		if (ready) return;
		await sleep(3000);
	}
	throw new ProvisionError(
		`No ha arrencat en ${BOOT_TIMEOUT_MS / 60_000} minuts. Mira’n els logs: docker logs ${server.container}`
	);
}

/** Crea els rols base si la base de dades de LuckPerms encara és buida. Retorna un avís si no pot. */
async function seedBaseGroups(server: McServer): Promise<string | null> {
	const api = bridgeFor(server);
	try {
		const existing = new Set((await api.groups()).map((g) => g.name));
		for (const group of BASE_GROUPS) {
			if (!existing.has(group.name)) await api.createGroup(group);
		}
		return null;
	} catch (e) {
		return `Servidor engegat, però el Bridge no respon (${(e as Error).message}). Hi és, el plugin, a plugins/?`;
	}
}

/**
 * El que només es fa el primer cop: la plataforma d'un món buit i la pregeneració amb
 * Chunky. Retorna un avís si alguna cosa no ha anat bé (el servidor queda engegat igualment).
 */
async function prepareWorld(server: McServer): Promise<string | null> {
	const rcon = (command: string) => rconCommand(server, command);
	try {
		if (server.worldType === 'void') {
			const size = server.platformSize ?? 10;
			const lo = -Math.floor(size / 2);
			const hi = lo + size - 1;
			await rcon(`forceload add ${lo} ${lo} ${hi} ${hi}`);
			// El tros de món triga un moment a carregar-se; fins llavors `fill` s'hi nega.
			let placed = false;
			for (let attempt = 0; attempt < 10 && !placed; attempt++) {
				await sleep(1000);
				placed = /filled|block/i.test(await rcon(`fill ${lo} ${PLATFORM_Y} ${lo} ${hi} ${PLATFORM_Y} ${hi} minecraft:smooth_stone`));
			}
			await rcon(`setworldspawn 0 ${PLATFORM_Y + 1} 0`);
			// Que tothom aparegui al centre i no al voltant (on no hi ha terra). El nom de la
			// regla depèn de la versió; la que no existeixi es descarta sola.
			await rcon('gamerule spawn_radius 0');
			await rcon('gamerule spawnRadius 0');
			await rcon(`forceload remove ${lo} ${lo} ${hi} ${hi}`);
			if (!placed) return 'No s’ha pogut col·locar la plataforma; posa-la a mà amb /fill des de la consola.';
		}
		if (server.pregenRadius) {
			const reply = await rcon('chunky world world');
			if (/unknown|incorrect/i.test(reply)) return 'El plugin Chunky no hi és: el món no s’ha pregenerat. Instal·la’l a «Plugins».';
			await rcon('chunky center 0 0');
			await rcon(`chunky radius ${server.pregenRadius}`);
			await rcon('chunky start');
		}
		return null;
	} catch (e) {
		return `No s’ha pogut preparar el món (${(e as Error).message}).`;
	}
}

/** Cal fer la preparació del món en aquesta creació? */
const needsWorldSetup = (server: McServer) =>
	server.type === 'paper' && !server.setupDone && (server.worldType === 'void' || server.pregenRadius !== null);

/** Reescriu la llista de servidors d'un proxy i el reinicia perquè la llegeixi. */
async function refreshProxy(proxyId: number | null): Promise<void> {
	const proxy = proxyId === null ? null : getServer(proxyId);
	if (!proxy || !(await exists(proxy.dataDir!))) return;
	await writeVelocityToml(proxy);
	if ((await dockerStatus(proxy).catch(() => null))?.running) await dockerRestart(proxy);
}

async function run(id: number, previousProxyId: number | null): Promise<void> {
	const server = getServer(id);
	if (!server?.dir) throw new ProvisionError('Servidor desconegut');

	enter(id, 'files');
	await writeFiles(server);
	enter(id, 'image');
	// Si no es pot baixar (sense xarxa), encara pot funcionar amb la imatge que ja hi hagi.
	await compose(server, ['pull'], 15 * 60_000).catch(() => {});
	enter(id, 'container');
	await compose(server, ['up', '-d', '--remove-orphans'], 5 * 60_000);
	enter(id, 'boot');
	await waitReady(server);

	let warning: string | null = null;
	if (server.type === 'paper') {
		enter(id, 'groups');
		warning = await seedBaseGroups(server);
	}
	if (needsWorldSetup(server)) {
		enter(id, 'world');
		const worldWarning = await prepareWorld(server);
		markSetupDone(id);
		warning = [warning, worldWarning].filter(Boolean).join(' ') || null;
	}
	if (server.proxyId !== null || previousProxyId !== null) enter(id, 'proxy');
	await refreshProxy(server.proxyId);
	if (previousProxyId !== server.proxyId) await refreshProxy(previousProxyId);
	setServerStatus(id, 'ready', warning);
}

const running = new Set<number>();

// Per on va cada creació en curs. Només en memòria: si el panell es reinicia, la creació
// també s'ha perdut (db.ts la marca com a error).
const progress = new Map<number, { step: ProvisionStep; startedAt: number; stepStartedAt: number }>();

function enter(id: number, step: ProvisionStep): void {
	const now = Date.now();
	progress.set(id, { step, startedAt: progress.get(id)?.startedAt ?? now, stepStartedAt: now });
}

/** Els passos que farà la creació d'aquest servidor, en ordre. */
export function provisionSteps(server: McServer): ProvisionStep[] {
	return PROVISION_STEPS.filter((step) => {
		if (step === 'groups') return server.type === 'paper';
		if (step === 'world') return needsWorldSetup(server);
		if (step === 'proxy') return server.proxyId !== null;
		return true;
	});
}

export function provisionProgress(id: number): { step: ProvisionStep; seconds: number; stepSeconds: number } | null {
	const p = progress.get(id);
	if (!p) return null;
	const now = Date.now();
	return { step: p.step, seconds: Math.round((now - p.startedAt) / 1000), stepSeconds: Math.round((now - p.stepStartedAt) / 1000) };
}

export function provisioning(id: number): boolean {
	return running.has(id);
}

/**
 * Engega la creació (o reconfiguració) en segon pla: baixar la imatge i arrencar per
 * primer cop triga minuts, massa per a una petició. L'estat queda a la taula `servers`.
 */
export function startProvision(id: number, previousProxyId: number | null = null): void {
	if (running.has(id)) return;
	running.add(id);
	setServerStatus(id, 'creating');
	enter(id, 'files');
	run(id, previousProxyId)
		.catch((e: Error) => setServerStatus(id, 'error', e.message))
		.finally(() => {
			running.delete(id);
			progress.delete(id);
		});
}

/**
 * Treu un servidor: atura'n el contenidor i en mou les dades a MC_ROOT/trash/ (no les
 * esborra, per si era un error).
 */
export async function removeServer(server: McServer): Promise<string | null> {
	if (!server.managed || !server.dir) throw new ProvisionError('Aquest servidor no el gestiona el panell');
	if (running.has(server.id)) throw new ProvisionError('Encara s’està creant; espera que acabi');

	let movedTo: string | null = null;
	if (await exists(server.dir)) {
		if (await exists(path.join(server.dir, 'docker-compose.yml'))) await compose(server, ['down'], 120_000);
		const trash = path.join(mcRoot()!, 'trash');
		await fs.mkdir(trash, { recursive: true });
		movedTo = path.join(trash, `${server.slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
		await fs.rename(server.dir, movedTo);
	}
	deleteServerRow(server.id);
	await refreshProxy(server.proxyId);
	return movedTo;
}

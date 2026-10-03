import { error, fail } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { DockerError, dockerRestart, dockerStart, dockerStatsCached, dockerStatus, dockerStop } from '$lib/server/docker';
import { updateGameSettings, type McServer } from '$lib/server/servers';
import { provisioning, startProvision } from '$lib/server/provision';
import { effectiveSettings } from '$lib/server/properties';
import { DIFFICULTIES, GAMEMODES, type GameSettings } from '$lib/servers';
import { hasRole } from '$lib/roles';
import { RconError, rconCommand, rconConfigured } from '$lib/server/rcon';
import { mcMaxPlayers } from '$lib/server/mcfiles';
import { BackupError, createBackup } from '$lib/server/backup';
import { audit, listAudit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export interface ServerView {
	running: boolean;
	exitedWithError: boolean;
	startedAt: number | null;
	cpuPercent: number | null;
	memUsedMB: number | null;
	memLimitMB: number | null;
	memPercent: number | null;
	online: number | null;
	max: number | null;
	version: string | null;
}

/** El servidor triat al selector; les accions no tenen sentit sense. */
function current(locals: App.Locals): McServer {
	if (!locals.server) error(400, 'No hi ha cap servidor triat');
	return locals.server;
}

/** Les entrades del registre d'un servidor porten aquest destí. */
const auditTarget = (server: McServer) => (server.managed ? `servidor:${server.slug}` : 'servidor');

async function loadServer(mc: McServer | null): Promise<{ server: ServerView | null; error: string | null }> {
	if (!mc?.container) return { server: null, error: null };
	try {
		const status = await dockerStatus(mc);
		// CPU i memòria: l'última lectura que hi hagi; la pàgina les va actualitzant després.
		const stats = status.running ? dockerStatsCached(mc) : null;
		const [max, health] = await Promise.all([
			mcMaxPlayers(mc),
			status.running && mc.bridgeUrl ? bridge.health().catch(() => null) : Promise.resolve(null)
		]);
		return {
			server: {
				running: status.running,
				exitedWithError: status.exitedWithError,
				startedAt: status.startedAt,
				cpuPercent: stats?.cpuPercent ?? null,
				memUsedMB: stats?.memUsedMB ?? null,
				memLimitMB: stats?.memLimitMB ?? null,
				memPercent: stats?.memPercent ?? null,
				online: health?.onlinePlayers ?? null,
				max,
				version: health?.server ?? null
			},
			error: null
		};
	} catch (e) {
		if (e instanceof DockerError) return { server: null, error: e.message };
		throw e;
	}
}

/** Es poden canviar les opcions del joc d'aquest servidor des del panell? */
const configurable = (mc: McServer | null): mc is McServer => !!mc && mc.managed && mc.type === 'paper';

/** Jugadors de la llista blanca, o null si ara no es pot saber (servidor aturat). */
async function loadWhitelist(mc: McServer): Promise<string[] | null> {
	try {
		const reply = await rconCommand(mc, 'whitelist list');
		const names = /:\s*(.+)$/.exec(reply.trim())?.[1];
		return names ? names.split(/,\s*/).filter(Boolean).sort((a, b) => a.localeCompare(b)) : [];
	} catch {
		return null;
	}
}

const PLAYER_NAME = /^[A-Za-z0-9_.]{1,32}$/;

export const load: PageServerLoad = async ({ locals }) => {
	const mc = locals.server;
	const { server, error } = await loadServer(mc);
	const canConfigure = configurable(mc) && hasRole(locals.user, 'admin');
	const [settings, whitelist] = canConfigure
		? await Promise.all([effectiveSettings(mc), server?.running ? loadWhitelist(mc) : Promise.resolve(null)])
		: [null, null];
	const target = mc ? auditTarget(mc) : null;
	const recent = listAudit(200)
		.filter((e) => e.target === target)
		.slice(0, 8);
	return {
		mc: mc ? { name: mc.name, type: mc.type, status: mc.status, statusDetail: mc.statusDetail } : null,
		dockerEnabled: !!mc?.container,
		rconEnabled: !!mc && rconConfigured(mc),
		server,
		error,
		recent,
		settings,
		whitelist
	};
};

export const actions: Actions = {
	power: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		const action = field(await request.formData(), 'action');
		const ops: Record<string, { run: (server: McServer) => Promise<void>; label: string }> = {
			start: { run: dockerStart, label: 'Iniciar' },
			restart: { run: dockerRestart, label: 'Reiniciar' },
			stop: { run: dockerStop, label: 'Aturar' }
		};
		const op = ops[action];
		if (!op) return fail(400, { error: 'Acció desconeguda' });
		try {
			await op.run(mc);
		} catch (e) {
			if (e instanceof DockerError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, `Servidor: ${op.label}`, auditTarget(mc));
		return { success: `Ordre enviada: ${op.label}` };
	},

	backup: async ({ locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		let name: string;
		try {
			name = await createBackup(mc);
		} catch (e) {
			if (e instanceof BackupError || e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Còpia de seguretat', auditTarget(mc), { file: name });
		return { success: `Còpia creada: ${name}` };
	},

	settings: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		if (!configurable(mc)) return fail(400, { error: 'Aquest servidor no es pot configurar des del panell' });
		if (provisioning(mc.id)) return fail(409, { error: 'Encara s’està aplicant un canvi; espera que acabi' });
		const form = await request.formData();

		const motd = field(form, 'motd');
		if (!motd || motd.length > 120 || /[\r\n]/.test(motd)) return fail(400, { error: 'El missatge (MOTD) ha de tenir entre 1 i 120 caràcters' });
		const integer = (key: string, min: number, max: number): number | null => {
			const value = Number(field(form, key));
			return Number.isInteger(value) && value >= min && value <= max ? value : null;
		};
		const maxPlayers = integer('maxPlayers', 1, 1000);
		const viewDistance = integer('viewDistance', 2, 32);
		const simulationDistance = integer('simulationDistance', 2, 32);
		const spawnProtection = integer('spawnProtection', 0, 256);
		if (maxPlayers === null) return fail(400, { error: 'El màxim de jugadors ha de ser entre 1 i 1000' });
		if (viewDistance === null || simulationDistance === null) return fail(400, { error: 'Les distàncies han de ser entre 2 i 32' });
		if (spawnProtection === null) return fail(400, { error: 'La protecció de l’inici ha de ser entre 0 i 256 blocs' });

		const difficulty = DIFFICULTIES.find((d) => d === field(form, 'difficulty'));
		const gamemode = GAMEMODES.find((g) => g === field(form, 'gamemode'));
		if (!difficulty || !gamemode) return fail(400, { error: 'Dificultat o mode de joc invàlids' });
		const on = (key: string) => form.get(key) === 'on';

		const settings: GameSettings = {
			motd,
			maxPlayers,
			difficulty,
			gamemode,
			pvp: on('pvp'),
			hardcore: on('hardcore'),
			whitelist: on('whitelist'),
			allowFlight: on('allowFlight'),
			allowNether: on('allowNether'),
			viewDistance,
			simulationDistance,
			spawnProtection
		};
		updateGameSettings(mc.id, settings);
		// Les opcions es llegeixen en arrencar: cal tornar a crear el contenidor amb les noves.
		startProvision(mc.id, mc.proxyId, { pull: false });
		audit(user, 'Canviar opcions del joc', auditTarget(mc), settings);
		return { success: 'Opcions desades. El servidor es reinicia per aplicar-les.' };
	},

	whitelist: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		const form = await request.formData();
		const player = field(form, 'player');
		const remove = field(form, 'op') === 'remove';
		if (!PLAYER_NAME.test(player)) return fail(400, { error: 'Nom de jugador invàlid' });
		let reply: string;
		try {
			reply = await rconCommand(mc, `whitelist ${remove ? 'remove' : 'add'} ${player}`);
		} catch (e) {
			if (e instanceof RconError) return fail(502, { error: `${e.message}. El servidor ha d’estar engegat.` });
			throw e;
		}
		audit(user, remove ? 'Treure de la llista blanca' : 'Afegir a la llista blanca', auditTarget(mc), { player });
		return { success: reply || (remove ? `${player} tret de la llista blanca` : `${player} afegit a la llista blanca`) };
	},

	command: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const mc = current(locals);
		const command = field(await request.formData(), 'command').replace(/^\//, '');
		if (!command || command.length > 256 || /[\r\n]/.test(command)) {
			return fail(400, { error: 'Ordre invàlida' });
		}
		let response: string;
		try {
			response = await rconCommand(mc, command);
		} catch (e) {
			if (e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Ordre de consola', auditTarget(mc), { command });
		return { success: response ? `/${command} → ${response}` : `Ordre enviada: /${command}` };
	}
};

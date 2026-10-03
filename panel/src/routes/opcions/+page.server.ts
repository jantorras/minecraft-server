import { error, fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import { dockerStatus } from '$lib/server/docker';
import { effectiveProxySettings, effectiveSettings, iconVersion, removeIcon, writeIcon } from '$lib/server/properties';
import { normalizeMotd } from '$lib/mc';
import { ProvisionError, provisioning, refreshProxy, startProvision } from '$lib/server/provision';
import { RconError, rconCommand } from '$lib/server/rcon';
import { getServer, updateGameSettings, type McServer } from '$lib/server/servers';
import { DIFFICULTIES, GAMEMODES, type GameSettings } from '$lib/servers';
import type { Actions, PageServerLoad } from './$types';

/** El servidor triat al selector; les accions no tenen sentit sense. */
function current(locals: App.Locals): McServer {
	if (!locals.server) error(400, 'No hi ha cap servidor triat');
	return locals.server;
}

const auditTarget = (server: McServer) => `servidor:${server.slug}`;
const PLAYER_NAME = /^[A-Za-z0-9_.]{1,32}$/;

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

export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, 'admin');
	const mc = locals.server;
	const base = { name: mc?.name ?? null, busy: mc?.status === 'creating' };
	// Només els servidors creats des del panell: dels altres no en controla la configuració.
	if (!mc?.managed || mc.status === 'creating') return { ...base, kind: 'none' as const };

	const icon = await iconVersion(mc);
	if (mc.type === 'velocity') {
		return { ...base, kind: 'proxy' as const, icon, proxy: await effectiveProxySettings(mc) };
	}
	const running = (await dockerStatus(mc).catch(() => null))?.running ?? false;
	const [game, whitelist] = await Promise.all([effectiveSettings(mc), running ? loadWhitelist(mc) : Promise.resolve(null)]);
	const proxy = mc.proxyId === null ? null : getServer(mc.proxyId);
	return { ...base, kind: 'game' as const, icon, game, whitelist, proxyName: proxy?.name ?? null };
};

function integer(form: FormData, key: string, min: number, max: number): number | null {
	const value = Number(field(form, key));
	return Number.isInteger(value) && value >= min && value <= max ? value : null;
}

/** El MOTD del formulari, amb codis &: una o dues línies. null si no és vàlid. */
function motdField(form: FormData): string | null {
	const motd = normalizeMotd(String(form.get('motd') ?? '')).replace(/\s+$/, '');
	const lines = motd.split('\n');
	if (!motd.trim() || lines.length > 2 || lines.some((line) => line.length > 150)) return null;
	return motd;
}

const MOTD_ERROR = 'El missatge (MOTD) ha de tenir una o dues línies de fins a 150 caràcters';

export const actions: Actions = {
	icon: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		if (!mc.managed) return fail(400, { error: 'Aquest servidor no es pot configurar des del panell' });
		const file = (await request.formData()).get('icon');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Cap imatge seleccionada' });
		if (file.size > 512 * 1024) return fail(400, { error: 'La imatge pesa massa' });
		const problem = await writeIcon(mc, Buffer.from(await file.arrayBuffer()));
		if (problem) return fail(400, { error: problem });
		audit(user, 'Canviar imatge del servidor', auditTarget(mc));
		return { success: 'Imatge desada. Es veurà a la llista del joc quan el servidor es reiniciï.' };
	},

	iconRemove: async ({ locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		if (!mc.managed) return fail(400, { error: 'Aquest servidor no es pot configurar des del panell' });
		await removeIcon(mc);
		audit(user, 'Treure imatge del servidor', auditTarget(mc));
		return { success: 'Imatge treta. Es deixarà de veure quan el servidor es reiniciï.' };
	},

	game: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		if (!mc.managed || mc.type !== 'paper') return fail(400, { error: 'Aquest servidor no es pot configurar des del panell' });
		if (provisioning(mc.id)) return fail(409, { error: 'Encara s’està aplicant un canvi; espera que acabi' });
		const form = await request.formData();

		const motd = motdField(form);
		if (motd === null) return fail(400, { error: MOTD_ERROR });
		const maxPlayers = integer(form, 'maxPlayers', 1, 1000);
		const viewDistance = integer(form, 'viewDistance', 2, 32);
		const simulationDistance = integer(form, 'simulationDistance', 2, 32);
		const spawnProtection = integer(form, 'spawnProtection', 0, 256);
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

	proxy: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		if (!mc.managed || mc.type !== 'velocity') return fail(400, { error: 'El servidor triat no és un proxy' });
		if (provisioning(mc.id)) return fail(409, { error: 'Encara s’està aplicant un canvi; espera que acabi' });
		const form = await request.formData();

		const motd = motdField(form);
		if (motd === null) return fail(400, { error: MOTD_ERROR });
		const maxPlayers = integer(form, 'maxPlayers', 1, 100000);
		if (maxPlayers === null) return fail(400, { error: 'El màxim de jugadors ha de ser un nombre positiu' });

		updateGameSettings(mc.id, { motd, maxPlayers });
		try {
			// Reescriu velocity.toml i reinicia el proxy si ha canviat.
			await refreshProxy(mc.id);
		} catch (e) {
			if (e instanceof ProvisionError) return fail(502, { error: e.message });
			return fail(502, { error: `No s’ha pogut aplicar al proxy: ${(e as Error).message}` });
		}
		audit(user, 'Canviar opcions del proxy', auditTarget(mc), { motd, maxPlayers });
		return { success: 'Desat. El proxy s’ha reiniciat per aplicar-ho.' };
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
	}
};

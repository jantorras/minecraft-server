import { fail, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { audit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import { dockerLogs } from '$lib/server/docker';
import {
	ProvisionError,
	provisionProgress,
	provisionSteps,
	provisioning,
	removeServer,
	startProvision
} from '$lib/server/provision';
import {
	RESERVED_PORTS,
	SLUG_PATTERN,
	backendsOf,
	getServer,
	insertServer,
	listServers,
	provisionConfigured,
	updateServerSettings,
	type McServer,
	type NewServer
} from '$lib/server/servers';
import { DEFAULTS, SERVER_COOKIE } from '$lib/servers';
import type { Actions, PageServerLoad } from './$types';

const YEAR = 60 * 60 * 24 * 365;

/** Per on va la creació d'un servidor, amb les últimes línies de la seva consola si ja arrenca. */
async function creationOf(server: McServer) {
	const progress = server.status === 'creating' ? provisionProgress(server.id) : null;
	if (!progress) return null;
	const booting = progress.step === 'boot' || progress.step === 'groups' || progress.step === 'proxy';
	const log = booting ? await dockerLogs(server, 6).catch(() => []) : [];
	return { ...progress, steps: provisionSteps(server), log };
}

export const load: PageServerLoad = async () => {
	const servers = listServers();
	const creations = await Promise.all(servers.map(creationOf));
	return {
		canProvision: provisionConfigured(),
		list: servers.map((s, i) => ({
			creation: creations[i],
			id: s.id,
			slug: s.slug,
			name: s.name,
			type: s.type,
			version: s.version,
			memory: s.memory,
			hostPort: s.hostPort,
			proxyId: s.proxyId,
			proxyName: servers.find((p) => p.id === s.proxyId)?.name ?? null,
			status: s.status,
			statusDetail: s.statusDetail,
			managed: s.managed
		}))
	};
};

type Settings = Pick<NewServer, 'version' | 'memory' | 'hostPort' | 'proxyId'>;

/** Valida els camps que es poden canviar després de crear. `self` = el servidor que s'edita. */
function parseSettings(form: FormData, type: McServer['type'], self: McServer | null): Settings | string {
	const version = field(form, 'version') || DEFAULTS[type].version;
	if (!/^[0-9A-Za-z.-]{1,20}$/.test(version)) return 'Versió invàlida (per exemple 26.2 o LATEST)';

	const memory = (field(form, 'memory') || DEFAULTS[type].memory).toUpperCase();
	if (!/^\d{1,3}[MG]$/.test(memory)) return 'Memòria invàlida (per exemple 3G o 512M)';

	const others = listServers().filter((s) => s.id !== self?.id);

	let proxyId: number | null = null;
	const rawProxy = field(form, 'proxyId');
	if (type === 'paper' && rawProxy) {
		const proxy = others.find((s) => s.id === Number(rawProxy));
		if (!proxy || proxy.type !== 'velocity') return 'Aquest proxy no existeix';
		proxyId = proxy.id;
	}

	let hostPort: number | null = null;
	const rawPort = field(form, 'hostPort');
	if (rawPort) {
		hostPort = Number(rawPort);
		if (!Number.isInteger(hostPort) || hostPort < 1024 || hostPort > 65535) return 'El port ha de ser entre 1024 i 65535';
		if (hostPort >= RESERVED_PORTS.from && hostPort <= RESERVED_PORTS.to) {
			return `Els ports ${RESERVED_PORTS.from}–${RESERVED_PORTS.to} són d’ús intern del panell`;
		}
		if (String(hostPort) === (env.PORT || '3000')) return 'Aquest port és el del panell';
		const clash = others.find((s) => s.hostPort === hostPort);
		if (clash) return `El port ${hostPort} ja el fa servir «${clash.name}»`;
	}

	if (type === 'velocity' && hostPort === null) return 'Un proxy necessita un port públic (normalment 25565)';
	if (type === 'paper' && proxyId !== null && hostPort !== null) {
		return 'Un servidor darrere d’un proxy no pot tenir port públic: s’hi podria entrar sense passar pel proxy';
	}
	if (type === 'paper' && proxyId === null && hostPort === null) {
		return 'Tria un proxy o posa un port públic; si no, ningú s’hi podria connectar';
	}
	return { version, memory, hostPort, proxyId };
}

export const actions: Actions = {
	select: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const server = getServer(Number(field(form, 'id')));
		if (!server) return fail(400, { error: 'Aquest servidor no existeix' });
		cookies.set(SERVER_COOKIE, String(server.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: YEAR
		});
		// Només camins interns: `back` ve del formulari.
		const back = field(form, 'back');
		redirect(303, /^\/(?!\/)/.test(back) ? back : '/servidor');
	},

	create: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		if (!provisionConfigured()) return fail(400, { error: 'La creació de servidors no està configurada (falta MC_ROOT al .env)' });
		const form = await request.formData();

		const name = field(form, 'name');
		if (!name || name.length > 40) return fail(400, { error: 'El nom ha de tenir entre 1 i 40 caràcters' });
		const slug = field(form, 'slug').toLowerCase();
		if (!SLUG_PATTERN.test(slug)) {
			return fail(400, { error: 'L’identificador ha de començar per lletra i tenir 2–24 lletres minúscules, xifres o guions' });
		}
		if (slug === 'mariadb') return fail(400, { error: 'Aquest identificador està reservat' });
		if (listServers().some((s) => s.slug === slug)) return fail(400, { error: `Ja hi ha un servidor amb l’identificador «${slug}»` });

		const type = field(form, 'type');
		if (type !== 'paper' && type !== 'velocity') return fail(400, { error: 'Tipus de servidor invàlid' });

		const settings = parseSettings(form, type, null);
		if (typeof settings === 'string') return fail(400, { error: settings });

		const server = insertServer({ slug, name, type, ...settings });
		startProvision(server.id);
		audit(user, 'Crear servidor', `servidor:${slug}`, { type, ...settings });
		return { success: `S’està creant «${name}». La primera vegada pot trigar uns minuts.` };
	},

	update: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const form = await request.formData();
		const server = getServer(Number(field(form, 'id')));
		if (!server?.managed) return fail(400, { error: 'Aquest servidor no es pot reconfigurar des del panell' });
		if (provisioning(server.id)) return fail(409, { error: 'Encara s’està creant; espera que acabi' });

		const settings = parseSettings(form, server.type, server);
		if (typeof settings === 'string') return fail(400, { error: settings });

		updateServerSettings(server.id, settings);
		startProvision(server.id, server.proxyId);
		audit(user, 'Reconfigurar servidor', `servidor:${server.slug}`, settings);
		return { success: `S’està aplicant la configuració a «${server.name}» (es reinicia si cal).` };
	},

	retry: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const server = getServer(Number(field(await request.formData(), 'id')));
		if (!server?.managed) return fail(400, { error: 'Aquest servidor no existeix' });
		startProvision(server.id);
		audit(user, 'Reintentar creació', `servidor:${server.slug}`);
		return { success: `S’està tornant a provar «${server.name}».` };
	},

	delete: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const form = await request.formData();
		const server = getServer(Number(field(form, 'id')));
		if (!server?.managed) return fail(400, { error: 'Aquest servidor no es pot treure des del panell' });
		if (field(form, 'confirm') !== server.slug) return fail(400, { error: 'L’identificador escrit no coincideix; no s’ha tret res' });
		const backends = backendsOf(server.id);
		if (backends.length > 0) {
			return fail(400, { error: `Abans treu d’aquest proxy: ${backends.map((b) => b.name).join(', ')}` });
		}
		let movedTo: string | null;
		try {
			movedTo = await removeServer(server);
		} catch (e) {
			if (e instanceof ProvisionError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Treure servidor', `servidor:${server.slug}`, { movedTo });
		return { success: movedTo ? `«${server.name}» tret. Les dades són a ${movedTo}` : `«${server.name}» tret.` };
	}
};

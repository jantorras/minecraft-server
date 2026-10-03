import { error, fail } from '@sveltejs/kit';
import { audit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import { dockerStatus } from '$lib/server/docker';
import {
	PluginsError,
	deletePlugin,
	installFromCatalogue,
	listMissingFromCatalogue,
	listPlugins,
	setInCatalogue,
	setPluginEnabled,
	uploadPlugin
} from '$lib/server/plugins';
import { provisionConfigured, type McServer } from '$lib/server/servers';
import type { Actions, PageServerLoad } from './$types';

/** El servidor triat al selector; les accions no tenen sentit sense. */
function current(locals: App.Locals): McServer {
	if (!locals.server) error(400, 'No hi ha cap servidor triat');
	return locals.server;
}

const auditTarget = (server: McServer) => (server.managed ? `servidor:${server.slug}` : 'servidor');

export const load: PageServerLoad = async ({ locals }) => {
	requireRole(locals, 'admin');
	const server = locals.server;
	if (!server?.dataDir) {
		return { serverName: server?.name ?? null, pluginsEnabled: false, plugins: [], available: [], startedAt: null, canCatalogue: false };
	}

	const [plugins, available, status] = await Promise.all([
		listPlugins(server),
		listMissingFromCatalogue(server),
		server.container ? dockerStatus(server).catch(() => null) : Promise.resolve(null)
	]);
	return {
		serverName: server.name,
		pluginsEnabled: true,
		plugins,
		available,
		// Un plugin canviat després d'engegar no s'aplica fins que es reinicia.
		startedAt: status?.running ? status.startedAt : null,
		canCatalogue: server.managed && provisionConfigured()
	};
};

async function run(work: () => Promise<void>) {
	try {
		await work();
		return null;
	} catch (e) {
		if (e instanceof PluginsError) return fail(400, { error: e.message });
		throw e;
	}
}

export const actions: Actions = {
	upload: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const server = current(locals);
		const file = (await request.formData()).get('file');
		if (!(file instanceof File) || !file.name) return fail(400, { error: 'Cap fitxer seleccionat' });
		if (file.size > 100 * 1024 * 1024) return fail(400, { error: 'Fitxer massa gran (màx. 100 MB)' });
		const data = Buffer.from(await file.arrayBuffer());
		const failed = await run(() => uploadPlugin(server, file.name, data));
		if (failed) return failed;
		audit(user, 'Pujar plugin', auditTarget(server), { file: file.name });
		return { success: `Pujat: ${file.name}. Reinicia el servidor perquè es carregui.` };
	},

	install: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const server = current(locals);
		const file = field(await request.formData(), 'file');
		const failed = await run(() => installFromCatalogue(server, file));
		if (failed) return failed;
		audit(user, 'Instal·lar plugin del catàleg', auditTarget(server), { file });
		return { success: `Instal·lat: ${file}. Reinicia el servidor perquè es carregui.` };
	},

	toggle: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const server = current(locals);
		const form = await request.formData();
		const file = field(form, 'file');
		const enabled = field(form, 'enabled') === 'true';
		const failed = await run(async () => void (await setPluginEnabled(server, file, enabled)));
		if (failed) return failed;
		audit(user, enabled ? 'Activar plugin' : 'Desactivar plugin', auditTarget(server), { file });
		return { success: `${enabled ? 'Activat' : 'Desactivat'}. Reinicia el servidor perquè s’apliqui.` };
	},

	delete: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const server = current(locals);
		const file = field(await request.formData(), 'file');
		const failed = await run(() => deletePlugin(server, file));
		if (failed) return failed;
		audit(user, 'Esborrar plugin', auditTarget(server), { file });
		return { success: `Esborrat: ${file}. Reinicia el servidor perquè s’apliqui.` };
	},

	catalogue: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const server = current(locals);
		const form = await request.formData();
		const file = field(form, 'file');
		const wanted = field(form, 'wanted') === 'true';
		const failed = await run(() => setInCatalogue(server, file, wanted));
		if (failed) return failed;
		audit(user, wanted ? 'Afegir plugin al catàleg' : 'Treure plugin del catàleg', auditTarget(server), { file });
		return { success: wanted ? 'Afegit al catàleg: els servidors nous el tindran.' : 'Tret del catàleg.' };
	}
};

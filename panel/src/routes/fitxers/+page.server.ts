import { error, fail } from '@sveltejs/kit';
import { McFilesError, mcBrowse, mcCreateEntry, mcDelete, mcFilesConfigured, mcUpload, mcWriteFile, type McBrowseResult } from '$lib/server/mcfiles';
import { audit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import type { McServer } from '$lib/server/servers';
import type { Actions, PageServerLoad } from './$types';

/** El servidor triat al selector; les accions no tenen sentit sense. */
function current(locals: App.Locals): McServer {
	if (!locals.server) error(400, 'No hi ha cap servidor triat');
	return locals.server;
}

const auditTarget = (server: McServer) => (server.managed ? `servidor:${server.slug}` : 'servidor');

async function safeBrowse(server: McServer, rel: string): Promise<{ browse: McBrowseResult | null; error: string | null }> {
	try {
		return { browse: await mcBrowse(server, rel), error: null };
	} catch (e) {
		if (!(e instanceof McFilesError)) throw e;
		return { browse: null, error: e.message };
	}
}

export const load: PageServerLoad = async ({ url, locals }) => {
	requireRole(locals, 'admin');
	const server = locals.server;
	if (!server || !mcFilesConfigured(server)) return { filesEnabled: false, serverName: server?.name ?? null, browse: null, error: null, rel: '' };
	const rel = url.searchParams.get('path') ?? '';
	const { browse, error } = await safeBrowse(server, rel);
	return { filesEnabled: true, serverName: server.name, browse, error, rel };
};

export const actions: Actions = {
	write: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const rel = field(form, 'path');
		const contents = String(form.get('contents') ?? '');
		try {
			await mcWriteFile(current(locals), rel, contents);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Editar fitxer', auditTarget(current(locals)), { path: rel });
		return { success: `Desat: ${rel}` };
	},

	delete: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const rel = field(form, 'path');
		if (!rel) return fail(400, { error: 'Camí invàlid' });
		try {
			await mcDelete(current(locals), rel);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Esborrar fitxer', auditTarget(current(locals)), { path: rel });
		return { success: `Esborrat: ${rel}` };
	},

	createFolder: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const parent = field(form, 'parent');
		const name = field(form, 'name');
		if (!name || /[/\\]/.test(name)) return fail(400, { error: 'Nom invàlid' });
		try {
			await mcCreateEntry(current(locals), parent, name, true);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Crear carpeta', auditTarget(current(locals)), { parent, name });
		return { success: `Carpeta creada: ${name}` };
	},

	upload: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const dir = field(form, 'dir');
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Cap fitxer seleccionat' });
		if (file.size > 100 * 1024 * 1024) return fail(400, { error: 'Fitxer massa gran (màx. 100 MB)' });
		const buf = Buffer.from(await file.arrayBuffer());
		try {
			await mcUpload(current(locals), dir, file.name, buf);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Pujar fitxer', auditTarget(current(locals)), { dir, name: file.name });
		return { success: `Pujat: ${file.name}` };
	}
};

import { fail } from '@sveltejs/kit';
import { McFilesError, mcBrowse, mcCreateEntry, mcDelete, mcFilesConfigured, mcUpload, mcWriteFile, type McBrowseResult } from '$lib/server/mcfiles';
import { audit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

async function safeBrowse(rel: string): Promise<{ browse: McBrowseResult | null; error: string | null }> {
	try {
		return { browse: await mcBrowse(rel), error: null };
	} catch (e) {
		if (!(e instanceof McFilesError)) throw e;
		return { browse: null, error: e.message };
	}
}

export const load: PageServerLoad = async ({ url, locals }) => {
	requireRole(locals, 'admin');
	if (!mcFilesConfigured()) return { filesEnabled: false, browse: null, error: null, rel: '' };
	const rel = url.searchParams.get('path') ?? '';
	const { browse, error } = await safeBrowse(rel);
	return { filesEnabled: true, browse, error, rel };
};

export const actions: Actions = {
	write: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const rel = field(form, 'path');
		const contents = String(form.get('contents') ?? '');
		try {
			await mcWriteFile(rel, contents);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Editar fitxer', 'servidor', { path: rel });
		return { success: `Desat: ${rel}` };
	},

	delete: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const rel = field(form, 'path');
		if (!rel) return fail(400, { error: 'Camí invàlid' });
		try {
			await mcDelete(rel);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Esborrar fitxer', 'servidor', { path: rel });
		return { success: `Esborrat: ${rel}` };
	},

	createFolder: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const form = await request.formData();
		const parent = field(form, 'parent');
		const name = field(form, 'name');
		if (!name || /[/\\]/.test(name)) return fail(400, { error: 'Nom invàlid' });
		try {
			await mcCreateEntry(parent, name, true);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Crear carpeta', 'servidor', { parent, name });
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
			await mcUpload(dir, file.name, buf);
		} catch (e) {
			if (e instanceof McFilesError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Pujar fitxer', 'servidor', { dir, name: file.name });
		return { success: `Pujat: ${file.name}` };
	}
};

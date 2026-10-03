import { error } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction, field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		return { tags: await bridge.tags() };
	} catch (e) {
		if (e instanceof BridgeError) error(502, e.message);
		throw e;
	}
};

function tagFields(form: FormData) {
	return {
		display: field(form, 'display'),
		description: field(form, 'description'),
		material: field(form, 'material') || 'NAME_TAG'
	};
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const id = field(form, 'id').toLowerCase();
		return bridgeAction(locals, { action: 'Crear tag', target: id, success: `Tag ${id} creat` }, async () => {
			const data = { id, ...tagFields(form) };
			await bridge.createTag(data);
			return data;
		});
	},

	update: async ({ request, locals }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		return bridgeAction(locals, { action: 'Editar tag', target: id, success: `Tag ${id} desat` }, async () => {
			const data = tagFields(form);
			await bridge.updateTag(id, data);
			return data;
		});
	},

	delete: async ({ request, locals }) => {
		const id = field(await request.formData(), 'id');
		return bridgeAction(locals, { action: 'Esborrar tag', target: id, success: `Tag ${id} esborrat` }, () =>
			bridge.deleteTag(id)
		);
	}
};

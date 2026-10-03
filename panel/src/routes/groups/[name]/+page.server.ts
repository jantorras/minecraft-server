import { error, redirect } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction, field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const [group, groups] = await Promise.all([bridge.group(params.name), bridge.groups()]);
		return { group, groups };
	} catch (e) {
		if (e instanceof BridgeError) error(e.status === 404 ? 404 : 502, e.message);
		throw e;
	}
};

export const actions: Actions = {
	update: async ({ request, locals, params }) => {
		const form = await request.formData();
		return bridgeAction(locals, { action: 'Editar grup', target: params.name, success: 'Grup desat' }, async () => {
			const data = {
				displayName: field(form, 'displayName') || null,
				weight: Number(field(form, 'weight') || 0),
				prefix: field(form, 'prefix') || null,
				suffix: field(form, 'suffix') || null,
				parents: form.getAll('parents').filter((v): v is string => typeof v === 'string')
			};
			await bridge.updateGroup(params.name, data);
			return data;
		});
	},

	delete: async ({ locals, params }) => {
		const result = await bridgeAction(
			locals,
			{ action: 'Esborrar grup', target: params.name, success: 'Grup esborrat' },
			() => bridge.deleteGroup(params.name)
		);
		if ('success' in result) redirect(303, '/groups');
		return result;
	}
};

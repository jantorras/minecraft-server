import { error, redirect } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction, field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		return { groups: await bridge.groups() };
	} catch (e) {
		if (e instanceof BridgeError) error(502, e.message);
		throw e;
	}
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const name = field(form, 'name').toLowerCase();
		const result = await bridgeAction(locals, { action: 'Crear grup', target: name, success: `Grup ${name} creat` }, async () => {
			const data = {
				name,
				displayName: field(form, 'displayName') || null,
				weight: Number(field(form, 'weight') || 0),
				prefix: field(form, 'prefix') || null,
				parents: field(form, 'parent') ? [field(form, 'parent')] : []
			};
			await bridge.createGroup(data);
			return data;
		});
		if ('success' in result) redirect(303, `/groups/${encodeURIComponent(name)}`);
		return result;
	}
};

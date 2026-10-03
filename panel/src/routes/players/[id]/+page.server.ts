import { error } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction, durationField, field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	try {
		const [player, groups, tags] = await Promise.all([bridge.player(params.id), bridge.groups(), bridge.tags()]);
		return { player, groups, tags };
	} catch (e) {
		if (e instanceof BridgeError) error(e.status === 404 ? 404 : 502, e.message);
		throw e;
	}
};

export const actions: Actions = {
	setGroup: async ({ request, locals, params }) => {
		const group = field(await request.formData(), 'group');
		return bridgeAction(locals, { action: 'Canviar rol', target: params.id, success: `Rol canviat a ${group}` }, async () => {
			await bridge.setGroup(params.id, group);
			return { group };
		});
	},

	addGroup: async ({ request, locals, params }) => {
		const form = await request.formData();
		const group = field(form, 'group');
		return bridgeAction(locals, { action: 'Afegir grup', target: params.id, success: `Grup ${group} afegit` }, async () => {
			const durationSeconds = durationField(form, 'days');
			await bridge.addGroup(params.id, group, durationSeconds);
			return { group, durationSeconds };
		});
	},

	removeGroup: async ({ request, locals, params }) => {
		const group = field(await request.formData(), 'group');
		return bridgeAction(locals, { action: 'Treure grup', target: params.id, success: `Grup ${group} tret` }, async () => {
			await bridge.removeGroup(params.id, group);
			return { group };
		});
	},

	meta: async ({ request, locals, params }) => {
		const form = await request.formData();
		const prefix = field(form, 'prefix') || null;
		const suffix = field(form, 'suffix') || null;
		return bridgeAction(locals, { action: 'Prefix personal', target: params.id, success: 'Prefix i sufix desats' }, async () => {
			await bridge.setMeta(params.id, { prefix, suffix });
			return { prefix, suffix };
		});
	},

	grantTag: async ({ request, locals, params }) => {
		const form = await request.formData();
		const tag = field(form, 'tag');
		return bridgeAction(locals, { action: 'Donar tag', target: params.id, success: `Tag ${tag} desbloquejat` }, async () => {
			const durationSeconds = durationField(form, 'days');
			await bridge.grantTag(params.id, tag, durationSeconds);
			return { tag, durationSeconds };
		});
	},

	revokeTag: async ({ request, locals, params }) => {
		const tag = field(await request.formData(), 'tag');
		return bridgeAction(locals, { action: 'Treure tag', target: params.id, success: `Tag ${tag} tret` }, async () => {
			await bridge.revokeTag(params.id, tag);
			return { tag };
		});
	},

	selectTag: async ({ request, locals, params }) => {
		const tag = field(await request.formData(), 'tag') || null;
		return bridgeAction(locals, { action: 'Posar tag', target: params.id, success: tag ? `Ara porta ${tag}` : 'Ja no porta cap tag' }, async () => {
			await bridge.selectTag(params.id, tag);
			return { tag };
		});
	}
};

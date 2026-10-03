import { error } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [tab, groups, tags] = await Promise.all([bridge.tab(), bridge.groups(), bridge.tags()]);
		return { tab, groups, tags };
	} catch (e) {
		if (e instanceof BridgeError) error(502, e.message);
		throw e;
	}
};

const splitLines = (value: FormDataEntryValue | null) =>
	typeof value === 'string' ? value.replace(/\r/g, '').split('\n') : [];

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		return bridgeAction(locals, { action: 'Editar TAB', target: 'tab', success: 'TAB desat i recarregat' }, async () => {
			const data = {
				header: splitLines(form.get('header')),
				footer: splitLines(form.get('footer')),
				groupOrder: form.getAll('groupOrder').filter((v): v is string => typeof v === 'string'),
				showTag: form.get('showTag') === 'on'
			};
			await bridge.updateTab(data);
			return data;
		});
	}
};

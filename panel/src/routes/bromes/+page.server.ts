import { error } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { bridgeAction, field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [players, effects] = await Promise.all([bridge.players(), bridge.effects()]);
		return { online: players.filter((p) => p.online), effects };
	} catch (e) {
		if (e instanceof BridgeError) error(502, e.message);
		throw e;
	}
};

export const actions: Actions = {
	apply: async ({ request, locals }) => {
		const form = await request.formData();
		const id = field(form, 'id');
		const effect = field(form, 'effect');
		const durationSeconds = Number(field(form, 'durationSeconds')) || 15;
		const amplifier = Number(field(form, 'amplifier')) || 0;
		return bridgeAction(
			locals,
			{ action: 'Calderó', target: id, success: `Efecte enviat a ${id}` },
			() => bridge.applyEffect(id, effect, durationSeconds, amplifier)
		);
	},

	clear: async ({ request, locals }) => {
		const id = field(await request.formData(), 'id');
		return bridgeAction(locals, { action: 'Treure efectes', target: id, success: `Efectes trets a ${id}` }, () =>
			bridge.clearEffects(id)
		);
	}
};

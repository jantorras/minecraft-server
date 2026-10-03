import { error } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	try {
		const [players, tags] = await Promise.all([bridge.players(), bridge.tags()]);
		return { players, tags };
	} catch (e) {
		if (e instanceof BridgeError) error(502, e.message);
		throw e;
	}
};

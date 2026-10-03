import { listServers } from '$lib/server/servers';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const servers = locals.user ? listServers().map(({ id, name, type, status }) => ({ id, name, type, status })) : [];
	return { user: locals.user, servers, currentServerId: locals.server?.id ?? null };
};

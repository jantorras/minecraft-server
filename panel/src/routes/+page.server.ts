import { bridge, BridgeError, type Health, type Player } from '$lib/server/bridge';
import { DockerError, dockerStatus } from '$lib/server/docker';
import type { McServer } from '$lib/server/servers';
import { listAudit } from '$lib/server/audit';
import type { PageServerLoad } from './$types';

async function loadBridge(): Promise<{ health: Health | null; online: Player[]; bridgeError: string | null }> {
	try {
		const [health, players] = await Promise.all([bridge.health(), bridge.players()]);
		return { health, online: players.filter((p) => p.online), bridgeError: null };
	} catch (e) {
		if (!(e instanceof BridgeError)) throw e;
		return { health: null, online: [], bridgeError: e.message };
	}
}

async function loadServerRunning(server: McServer | null): Promise<{ serverRunning: boolean | null; dockerError: string | null }> {
	if (!server?.container) return { serverRunning: null, dockerError: null };
	try {
		const status = await dockerStatus(server);
		return { serverRunning: status.running, dockerError: null };
	} catch (e) {
		if (!(e instanceof DockerError)) throw e;
		return { serverRunning: null, dockerError: e.message };
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const [b, d] = await Promise.all([loadBridge(), loadServerRunning(locals.server)]);
	return { ...b, ...d, serverName: locals.server?.name ?? null, recent: listAudit(8) };
};

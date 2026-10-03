import { bridge, BridgeError, type Health, type Player } from '$lib/server/bridge';
import { DockerError, dockerConfigured, dockerStatus } from '$lib/server/docker';
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

async function loadServerRunning(): Promise<{ serverRunning: boolean | null; dockerError: string | null }> {
	if (!dockerConfigured()) return { serverRunning: null, dockerError: null };
	try {
		const status = await dockerStatus();
		return { serverRunning: status.running, dockerError: null };
	} catch (e) {
		if (!(e instanceof DockerError)) throw e;
		return { serverRunning: null, dockerError: e.message };
	}
}

export const load: PageServerLoad = async () => {
	const [b, d] = await Promise.all([loadBridge(), loadServerRunning()]);
	return { ...b, ...d, dockerEnabled: dockerConfigured(), recent: listAudit(8) };
};

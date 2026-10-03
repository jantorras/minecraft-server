import { fail } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { DockerError, dockerConfigured, dockerRestart, dockerStart, dockerStats, dockerStatus, dockerStop } from '$lib/server/docker';
import { RconError, rconCommand, rconConfigured } from '$lib/server/rcon';
import { mcMaxPlayers } from '$lib/server/mcfiles';
import { BackupError, createBackup } from '$lib/server/backup';
import { audit, listAudit } from '$lib/server/audit';
import { field, requireRole } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export interface ServerView {
	running: boolean;
	exitedWithError: boolean;
	startedAt: number | null;
	cpuPercent: number | null;
	memUsedMB: number | null;
	memLimitMB: number | null;
	memPercent: number | null;
	online: number | null;
	max: number | null;
	version: string | null;
}

async function loadServer(): Promise<{ server: ServerView | null; error: string | null }> {
	if (!dockerConfigured()) return { server: null, error: null };
	try {
		const status = await dockerStatus();
		const [stats, max, health] = await Promise.all([
			status.running ? dockerStats() : Promise.resolve(null),
			mcMaxPlayers(),
			status.running ? bridge.health().catch(() => null) : Promise.resolve(null)
		]);
		return {
			server: {
				running: status.running,
				exitedWithError: status.exitedWithError,
				startedAt: status.startedAt,
				cpuPercent: stats?.cpuPercent ?? null,
				memUsedMB: stats?.memUsedMB ?? null,
				memLimitMB: stats?.memLimitMB ?? null,
				memPercent: stats?.memPercent ?? null,
				online: health?.onlinePlayers ?? null,
				max,
				version: health?.server ?? null
			},
			error: null
		};
	} catch (e) {
		if (e instanceof DockerError) return { server: null, error: e.message };
		throw e;
	}
}

export const load: PageServerLoad = async () => {
	const { server, error } = await loadServer();
	const recent = listAudit(40)
		.filter((e) => e.target === 'servidor')
		.slice(0, 8);
	return { dockerEnabled: dockerConfigured(), rconEnabled: rconConfigured(), server, error, recent };
};

export const actions: Actions = {
	power: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const action = field(await request.formData(), 'action');
		const ops: Record<string, { run: () => Promise<void>; label: string }> = {
			start: { run: dockerStart, label: 'Iniciar' },
			restart: { run: dockerRestart, label: 'Reiniciar' },
			stop: { run: dockerStop, label: 'Aturar' }
		};
		const op = ops[action];
		if (!op) return fail(400, { error: 'Acció desconeguda' });
		try {
			await op.run();
		} catch (e) {
			if (e instanceof DockerError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, `Servidor: ${op.label}`, 'servidor');
		return { success: `Ordre enviada: ${op.label}` };
	},

	backup: async ({ locals }) => {
		const user = requireRole(locals, 'admin');
		let name: string;
		try {
			name = await createBackup();
		} catch (e) {
			if (e instanceof BackupError || e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Còpia de seguretat', 'servidor', { file: name });
		return { success: `Còpia creada: ${name}` };
	},

	command: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const command = field(await request.formData(), 'command').replace(/^\//, '');
		if (!command || command.length > 256 || /[\r\n]/.test(command)) {
			return fail(400, { error: 'Ordre invàlida' });
		}
		let response: string;
		try {
			response = await rconCommand(command);
		} catch (e) {
			if (e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Ordre de consola', 'servidor', { command });
		return { success: response ? `/${command} → ${response}` : `Ordre enviada: /${command}` };
	}
};

import { error, fail } from '@sveltejs/kit';
import { bridge, BridgeError } from '$lib/server/bridge';
import { DockerError, dockerRestart, dockerStart, dockerStats, dockerStatus, dockerStop } from '$lib/server/docker';
import type { McServer } from '$lib/server/servers';
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

/** El servidor triat al selector; les accions no tenen sentit sense. */
function current(locals: App.Locals): McServer {
	if (!locals.server) error(400, 'No hi ha cap servidor triat');
	return locals.server;
}

/** Les entrades del registre d'un servidor porten aquest destí. */
const auditTarget = (server: McServer) => (server.managed ? `servidor:${server.slug}` : 'servidor');

async function loadServer(mc: McServer | null): Promise<{ server: ServerView | null; error: string | null }> {
	if (!mc?.container) return { server: null, error: null };
	try {
		const status = await dockerStatus(mc);
		const [stats, max, health] = await Promise.all([
			status.running ? dockerStats(mc) : Promise.resolve(null),
			mcMaxPlayers(mc),
			status.running && mc.bridgeUrl ? bridge.health().catch(() => null) : Promise.resolve(null)
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

export const load: PageServerLoad = async ({ locals }) => {
	const mc = locals.server;
	const { server, error } = await loadServer(mc);
	const target = mc ? auditTarget(mc) : null;
	const recent = listAudit(200)
		.filter((e) => e.target === target)
		.slice(0, 8);
	return {
		mc: mc ? { name: mc.name, type: mc.type, status: mc.status, statusDetail: mc.statusDetail } : null,
		dockerEnabled: !!mc?.container,
		rconEnabled: !!mc && rconConfigured(mc),
		server,
		error,
		recent
	};
};

export const actions: Actions = {
	power: async ({ request, locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		const action = field(await request.formData(), 'action');
		const ops: Record<string, { run: (server: McServer) => Promise<void>; label: string }> = {
			start: { run: dockerStart, label: 'Iniciar' },
			restart: { run: dockerRestart, label: 'Reiniciar' },
			stop: { run: dockerStop, label: 'Aturar' }
		};
		const op = ops[action];
		if (!op) return fail(400, { error: 'Acció desconeguda' });
		try {
			await op.run(mc);
		} catch (e) {
			if (e instanceof DockerError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, `Servidor: ${op.label}`, auditTarget(mc));
		return { success: `Ordre enviada: ${op.label}` };
	},

	backup: async ({ locals }) => {
		const user = requireRole(locals, 'admin');
		const mc = current(locals);
		let name: string;
		try {
			name = await createBackup(mc);
		} catch (e) {
			if (e instanceof BackupError || e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Còpia de seguretat', auditTarget(mc), { file: name });
		return { success: `Còpia creada: ${name}` };
	},

	command: async ({ request, locals }) => {
		const user = requireRole(locals, 'owner');
		const mc = current(locals);
		const command = field(await request.formData(), 'command').replace(/^\//, '');
		if (!command || command.length > 256 || /[\r\n]/.test(command)) {
			return fail(400, { error: 'Ordre invàlida' });
		}
		let response: string;
		try {
			response = await rconCommand(mc, command);
		} catch (e) {
			if (e instanceof RconError) return fail(502, { error: e.message });
			throw e;
		}
		audit(user, 'Ordre de consola', auditTarget(mc), { command });
		return { success: response ? `/${command} → ${response}` : `Ordre enviada: /${command}` };
	}
};

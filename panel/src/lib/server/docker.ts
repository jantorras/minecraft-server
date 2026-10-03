import { Agent, fetch } from 'undici';
import { env } from '$env/dynamic/private';

// Client mínim de l'API de Docker Engine, parlant pel socket unix /var/run/docker.sock.
// Substitueix Crafty: el panell gestiona el contenidor del servidor directament.

export class DockerError extends Error {}

const SOCKET_PATH = '/var/run/docker.sock';
let agent: Agent | undefined;

export function dockerConfigured(): boolean {
	return !!env.MC_CONTAINER;
}

function containerName(): string {
	if (!env.MC_CONTAINER) throw new DockerError('Docker no està configurat (MC_CONTAINER)');
	return env.MC_CONTAINER;
}

async function call(method: string, path: string, timeoutMs = 10_000): Promise<unknown> {
	if (!dockerConfigured()) throw new DockerError('Docker no està configurat (MC_CONTAINER)');
	agent ??= new Agent({ socketPath: SOCKET_PATH });
	let res;
	try {
		res = await fetch(`http://localhost${path}`, { method, dispatcher: agent, signal: AbortSignal.timeout(timeoutMs) });
	} catch (e) {
		throw new DockerError(`No es pot connectar amb Docker (socket /var/run/docker.sock): ${(e as Error).message}`);
	}
	if (res.status === 404) throw new DockerError(`Contenidor «${containerName()}» no trobat`);
	if (res.status === 204) return null;
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { message?: string };
		throw new DockerError(`Docker ha respost amb un error: ${data.message ?? res.status}`);
	}
	return res.json().catch(() => null);
}

export interface ContainerStatus {
	running: boolean;
	exitedWithError: boolean;
	startedAt: number | null;
}

export async function dockerStatus(): Promise<ContainerStatus> {
	const d = (await call('GET', `/containers/${containerName()}/json`)) as {
		State?: { Running?: boolean; Status?: string; ExitCode?: number; StartedAt?: string };
	};
	const state = d.State ?? {};
	const startedAt = state.Running && state.StartedAt ? new Date(state.StartedAt).getTime() : null;
	return {
		running: state.Running === true,
		exitedWithError: state.Status === 'exited' && (state.ExitCode ?? 0) !== 0,
		startedAt: startedAt && !Number.isNaN(startedAt) ? startedAt : null
	};
}

export async function dockerStart(): Promise<void> {
	await call('POST', `/containers/${containerName()}/start`, 30_000);
}

export async function dockerStop(): Promise<void> {
	await call('POST', `/containers/${containerName()}/stop?t=60`, 75_000);
}

export async function dockerRestart(): Promise<void> {
	await call('POST', `/containers/${containerName()}/restart?t=60`, 75_000);
}

export interface ContainerStats {
	cpuPercent: number | null;
	memUsedMB: number | null;
	memLimitMB: number | null;
	memPercent: number | null;
}

interface DockerStatsPayload {
	cpu_stats?: {
		cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
		system_cpu_usage?: number;
		online_cpus?: number;
	};
	precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
	memory_stats?: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
}

export async function dockerStats(): Promise<ContainerStats> {
	const empty: ContainerStats = { cpuPercent: null, memUsedMB: null, memLimitMB: null, memPercent: null };
	const d = (await call('GET', `/containers/${containerName()}/stats?stream=false`)) as DockerStatsPayload | null;
	if (!d?.cpu_stats || !d.precpu_stats || !d.memory_stats) return empty;

	const cpuDelta = (d.cpu_stats.cpu_usage?.total_usage ?? 0) - (d.precpu_stats.cpu_usage?.total_usage ?? 0);
	const sysDelta = (d.cpu_stats.system_cpu_usage ?? 0) - (d.precpu_stats.system_cpu_usage ?? 0);
	const cpuCount = d.cpu_stats.online_cpus ?? d.cpu_stats.cpu_usage?.percpu_usage?.length ?? 1;
	const cpuPercent = sysDelta > 0 && cpuDelta > 0 ? (cpuDelta / sysDelta) * cpuCount * 100 : 0;

	const usage = d.memory_stats.usage ?? 0;
	const cache = d.memory_stats.stats?.cache ?? d.memory_stats.stats?.inactive_file ?? 0;
	const memUsed = Math.max(usage - cache, 0);
	const memLimit = d.memory_stats.limit ?? 0;

	return {
		cpuPercent: Math.round(cpuPercent * 10) / 10,
		memUsedMB: Math.round(memUsed / 1024 / 1024),
		memLimitMB: memLimit ? Math.round(memLimit / 1024 / 1024) : null,
		memPercent: memLimit ? Math.round((memUsed / memLimit) * 1000) / 10 : null
	};
}

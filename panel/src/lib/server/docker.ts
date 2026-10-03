import { Agent, fetch } from 'undici';
import type { McServer } from './servers';

// Client mínim de l'API de Docker Engine, parlant pel socket unix /var/run/docker.sock.
// El panell gestiona els contenidors dels servidors directament.

export class DockerError extends Error {}

const SOCKET_PATH = '/var/run/docker.sock';
let agent: Agent | undefined;

function containerOf(server: McServer): string {
	if (!server.container) throw new DockerError('Aquest servidor no té cap contenidor Docker associat');
	return server.container;
}

async function request(server: McServer, method: string, action: string, timeoutMs: number) {
	const container = containerOf(server);
	const path = `/containers/${container}/${action}`;
	agent ??= new Agent({ socketPath: SOCKET_PATH });
	let res;
	try {
		res = await fetch(`http://localhost${path}`, { method, dispatcher: agent, signal: AbortSignal.timeout(timeoutMs) });
	} catch (e) {
		throw new DockerError(`No es pot connectar amb Docker (socket /var/run/docker.sock): ${(e as Error).message}`);
	}
	if (res.status === 404) throw new DockerError(`Contenidor «${container}» no trobat`);
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { message?: string };
		throw new DockerError(`Docker ha respost amb un error: ${data.message ?? res.status}`);
	}
	return res;
}

async function call(server: McServer, method: string, action: string, timeoutMs = 10_000): Promise<unknown> {
	const res = await request(server, method, action, timeoutMs);
	if (res.status === 204) return null;
	return res.json().catch(() => null);
}

export interface ContainerStatus {
	running: boolean;
	exitedWithError: boolean;
	startedAt: number | null;
}

export async function dockerStatus(server: McServer): Promise<ContainerStatus> {
	const d = (await call(server, 'GET', 'json')) as {
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

export async function dockerStart(server: McServer): Promise<void> {
	await call(server, 'POST', 'start', 30_000);
}

export async function dockerStop(server: McServer): Promise<void> {
	await call(server, 'POST', 'stop?t=60', 75_000);
}

export async function dockerRestart(server: McServer): Promise<void> {
	await call(server, 'POST', 'restart?t=60', 75_000);
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

export async function dockerStats(server: McServer): Promise<ContainerStats> {
	const empty: ContainerStats = { cpuPercent: null, memUsedMB: null, memLimitMB: null, memPercent: null };
	const d = (await call(server, 'GET', 'stats?stream=false')) as DockerStatsPayload | null;
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

/** Sense TTY, Docker envia la sortida en trames amb una capçalera de 8 bytes; amb TTY, tal qual. */
function demultiplex(buf: Buffer): Buffer {
	const framed = (p: number) => buf.length >= p + 8 && buf[p] <= 2 && buf[p + 1] === 0 && buf[p + 2] === 0 && buf[p + 3] === 0;
	if (!framed(0)) return buf;
	const parts: Buffer[] = [];
	for (let p = 0; framed(p); ) {
		const size = buf.readUInt32BE(p + 4);
		parts.push(buf.subarray(p + 8, p + 8 + size));
		p += 8 + size;
	}
	return Buffer.concat(parts);
}

/** Les últimes línies de la consola del contenidor (el mateix que `docker logs --tail`), en text net. */
export async function dockerLogs(server: McServer, tail = 300): Promise<string[]> {
	const res = await request(server, 'GET', `logs?stdout=1&stderr=1&tail=${tail}`, 10_000);
	const text = demultiplex(Buffer.from(await res.arrayBuffer())).toString('utf8');
	return (
		text
			// Colors i moviments de cursor de la consola.
			.replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b[=>]/g, '')
			.split(/\r?\n/)
			// La consola redibuixa el «> » d'entrada amb retorns de carro; en queda l'últim text.
			.map((line) => line.slice(line.lastIndexOf('\r') + 1).replace(/[\x00-\x08\x0b-\x1f]/g, ''))
			.filter((line) => line.trim() !== '' && line.trim() !== '>')
	);
}

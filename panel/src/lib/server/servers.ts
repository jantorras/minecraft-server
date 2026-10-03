import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { db } from './db';
import type { WorldType } from '$lib/servers';

// Els servidors que gestiona el panell. Cada un és un contenidor Docker amb el seu
// directori a MC_ROOT/servers/<slug>/ (docker-compose.yml + data/).
//
// Compatibilitat: si no n'hi ha cap a la base de dades però el .env encara té les
// variables d'un sol servidor (BRIDGE_URL, MC_CONTAINER...), es fa servir aquell
// (id 0). Així continuen funcionant el mode local de proves i una instal·lació antiga.

export type ServerType = 'paper' | 'velocity';
export type ServerStatus = 'creating' | 'ready' | 'error';

export interface McServer {
	id: number;
	slug: string;
	name: string;
	type: ServerType;
	version: string;
	memory: string;
	/** Port publicat a la VM per als jugadors. null = només s'hi entra pel proxy. */
	hostPort: number | null;
	proxyId: number | null;
	status: ServerStatus;
	statusDetail: string | null;
	/** false = servidor heretat del .env: es pot controlar però no reconfigurar ni esborrar. */
	managed: boolean;
	container: string | null;
	dir: string | null;
	dataDir: string | null;
	backupsDir: string | null;
	rconHost: string;
	rconPort: number | null;
	rconPassword: string | null;
	bridgeUrl: string | null;
	bridgeToken: string | null;
	forwardingSecret: string | null;
	worldType: WorldType;
	/** Costat de la plataforma (en blocs) d'un món buit. */
	platformSize: number | null;
	/** Radi que Chunky ha de generar per endavant el primer cop. null = res. */
	pregenRadius: number | null;
	/** Ja s'ha fet la preparació del món (plataforma, pregeneració)? Només es fa un cop. */
	setupDone: boolean;
}

interface Row {
	id: number;
	slug: string;
	name: string;
	type: ServerType;
	version: string;
	memory: string;
	host_port: number | null;
	proxy_id: number | null;
	rcon_password: string | null;
	bridge_token: string | null;
	forwarding_secret: string | null;
	status: ServerStatus;
	status_detail: string | null;
	world_type: WorldType;
	platform_size: number | null;
	pregen_radius: number | null;
	setup_done: number;
}

/** Ports només per a 127.0.0.1, derivats de l'id (que no es reutilitza mai). */
const RCON_PORT_BASE = 26000;
const BRIDGE_PORT_BASE = 27000;
export const RESERVED_PORTS = { from: RCON_PORT_BASE, to: BRIDGE_PORT_BASE + 999 };

export const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,23}$/;

export function mcRoot(): string | null {
	return env.MC_ROOT ? path.resolve(env.MC_ROOT) : null;
}

/** Es poden crear servidors? Cal MC_ROOT (ho deixa posat install.sh). */
export function provisionConfigured(): boolean {
	return mcRoot() !== null;
}

export function containerName(slug: string): string {
	return `mc-${slug}`;
}

function fromRow(r: Row): McServer {
	const root = mcRoot();
	const dir = root ? path.join(root, 'servers', r.slug) : null;
	const paper = r.type === 'paper';
	return {
		id: r.id,
		slug: r.slug,
		name: r.name,
		type: r.type,
		version: r.version,
		memory: r.memory,
		hostPort: r.host_port,
		proxyId: r.proxy_id,
		status: r.status,
		statusDetail: r.status_detail,
		managed: true,
		container: containerName(r.slug),
		dir,
		dataDir: dir ? path.join(dir, 'data') : null,
		backupsDir: root ? path.join(root, 'backups', r.slug) : null,
		rconHost: '127.0.0.1',
		rconPort: paper ? RCON_PORT_BASE + r.id : null,
		rconPassword: paper ? r.rcon_password : null,
		bridgeUrl: paper ? `http://127.0.0.1:${BRIDGE_PORT_BASE + r.id}` : null,
		bridgeToken: paper ? r.bridge_token : null,
		forwardingSecret: r.forwarding_secret,
		worldType: r.world_type,
		platformSize: r.platform_size,
		pregenRadius: r.pregen_radius,
		setupDone: r.setup_done === 1
	};
}

function legacyServer(): McServer | null {
	if (!env.BRIDGE_URL && !env.MC_CONTAINER) return null;
	return {
		id: 0,
		slug: env.MC_CONTAINER || 'local',
		name: env.MC_CONTAINER || 'Servidor local',
		type: 'paper',
		version: '',
		memory: '',
		hostPort: 25565,
		proxyId: null,
		status: 'ready',
		statusDetail: null,
		managed: false,
		container: env.MC_CONTAINER || null,
		dir: null,
		dataDir: env.MC_DATA_DIR || null,
		backupsDir: env.MC_BACKUPS_DIR || null,
		rconHost: env.MC_RCON_HOST || '127.0.0.1',
		rconPort: env.MC_RCON_PORT ? Number(env.MC_RCON_PORT) : null,
		rconPassword: env.MC_RCON_PASSWORD || null,
		bridgeUrl: env.BRIDGE_URL || 'http://127.0.0.1:8765',
		bridgeToken: env.BRIDGE_TOKEN || null,
		forwardingSecret: null,
		worldType: 'normal',
		platformSize: null,
		pregenRadius: null,
		setupDone: true
	};
}

export function listServers(): McServer[] {
	const rows = db.prepare('SELECT * FROM servers ORDER BY id').all() as Row[];
	if (rows.length > 0) return rows.map(fromRow);
	const legacy = legacyServer();
	return legacy ? [legacy] : [];
}

export function getServer(id: number): McServer | null {
	if (id === 0) return listServers().find((s) => s.id === 0) ?? null;
	const row = db.prepare('SELECT * FROM servers WHERE id = ?').get(id) as Row | undefined;
	return row ? fromRow(row) : null;
}

/** Servidors normals que pengen d'un proxy, en ordre de creació (el primer és on s'entra). */
export function backendsOf(proxyId: number): McServer[] {
	return listServers().filter((s) => s.proxyId === proxyId);
}

/** El servidor sobre el qual treballa la petició: el de la cookie o, si no, el primer que tingui sentit. */
export function resolveCurrentServer(cookie: string | undefined): McServer | null {
	const servers = listServers();
	const chosen = cookie !== undefined && /^\d+$/.test(cookie) ? servers.find((s) => s.id === Number(cookie)) : undefined;
	return chosen ?? servers.find((s) => s.type === 'paper') ?? servers[0] ?? null;
}

export interface NewServer {
	slug: string;
	name: string;
	type: ServerType;
	version: string;
	memory: string;
	hostPort: number | null;
	proxyId: number | null;
	worldType: WorldType;
	platformSize: number | null;
	pregenRadius: number | null;
}

const secret = (bytes: number) => randomBytes(bytes).toString('hex');

export function insertServer(s: NewServer): McServer {
	const paper = s.type === 'paper';
	const { lastInsertRowid } = db
		.prepare(
			`INSERT INTO servers (slug, name, type, version, memory, host_port, proxy_id,
				rcon_password, bridge_token, forwarding_secret, world_type, platform_size, pregen_radius,
				status, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'creating', ?)`
		)
		.run(
			s.slug,
			s.name,
			s.type,
			s.version,
			s.memory,
			s.hostPort,
			s.proxyId,
			paper ? secret(24) : null,
			paper ? secret(32) : null,
			paper ? null : secret(24),
			s.worldType,
			s.platformSize,
			s.pregenRadius,
			Date.now()
		);
	return getServer(Number(lastInsertRowid))!;
}

export function updateServerSettings(id: number, s: Pick<NewServer, 'version' | 'memory' | 'hostPort' | 'proxyId'>): void {
	db.prepare('UPDATE servers SET version = ?, memory = ?, host_port = ?, proxy_id = ? WHERE id = ?').run(
		s.version,
		s.memory,
		s.hostPort,
		s.proxyId,
		id
	);
}

export function setServerStatus(id: number, status: ServerStatus, detail: string | null = null): void {
	db.prepare('UPDATE servers SET status = ?, status_detail = ? WHERE id = ?').run(status, detail, id);
}

export function markSetupDone(id: number): void {
	db.prepare('UPDATE servers SET setup_done = 1 WHERE id = ?').run(id);
}

export function deleteServerRow(id: number): void {
	db.prepare('DELETE FROM servers WHERE id = ?').run(id);
}

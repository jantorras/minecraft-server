import { env } from '$env/dynamic/private';

// Tipus que retorna el plugin Bridge (veure README de l'arrel).

export interface Health {
	ok: boolean;
	bridgeVersion: string;
	server: string;
	onlinePlayers: number;
}

export interface Group {
	name: string;
	displayName: string | null;
	weight: number;
	prefix: string | null;
	suffix: string | null;
	parents: string[];
}

export interface Membership {
	group: string;
	expiresAt: number | null;
}

export interface TagGrant {
	tag: string;
	expiresAt: number | null;
}

export interface Player {
	uuid: string;
	name: string | null;
	online: boolean;
	primaryGroup: string;
	groups: Membership[];
	prefix: string | null;
	suffix: string | null;
	personalPrefix: string | null;
	personalSuffix: string | null;
	tag: string | null;
	unlockedTags: string[];
	tagGrants: TagGrant[];
}

export interface Tag {
	id: string;
	display: string;
	description: string;
	material: string;
}

export interface TabSettings {
	available: boolean;
	header: string[];
	footer: string[];
	groupOrder: string[];
	showTag: boolean;
}

export class BridgeError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
	}
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
	const base = env.BRIDGE_URL || 'http://127.0.0.1:8765';
	let res: Response;
	try {
		res = await fetch(base + path, {
			method,
			headers: {
				Authorization: `Bearer ${env.BRIDGE_TOKEN ?? ''}`,
				'Content-Type': 'application/json'
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		throw new BridgeError(503, 'No es pot connectar amb el servidor de Minecraft. Està encès?');
	}
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		if (res.status === 401) throw new BridgeError(502, 'El token del Bridge no és correcte (BRIDGE_TOKEN)');
		throw new BridgeError(res.status, data.error ?? `Error ${res.status} del Bridge`);
	}
	return data as T;
}

const enc = encodeURIComponent;

export const bridge = {
	health: () => call<Health>('GET', '/api/health'),

	groups: () => call<Group[]>('GET', '/api/groups'),
	group: (name: string) => call<Group>('GET', `/api/groups/${enc(name)}`),
	createGroup: (data: Partial<Group> & { name: string }) => call<Group>('POST', '/api/groups', data),
	updateGroup: (name: string, data: Partial<Omit<Group, 'name'>>) => call<Group>('PATCH', `/api/groups/${enc(name)}`, data),
	deleteGroup: (name: string) => call<void>('DELETE', `/api/groups/${enc(name)}`),

	players: () => call<Player[]>('GET', '/api/players'),
	player: (id: string) => call<Player>('GET', `/api/players/${enc(id)}`),
	setGroup: (id: string, group: string) => call<Player>('PUT', `/api/players/${enc(id)}/group`, { group }),
	addGroup: (id: string, group: string, durationSeconds?: number) =>
		call<Player>('POST', `/api/players/${enc(id)}/groups`, { group, durationSeconds }),
	removeGroup: (id: string, group: string) => call<Player>('DELETE', `/api/players/${enc(id)}/groups/${enc(group)}`),
	setMeta: (id: string, meta: { prefix?: string | null; suffix?: string | null }) =>
		call<Player>('PATCH', `/api/players/${enc(id)}/meta`, meta),

	tags: () => call<Tag[]>('GET', '/api/tags'),
	tag: (id: string) => call<Tag>('GET', `/api/tags/${enc(id)}`),
	createTag: (data: Tag) => call<Tag>('POST', '/api/tags', data),
	updateTag: (id: string, data: Partial<Omit<Tag, 'id'>>) => call<Tag>('PATCH', `/api/tags/${enc(id)}`, data),
	deleteTag: (id: string) => call<void>('DELETE', `/api/tags/${enc(id)}`),

	grantTag: (id: string, tag: string, durationSeconds?: number) =>
		call<Player>('POST', `/api/players/${enc(id)}/tags`, { tag, durationSeconds }),
	revokeTag: (id: string, tag: string) => call<Player>('DELETE', `/api/players/${enc(id)}/tags/${enc(tag)}`),
	selectTag: (id: string, tag: string | null) => call<Player>('PUT', `/api/players/${enc(id)}/tag`, { tag }),

	tab: () => call<TabSettings>('GET', '/api/tab'),
	updateTab: (data: Partial<Omit<TabSettings, 'available'>>) => call<TabSettings>('PATCH', '/api/tab', data),

	effects: () => call<Record<string, string>>('GET', '/api/effects'),
	applyEffect: (id: string, effect: string, durationSeconds: number, amplifier: number) =>
		call<void>('POST', `/api/players/${enc(id)}/effect`, { effect, durationSeconds, amplifier }),
	clearEffects: (id: string) => call<void>('DELETE', `/api/players/${enc(id)}/effect`)
};

import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';

// Gestor de fitxers directe sobre el directori de dades del servidor (bind mount de Docker).
// El panell viu a la mateixa VM, així que no cal cap API intermèdia: fs directe,
// amb el mateix tipus de protecció anti-traversal que feia Crafty abans.

export class McFilesError extends Error {}

export function mcFilesConfigured(): boolean {
	return !!env.MC_DATA_DIR;
}

function root(): string {
	if (!env.MC_DATA_DIR) throw new McFilesError('MC_DATA_DIR no està configurat');
	return path.resolve(env.MC_DATA_DIR);
}

function cleanRel(rel: string): string {
	return rel
		.split('/')
		.filter((p) => p && p !== '.' && p !== '..')
		.join('/');
}

function resolveRel(rel: string): { abs: string; rel: string } {
	const clean = cleanRel(rel);
	const base = root();
	const abs = clean ? path.join(base, clean) : base;
	if (abs !== base && !abs.startsWith(base + path.sep)) throw new McFilesError('Camí no vàlid');
	return { abs, rel: clean };
}

export interface McEntry {
	name: string;
	rel: string;
	dir: boolean;
}

export type McBrowseResult = { kind: 'dir'; rel: string; entries: McEntry[] } | { kind: 'file'; rel: string; contents: string };

export async function mcBrowse(rel = ''): Promise<McBrowseResult> {
	const { abs, rel: cleanedRel } = resolveRel(rel);
	const st = await fs.stat(abs).catch(() => {
		throw new McFilesError('No existeix aquest fitxer o carpeta');
	});
	if (st.isDirectory()) {
		const names = await fs.readdir(abs);
		const entries: McEntry[] = await Promise.all(
			names.map(async (name) => {
				const entryAbs = path.join(abs, name);
				const s = await fs.stat(entryAbs).catch(() => null);
				return { name, rel: cleanedRel ? `${cleanedRel}/${name}` : name, dir: s?.isDirectory() ?? false };
			})
		);
		entries.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
		return { kind: 'dir', rel: cleanedRel, entries };
	}
	const contents = await fs.readFile(abs, 'utf8').catch(() => {
		throw new McFilesError('Aquest fitxer no es pot llegir com a text');
	});
	return { kind: 'file', rel: cleanedRel, contents };
}

export async function mcWriteFile(rel: string, contents: string): Promise<void> {
	const { abs } = resolveRel(rel);
	await fs.writeFile(abs, contents, 'utf8');
}

export async function mcDelete(rel: string): Promise<void> {
	const { abs, rel: cleanedRel } = resolveRel(rel);
	if (!cleanedRel) throw new McFilesError('No es pot esborrar l’arrel');
	await fs.rm(abs, { recursive: true, force: false });
}

export async function mcCreateEntry(parentRel: string, name: string, directory: boolean): Promise<void> {
	if (!name || /[/\\]/.test(name)) throw new McFilesError('Nom invàlid');
	const { abs: parentAbs } = resolveRel(parentRel);
	const target = path.join(parentAbs, name);
	try {
		if (directory) await fs.mkdir(target);
		else await fs.writeFile(target, '', { flag: 'wx' });
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new McFilesError('Ja existeix');
		throw e;
	}
}

export async function mcUpload(dirRel: string, filename: string, data: Buffer): Promise<void> {
	if (/[/\\]/.test(filename)) throw new McFilesError('Nom de fitxer invàlid');
	const { abs: dirAbs } = resolveRel(dirRel);
	await fs.writeFile(path.join(dirAbs, filename), data);
}

/** Llegeix `max-players` de server.properties, sense dependre de cap API. */
export async function mcMaxPlayers(): Promise<number | null> {
	try {
		const raw = await fs.readFile(path.join(root(), 'server.properties'), 'utf8');
		const match = raw.match(/^max-players=(\d+)/m);
		return match ? Number(match[1]) : null;
	} catch {
		return null;
	}
}

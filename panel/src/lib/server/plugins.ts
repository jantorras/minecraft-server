import fs from 'node:fs/promises';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { mcRoot, type McServer } from './servers';

// Els plugins d'un servidor: els .jar de data/plugins/, tant els que hi ha posat el panell
// com els que s'hi hagin copiat a mà. El nom i la versió es llegeixen de dins de cada .jar.

export class PluginsError extends Error {}

const DISABLED = '.disabled';
const FILE_PATTERN = /^[\w.+() -]+\.jar(\.disabled)?$/;

export interface PluginInfo {
	/** Nom del fitxer a plugins/ (acaba en .jar o .jar.disabled). */
	file: string;
	name: string;
	version: string | null;
	description: string | null;
	enabled: boolean;
	sizeKB: number;
	/** Últim canvi del fitxer (pujat, reanomenat...), per saber si cal reiniciar. */
	changedAt: number;
	/** Carpeta de configuració dins de plugins/, si el plugin ja n'ha creat. */
	configDir: string | null;
	/** És al catàleg que es copia als servidors nous? */
	inCatalogue: boolean;
}

function pluginsDir(server: McServer): string {
	if (!server.dataDir) throw new PluginsError('Aquest servidor no té directori de dades');
	return path.join(path.resolve(server.dataDir), 'plugins');
}

function catalogueDir(server: McServer): string | null {
	const root = mcRoot();
	return root && server.managed ? path.join(root, 'plugins', server.type) : null;
}

function resolveFile(server: McServer, file: string): string {
	if (!FILE_PATTERN.test(file)) throw new PluginsError('Nom de plugin invàlid');
	return path.join(pluginsDir(server), file);
}

const jarName = (file: string) => (file.endsWith(DISABLED) ? file.slice(0, -DISABLED.length) : file);

/** Llegeix un fitxer de dins d'un .jar (zip) sense carregar el .jar sencer. */
async function readZipEntry(jar: string, names: string[]): Promise<{ name: string; data: Buffer } | null> {
	const handle = await fs.open(jar, 'r');
	try {
		const { size } = await handle.stat();
		const tailSize = Math.min(size, 65_557);
		const tail = Buffer.alloc(tailSize);
		await handle.read(tail, 0, tailSize, size - tailSize);
		const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
		if (eocd < 0) return null;
		const dirSize = tail.readUInt32LE(eocd + 12);
		const dirOffset = tail.readUInt32LE(eocd + 16);
		if (dirOffset + dirSize > size) return null;
		const dir = Buffer.alloc(dirSize);
		await handle.read(dir, 0, dirSize, dirOffset);

		const found = new Map<string, { method: number; compressed: number; offset: number }>();
		for (let p = 0; p + 46 <= dir.length && dir.readUInt32LE(p) === 0x02014b50; ) {
			const nameLen = dir.readUInt16LE(p + 28);
			const name = dir.toString('utf8', p + 46, p + 46 + nameLen);
			if (names.includes(name)) {
				found.set(name, { method: dir.readUInt16LE(p + 10), compressed: dir.readUInt32LE(p + 20), offset: dir.readUInt32LE(p + 42) });
			}
			p += 46 + nameLen + dir.readUInt16LE(p + 30) + dir.readUInt16LE(p + 32);
		}
		const name = names.find((n) => found.has(n));
		if (!name) return null;
		const entry = found.get(name)!;
		if (entry.compressed > 1024 * 1024) return null;

		const local = Buffer.alloc(30);
		await handle.read(local, 0, 30, entry.offset);
		const start = entry.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
		const raw = Buffer.alloc(entry.compressed);
		await handle.read(raw, 0, entry.compressed, start);
		return { name, data: entry.method === 0 ? raw : inflateRawSync(raw) };
	} finally {
		await handle.close();
	}
}

/** Clau de primer nivell d'un plugin.yml; n'hi ha prou amb això, sense un parser de YAML. */
function yamlKey(text: string, key: string): string | null {
	const match = text.match(new RegExp(`^${key}:[ \\t]*(.+?)[ \\t]*$`, 'm'));
	return match ? match[1].replace(/^(['"])(.*)\1$/, '$2') : null;
}

type Meta = { name: string | null; version: string | null; description: string | null };

// Obrir cada .jar a cada visita és car: es recorda el resultat mentre el fitxer no canviï.
const metaCache = new Map<string, { size: number; mtimeMs: number; meta: Meta }>();

async function cachedMeta(jar: string, stat: { size: number; mtimeMs: number }): Promise<Meta> {
	const hit = metaCache.get(jar);
	if (hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs) return hit.meta;
	const meta = await readMeta(jar);
	metaCache.set(jar, { size: stat.size, mtimeMs: stat.mtimeMs, meta });
	return meta;
}

async function readMeta(jar: string): Promise<Meta> {
	const none = { name: null, version: null, description: null };
	try {
		const entry = await readZipEntry(jar, ['paper-plugin.yml', 'plugin.yml', 'velocity-plugin.json']);
		if (!entry) return none;
		const text = entry.data.toString('utf8');
		if (entry.name.endsWith('.json')) {
			const json = JSON.parse(text) as { id?: string; name?: string; version?: string; description?: string };
			return { name: json.name ?? json.id ?? null, version: json.version ?? null, description: json.description ?? null };
		}
		return { name: yamlKey(text, 'name'), version: yamlKey(text, 'version'), description: yamlKey(text, 'description') };
	} catch {
		// Un .jar que no es pot llegir es llista igualment, pel nom del fitxer.
		return none;
	}
}

export async function listPlugins(server: McServer): Promise<PluginInfo[]> {
	const dir = pluginsDir(server);
	const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
	const dirs = new Map(entries.filter((e) => e.isDirectory()).map((e) => [e.name.toLowerCase(), e.name]));
	const catalogue = catalogueDir(server);
	const inCatalogue = new Set(catalogue ? await fs.readdir(catalogue).catch(() => []) : []);

	const plugins = await Promise.all(
		entries
			.filter((e) => e.isFile() && /\.jar(\.disabled)?$/.test(e.name))
			.map(async (e): Promise<PluginInfo> => {
				const abs = path.join(dir, e.name);
				const stat = await fs.stat(abs);
				const meta = await cachedMeta(abs, stat);
				const name = meta.name ?? jarName(e.name).replace(/\.jar$/, '');
				return {
					file: e.name,
					name,
					version: meta.version,
					description: meta.description,
					enabled: !e.name.endsWith(DISABLED),
					sizeKB: Math.round(stat.size / 1024),
					changedAt: Math.max(stat.mtimeMs, stat.ctimeMs),
					configDir: dirs.get(name.toLowerCase()) ?? null,
					inCatalogue: inCatalogue.has(jarName(e.name))
				};
			})
	);
	return plugins.sort((a, b) => a.name.localeCompare(b.name, 'ca', { sensitivity: 'base' }));
}

export async function uploadPlugin(server: McServer, filename: string, data: Buffer): Promise<void> {
	if (!/\.jar$/.test(filename)) throw new PluginsError('Ha de ser un fitxer .jar');
	const target = resolveFile(server, filename);
	await fs.mkdir(path.dirname(target), { recursive: true });
	await fs.writeFile(target, data);
	// Si n'hi havia una còpia desactivada amb el mateix nom, la nova la substitueix.
	await fs.rm(target + DISABLED, { force: true });
}

/** Activa o desactiva un plugin reanomenant-ne el .jar. Retorna el nom nou del fitxer. */
export async function setPluginEnabled(server: McServer, file: string, enabled: boolean): Promise<string> {
	const from = resolveFile(server, file);
	const renamed = enabled ? jarName(file) : jarName(file) + DISABLED;
	if (renamed === file) return file;
	try {
		await fs.rename(from, resolveFile(server, renamed));
	} catch {
		throw new PluginsError('No existeix aquest plugin');
	}
	return renamed;
}

/** Esborra el .jar. La carpeta de configuració del plugin es deixa on és. */
export async function deletePlugin(server: McServer, file: string): Promise<void> {
	try {
		await fs.rm(resolveFile(server, file));
	} catch (e) {
		if (e instanceof PluginsError) throw e;
		throw new PluginsError('No existeix aquest plugin');
	}
}

/** Posa o treu un plugin del catàleg que es copia als servidors nous del mateix tipus. */
export async function setInCatalogue(server: McServer, file: string, wanted: boolean): Promise<void> {
	const catalogue = catalogueDir(server);
	if (!catalogue) throw new PluginsError('Aquest servidor no té catàleg de plugins');
	const source = resolveFile(server, file);
	const target = path.join(catalogue, jarName(file));
	if (!wanted) return fs.rm(target, { force: true });
	await fs.mkdir(catalogue, { recursive: true });
	await fs.copyFile(source, target).catch(() => {
		throw new PluginsError('No s’ha pogut copiar el plugin al catàleg');
	});
}

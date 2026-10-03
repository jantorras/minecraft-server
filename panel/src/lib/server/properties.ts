import fs from 'node:fs/promises';
import path from 'node:path';
import type { DIFFICULTIES, GAMEMODES, GameSettings } from '$lib/servers';
import { normalizeMotd } from '$lib/mc';
import type { McServer } from './servers';

// Lectura de server.properties, per mostrar al formulari de configuració el valor que el
// servidor fa servir de debò quan el panell encara no n'ha fixat cap.

async function readProperties(server: McServer): Promise<Map<string, string>> {
	const values = new Map<string, string>();
	if (!server.dataDir) return values;
	const raw = await fs.readFile(path.join(server.dataDir, 'server.properties'), 'utf8').catch(() => '');
	for (const line of raw.split(/\r?\n/)) {
		const match = /^([^#!=\s][^=]*)=(.*)$/.exec(line);
		if (!match) continue;
		const value = match[2]
			.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
			.replace(/\\n/g, '\n')
			.replace(/\\(.)/g, '$1');
		values.set(match[1].trim(), value);
	}
	return values;
}

/** Les opcions tal com queden: les fixades al panell i, per a la resta, les del servidor. */
export async function effectiveSettings(server: McServer): Promise<Required<GameSettings>> {
	const file = await readProperties(server);
	const s = server.settings;
	const text = (key: string, fallback: string) => file.get(key) ?? fallback;
	const number = (key: string, fallback: number) => (Number.isFinite(Number(file.get(key))) && file.has(key) ? Number(file.get(key)) : fallback);
	const flag = (key: string, fallback: boolean) => (file.has(key) ? file.get(key) === 'true' : fallback);
	return {
		motd: normalizeMotd(s.motd ?? text('motd', server.name)),
		maxPlayers: s.maxPlayers ?? number('max-players', 20),
		difficulty: s.difficulty ?? (text('difficulty', 'easy') as (typeof DIFFICULTIES)[number]),
		gamemode: s.gamemode ?? (text('gamemode', 'survival') as (typeof GAMEMODES)[number]),
		pvp: s.pvp ?? flag('pvp', true),
		hardcore: s.hardcore ?? flag('hardcore', false),
		whitelist: s.whitelist ?? flag('white-list', false),
		allowFlight: s.allowFlight ?? flag('allow-flight', false),
		allowNether: s.allowNether ?? flag('allow-nether', true),
		viewDistance: s.viewDistance ?? number('view-distance', 10),
		simulationDistance: s.simulationDistance ?? number('simulation-distance', 10),
		spawnProtection: s.spawnProtection ?? number('spawn-protection', 16)
	};
}

/** El missatge i el màxim de jugadors que un proxy ensenya a la llista de servidors. */
export async function effectiveProxySettings(server: McServer): Promise<{ motd: string; maxPlayers: number }> {
	const raw = server.dataDir ? await fs.readFile(path.join(server.dataDir, 'velocity.toml'), 'utf8').catch(() => '') : '';
	let motd = server.name;
	const line = /^motd\s*=\s*(".*")\s*$/m.exec(raw)?.[1];
	if (line) {
		try {
			motd = JSON.parse(line) as string;
		} catch {
			// Una cadena TOML que no és JSON vàlid: es deixa el nom.
		}
	}
	const max = Number(/^show-max-players\s*=\s*(\d+)/m.exec(raw)?.[1] ?? 100);
	return { motd: normalizeMotd(server.settings.motd ?? motd), maxPlayers: server.settings.maxPlayers ?? max };
}

/** Quan es va canviar la imatge del servidor (server-icon.png), o null si no en té. */
export async function iconVersion(server: McServer): Promise<number | null> {
	if (!server.dataDir) return null;
	return fs.stat(path.join(server.dataDir, 'server-icon.png')).then(
		(stat) => Math.round(stat.mtimeMs),
		() => null
	);
}

/** Desa la imatge del servidor. Ha de ser un PNG de 64×64, que és el que accepta el joc. */
export async function writeIcon(server: McServer, png: Buffer): Promise<string | null> {
	if (!server.dataDir) return 'Aquest servidor no té directori de dades';
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	if (png.length < 24 || !png.subarray(0, 8).equals(signature)) return 'La imatge ha de ser un PNG';
	if (png.readUInt32BE(16) !== 64 || png.readUInt32BE(20) !== 64) return 'La imatge ha de fer 64×64 píxels';
	if (png.length > 512 * 1024) return 'La imatge pesa massa';
	await fs.writeFile(path.join(server.dataDir, 'server-icon.png'), png);
	return null;
}

export async function removeIcon(server: McServer): Promise<void> {
	if (server.dataDir) await fs.rm(path.join(server.dataDir, 'server-icon.png'), { force: true });
}


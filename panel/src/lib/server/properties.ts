import fs from 'node:fs/promises';
import path from 'node:path';
import type { DIFFICULTIES, GAMEMODES, GameSettings } from '$lib/servers';
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
		const value = match[2].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/\\(.)/g, '$1');
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
		motd: s.motd ?? text('motd', server.name),
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

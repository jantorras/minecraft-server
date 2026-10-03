import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { McServer } from './servers';
import { dockerStatus } from './docker';
import { rconCommand, rconConfigured } from './rcon';

const execFileAsync = promisify(execFile);

export class BackupError extends Error {}

// Paper i Velocity: es copia el que existeixi de la llista.
const ENTRIES = [
	'world',
	'world_nether',
	'world_the_end',
	'velocity.toml',
	'forwarding.secret',
	'plugins',
	'config',
	'server.properties',
	'ops.json',
	'whitelist.json',
	'banned-ips.json',
	'banned-players.json',
	'usercache.json',
	'bukkit.yml',
	'spigot.yml',
	'commands.yml',
	'eula.txt'
];

export function backupConfigured(server: McServer): boolean {
	return !!(server.dataDir && server.backupsDir);
}

export async function createBackup(server: McServer): Promise<string> {
	if (!backupConfigured(server)) throw new BackupError('Aquest servidor no té directori de dades o de còpies');
	const dataDir = server.dataDir!;
	const backupsDir = server.backupsDir!;
	await fs.mkdir(backupsDir, { recursive: true });

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const file = path.join(backupsDir, `backup-${stamp}.tar.gz`);
	const existing = await Promise.all(ENTRIES.map((e) => fs.stat(path.join(dataDir, e)).then(() => e).catch(() => null)));
	const args = ['czf', file, '-C', dataDir, ...existing.filter((e): e is string => e !== null)];

	// Només els servidors amb RCON (Paper) tenen un món que calgui deixar de desar mentre es copia.
	const live = rconConfigured(server) && (await dockerStatus(server)).running;
	try {
		if (live) {
			await rconCommand(server, 'save-off');
			await rconCommand(server, 'save-all');
		}
		await execFileAsync('tar', args);
	} catch (e) {
		throw new BackupError(`No s’ha pogut crear la còpia: ${(e as Error).message}`);
	} finally {
		if (live) await rconCommand(server, 'save-on').catch(() => {});
	}
	return path.basename(file);
}

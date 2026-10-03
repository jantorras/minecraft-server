import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { dockerStatus } from './docker';
import { rconCommand } from './rcon';

const execFileAsync = promisify(execFile);

export class BackupError extends Error {}

const ENTRIES = [
	'world',
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

export function backupConfigured(): boolean {
	return !!(env.MC_DATA_DIR && env.MC_BACKUPS_DIR);
}

export async function createBackup(): Promise<string> {
	if (!backupConfigured()) throw new BackupError('MC_DATA_DIR / MC_BACKUPS_DIR no configurats');
	const dataDir = env.MC_DATA_DIR!;
	const backupsDir = env.MC_BACKUPS_DIR!;
	await fs.mkdir(backupsDir, { recursive: true });

	const stamp = new Date().toISOString().replace(/[:.]/g, '-');
	const file = path.join(backupsDir, `backup-${stamp}.tar.gz`);
	const existing = await Promise.all(ENTRIES.map((e) => fs.stat(path.join(dataDir, e)).then(() => e).catch(() => null)));
	const args = ['czf', file, '-C', dataDir, ...existing.filter((e): e is string => e !== null)];

	const { running } = await dockerStatus();
	try {
		if (running) {
			await rconCommand('save-off');
			await rconCommand('save-all');
		}
		await execFileAsync('tar', args);
	} catch (e) {
		throw new BackupError(`No s’ha pogut crear la còpia: ${(e as Error).message}`);
	} finally {
		if (running) await rconCommand('save-on').catch(() => {});
	}
	return path.basename(file);
}

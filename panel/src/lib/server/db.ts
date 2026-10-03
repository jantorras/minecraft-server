import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env } from '$env/dynamic/private';

const path = env.DATABASE_PATH || 'data/panel.db';
mkdirSync(dirname(path), { recursive: true });

export const db = new Database(path);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id            INTEGER PRIMARY KEY AUTOINCREMENT,
		username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		role          TEXT NOT NULL CHECK (role IN ('mod', 'admin', 'owner')),
		disabled      INTEGER NOT NULL DEFAULT 0,
		created_at    INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS sessions (
		token_hash TEXT PRIMARY KEY,
		user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS audit (
		id       INTEGER PRIMARY KEY AUTOINCREMENT,
		at       INTEGER NOT NULL,
		user_id  INTEGER,
		username TEXT NOT NULL,
		action   TEXT NOT NULL,
		target   TEXT NOT NULL,
		details  TEXT
	);
	CREATE INDEX IF NOT EXISTS audit_at ON audit(at DESC);

	CREATE TABLE IF NOT EXISTS servers (
		id                INTEGER PRIMARY KEY AUTOINCREMENT,
		slug              TEXT NOT NULL UNIQUE,
		name              TEXT NOT NULL,
		type              TEXT NOT NULL CHECK (type IN ('paper', 'velocity')),
		version           TEXT NOT NULL,
		memory            TEXT NOT NULL,
		host_port         INTEGER UNIQUE,
		proxy_id          INTEGER REFERENCES servers(id) ON DELETE SET NULL,
		rcon_password     TEXT,
		bridge_token      TEXT,
		forwarding_secret TEXT,
		status            TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'ready', 'error')),
		status_detail     TEXT,
		created_at        INTEGER NOT NULL
	);
`);

// Columnes afegides després de la primera versió de la taula.
const serverColumns = new Set((db.prepare('PRAGMA table_info(servers)').all() as { name: string }[]).map((c) => c.name));
for (const [name, ddl] of [
	['world_type', "TEXT NOT NULL DEFAULT 'normal'"],
	['platform_size', 'INTEGER'],
	['pregen_radius', 'INTEGER'],
	['setup_done', 'INTEGER NOT NULL DEFAULT 0']
]) {
	if (!serverColumns.has(name)) db.exec(`ALTER TABLE servers ADD COLUMN ${name} ${ddl}`);
}

// Una creació que estava a mitges quan el panell es va aturar no continuarà sola.
db.prepare("UPDATE servers SET status = 'error', status_detail = ? WHERE status = 'creating'").run(
	'El panell es va reiniciar mentre es creava. Torna-ho a provar.'
);

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
`);

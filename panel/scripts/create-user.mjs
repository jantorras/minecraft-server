// Crea (o actualitza) un usuari del panell des de la línia d'ordres.
// Ús: npm run create-user -- <usuari> <owner|admin|mod>
// La contrasenya es demana per consola (no queda a l'historial).
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const [username, role = 'owner'] = process.argv.slice(2);
if (!username || !['owner', 'admin', 'mod'].includes(role)) {
	console.error('Ús: npm run create-user -- <usuari> <owner|admin|mod>');
	process.exit(1);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const password = process.env.PANEL_PASSWORD ?? (await rl.question('Contrasenya (mínim 10 caràcters): '));
rl.close();
if (password.length < 10) {
	console.error('La contrasenya ha de tenir com a mínim 10 caràcters.');
	process.exit(1);
}

// Mateix format que src/lib/server/auth.ts
const N = 16384, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p });
const passwordHash = ['scrypt', N, r, p, salt.toString('base64'), hash.toString('base64')].join('$');

const path = process.env.DATABASE_PATH || 'data/panel.db';
mkdirSync(dirname(path), { recursive: true });
const db = new Database(path);
// Mateixa definició que src/lib/server/db.ts
db.exec(`CREATE TABLE IF NOT EXISTS users (
	id            INTEGER PRIMARY KEY AUTOINCREMENT,
	username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
	password_hash TEXT NOT NULL,
	role          TEXT NOT NULL CHECK (role IN ('mod', 'admin', 'owner')),
	disabled      INTEGER NOT NULL DEFAULT 0,
	created_at    INTEGER NOT NULL
)`);

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
	db.prepare('UPDATE users SET password_hash = ?, role = ?, disabled = 0 WHERE id = ?').run(passwordHash, role, existing.id);
	console.log(`Usuari ${username} actualitzat (${role}).`);
} else {
	db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run(
		username,
		passwordHash,
		role,
		Date.now()
	);
	console.log(`Usuari ${username} creat (${role}).`);
}

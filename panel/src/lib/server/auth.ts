import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db';
import type { PanelUser, Role } from '$lib/roles';

const scrypt = promisify(scryptCb) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SESSION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export const SESSION_COOKIE = 'panel_session';
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;
export const MIN_PASSWORD_LENGTH = 10;

// ---- Contrasenyes (format: scrypt$N$r$p$salt$hash, en base64) ----

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scrypt(password, salt, KEY_LENGTH, SCRYPT);
	return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [kind, n, r, p, salt, hash] = stored.split('$');
	if (kind !== 'scrypt' || !salt || !hash) return false;
	const expected = Buffer.from(hash, 'base64');
	const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
		N: Number(n),
		r: Number(r),
		p: Number(p)
	});
	return timingSafeEqual(actual, expected);
}

// Hash fals per igualar el temps de resposta quan l'usuari no existeix.
let dummyHash: Promise<string> | undefined;

// ---- Usuaris ----

interface UserRow {
	id: number;
	username: string;
	role: Role;
	password_hash: string;
	disabled: number;
}

export async function checkLogin(username: string, password: string): Promise<PanelUser | null> {
	const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
	dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
	const ok = await verifyPassword(password, row?.password_hash ?? (await dummyHash));
	if (!row || !ok || row.disabled) return null;
	return { id: row.id, username: row.username, role: row.role };
}

// ---- Sessions (a la BD només es desa el hash del token) ----

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(userId: number): string {
	const token = randomBytes(32).toString('base64url');
	db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
		hashToken(token),
		userId,
		Date.now() + SESSION_DAYS * DAY_MS
	);
	return token;
}

/** Retorna l'usuari de la sessió; renova la sessió si li queden menys de 15 dies. */
export function validateSession(token: string): { user: PanelUser; renewed: boolean } | null {
	const tokenHash = hashToken(token);
	const row = db
		.prepare(
			`SELECT s.expires_at, u.id, u.username, u.role FROM sessions s
			 JOIN users u ON u.id = s.user_id
			 WHERE s.token_hash = ? AND u.disabled = 0`
		)
		.get(tokenHash) as { expires_at: number; id: number; username: string; role: Role } | undefined;
	if (!row) return null;

	const now = Date.now();
	if (row.expires_at < now) {
		db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
		return null;
	}
	const renewed = row.expires_at - now < (SESSION_DAYS / 2) * DAY_MS;
	if (renewed) {
		db.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(now + SESSION_DAYS * DAY_MS, tokenHash);
	}
	return { user: { id: row.id, username: row.username, role: row.role }, renewed };
}

export function deleteSession(token: string) {
	db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function deleteUserSessions(userId: number, exceptToken?: string) {
	if (exceptToken) {
		db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, hashToken(exceptToken));
	} else {
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
	}
}

// ---- Límit d'intents de login (en memòria) ----

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; until: number }>();

export function isLocked(key: string): boolean {
	const entry = attempts.get(key);
	if (!entry) return false;
	if (entry.until < Date.now()) {
		attempts.delete(key);
		return false;
	}
	return entry.count >= MAX_ATTEMPTS;
}

export function recordFailure(key: string) {
	const entry = attempts.get(key);
	if (!entry || entry.until < Date.now()) {
		attempts.set(key, { count: 1, until: Date.now() + LOCK_MS });
	} else {
		entry.count++;
	}
}

export function clearFailures(key: string) {
	attempts.delete(key);
}

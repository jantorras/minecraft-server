import { db } from './db';
import type { PanelUser } from '$lib/roles';

export interface AuditEntry {
	id: number;
	at: number;
	username: string;
	action: string;
	target: string;
	details: string | null;
}

export function audit(user: PanelUser, action: string, target: string, details?: unknown) {
	db.prepare('INSERT INTO audit (at, user_id, username, action, target, details) VALUES (?, ?, ?, ?, ?, ?)').run(
		Date.now(),
		user.id,
		user.username,
		action,
		target,
		details === undefined ? null : JSON.stringify(details)
	);
}

export function listAudit(limit = 200): AuditEntry[] {
	return db
		.prepare('SELECT id, at, username, action, target, details FROM audit ORDER BY at DESC, id DESC LIMIT ?')
		.all(limit) as AuditEntry[];
}

import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { MIN_PASSWORD_LENGTH, deleteUserSessions, hashPassword } from '$lib/server/auth';
import { field, requireRole } from '$lib/server/actions';
import { isRole, type Role } from '$lib/roles';
import type { Actions, PageServerLoad } from './$types';

interface UserRow {
	id: number;
	username: string;
	role: Role;
	disabled: number;
	created_at: number;
}

export const load: PageServerLoad = ({ locals }) => {
	requireRole(locals, 'owner');
	const users = db.prepare('SELECT id, username, role, disabled, created_at FROM users ORDER BY username').all() as UserRow[];
	return { users };
};

function getUser(id: number): UserRow | undefined {
	return db.prepare('SELECT id, username, role, disabled, created_at FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

/** Evita quedar-se sense cap owner actiu. */
function isLastOwner(id: number): boolean {
	const { n } = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner' AND disabled = 0 AND id != ?").get(id) as {
		n: number;
	};
	return n === 0;
}

/** Valida l'usuari objectiu: existeix i no és un mateix. */
function target(form: FormData, selfId: number): UserRow | { error: string } {
	const user = getUser(Number(field(form, 'id')));
	if (!user) return { error: 'Aquest usuari no existeix' };
	if (user.id === selfId) return { error: 'No et pots modificar a tu mateix des d’aquí (fes-ho des de «El meu compte»)' };
	return user;
}

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const me = requireRole(locals, 'owner');
		const form = await request.formData();
		const username = field(form, 'username');
		const password = String(form.get('password') ?? '');
		const role = field(form, 'role');

		if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username)) {
			return fail(400, { error: 'El nom d’usuari ha de tenir 3-32 caràcters (lletres, números, _ . -)' });
		}
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { error: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters` });
		}
		if (!isRole(role)) return fail(400, { error: 'Rol invàlid' });
		if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
			return fail(409, { error: `L’usuari ${username} ja existeix` });
		}
		db.prepare('INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)').run(
			username,
			await hashPassword(password),
			role,
			Date.now()
		);
		audit(me, 'Crear usuari del panell', username, { role });
		return { success: `Usuari ${username} creat` };
	},

	setRole: async ({ request, locals }) => {
		const me = requireRole(locals, 'owner');
		const form = await request.formData();
		const user = target(form, me.id);
		if ('error' in user) return fail(400, user);
		const role = field(form, 'role');
		if (!isRole(role)) return fail(400, { error: 'Rol invàlid' });
		if (user.role === 'owner' && role !== 'owner' && isLastOwner(user.id)) {
			return fail(400, { error: 'Ha de quedar almenys un owner' });
		}
		db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
		audit(me, 'Canviar rol del panell', user.username, { from: user.role, to: role });
		return { success: `${user.username} ara és ${role}` };
	},

	resetPassword: async ({ request, locals }) => {
		const me = requireRole(locals, 'owner');
		const form = await request.formData();
		const user = target(form, me.id);
		if ('error' in user) return fail(400, user);
		const password = String(form.get('password') ?? '');
		if (password.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { error: `La contrasenya ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters` });
		}
		db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(password), user.id);
		deleteUserSessions(user.id);
		audit(me, 'Restablir contrasenya', user.username);
		return { success: `Contrasenya de ${user.username} canviada` };
	},

	toggleDisabled: async ({ request, locals }) => {
		const me = requireRole(locals, 'owner');
		const user = target(await request.formData(), me.id);
		if ('error' in user) return fail(400, user);
		const disable = !user.disabled;
		if (disable && user.role === 'owner' && isLastOwner(user.id)) {
			return fail(400, { error: 'Ha de quedar almenys un owner actiu' });
		}
		db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disable ? 1 : 0, user.id);
		if (disable) deleteUserSessions(user.id);
		audit(me, disable ? 'Desactivar usuari' : 'Activar usuari', user.username);
		return { success: `${user.username} ${disable ? 'desactivat' : 'activat'}` };
	},

	delete: async ({ request, locals }) => {
		const me = requireRole(locals, 'owner');
		const user = target(await request.formData(), me.id);
		if ('error' in user) return fail(400, user);
		if (user.role === 'owner' && isLastOwner(user.id)) {
			return fail(400, { error: 'Ha de quedar almenys un owner' });
		}
		db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
		audit(me, 'Esborrar usuari del panell', user.username);
		return { success: `Usuari ${user.username} esborrat` };
	}
};

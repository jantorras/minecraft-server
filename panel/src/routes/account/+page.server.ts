import { fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import {
	MIN_PASSWORD_LENGTH,
	SESSION_COOKIE,
	deleteUserSessions,
	hashPassword,
	verifyPassword
} from '$lib/server/auth';
import { requireRole } from '$lib/server/actions';
import type { Actions } from './$types';

export const actions: Actions = {
	password: async ({ request, locals, cookies }) => {
		const user = requireRole(locals, 'mod');
		const form = await request.formData();
		const current = String(form.get('current') ?? '');
		const next = String(form.get('next') ?? '');
		const confirm = String(form.get('confirm') ?? '');

		const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id) as { password_hash: string };
		if (!(await verifyPassword(current, row.password_hash))) {
			return fail(400, { error: 'La contrasenya actual no és correcta' });
		}
		if (next.length < MIN_PASSWORD_LENGTH) {
			return fail(400, { error: `La nova contrasenya ha de tenir com a mínim ${MIN_PASSWORD_LENGTH} caràcters` });
		}
		if (next !== confirm) {
			return fail(400, { error: 'Les contrasenyes no coincideixen' });
		}
		db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(next), user.id);
		deleteUserSessions(user.id, cookies.get(SESSION_COOKIE));
		audit(user, 'Canviar contrasenya', user.username);
		return { success: 'Contrasenya canviada. S’han tancat les altres sessions.' };
	}
};

import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	checkLogin,
	clearFailures,
	createSession,
	isLocked,
	recordFailure
} from '$lib/server/auth';
import { field } from '$lib/server/actions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};

export const actions: Actions = {
	default: async ({ request, cookies, url, getClientAddress }) => {
		const form = await request.formData();
		const username = field(form, 'username');
		const password = typeof form.get('password') === 'string' ? (form.get('password') as string) : '';
		const key = `${getClientAddress()}|${username.toLowerCase()}`;

		if (isLocked(key)) {
			return fail(429, { username, error: 'Massa intents. Torna-ho a provar d’aquí a 15 minuts.' });
		}
		const user = username && password ? await checkLogin(username, password) : null;
		if (!user) {
			recordFailure(key);
			return fail(400, { username, error: 'Usuari o contrasenya incorrectes' });
		}
		clearFailures(key);

		cookies.set(SESSION_COOKIE, createSession(user.id), {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: SESSION_MAX_AGE
		});
		redirect(303, '/');
	}
};

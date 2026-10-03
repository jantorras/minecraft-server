import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => redirect(303, '/');

export const actions: Actions = {
	default: ({ cookies }) => {
		const token = cookies.get(SESSION_COOKIE);
		if (token) deleteSession(token);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login');
	}
};

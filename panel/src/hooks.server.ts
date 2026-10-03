import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_MAX_AGE, validateSession } from '$lib/server/auth';
import { resolveCurrentServer } from '$lib/server/servers';
import { SERVER_COOKIE } from '$lib/servers';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;
	event.locals.server = null;

	const token = event.cookies.get(SESSION_COOKIE);
	if (token) {
		const session = validateSession(token);
		if (session) {
			event.locals.user = session.user;
			if (session.renewed) {
				event.cookies.set(SESSION_COOKIE, token, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					secure: event.url.protocol === 'https:',
					maxAge: SESSION_MAX_AGE
				});
			}
		} else {
			event.cookies.delete(SESSION_COOKIE, { path: '/' });
		}
	}

	if (!event.locals.user && !PUBLIC_PATHS.includes(event.url.pathname)) {
		redirect(303, '/login');
	}

	event.locals.server = resolveCurrentServer(event.cookies.get(SERVER_COOKIE));

	const response = await resolve(event);
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	return response;
};

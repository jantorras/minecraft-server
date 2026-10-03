import { error, json } from '@sveltejs/kit';
import { hasRole } from '$lib/roles';
import { DockerError, dockerLogs, dockerStatsCached } from '$lib/server/docker';
import type { RequestHandler } from './$types';

// El que la pàgina «Servidor» va demanant: CPU i memòria per a tothom, i per als admins
// les línies noves de la consola (xat inclòs) des de l'última que ja tenen (`since`).
export const GET: RequestHandler = async ({ locals, url }) => {
	const server = locals.server;
	if (!server?.container) error(400, 'No hi ha cap servidor triat');
	const stats = dockerStatsCached(server);
	if (!hasRole(locals.user, 'admin')) return json({ stats, lines: [], last: null });
	try {
		return json({ stats, ...(await dockerLogs(server, { since: url.searchParams.get('since') })) });
	} catch (e) {
		if (e instanceof DockerError) error(502, e.message);
		throw e;
	}
};

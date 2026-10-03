import { error, json } from '@sveltejs/kit';
import { requireRole } from '$lib/server/actions';
import { DockerError, dockerLogs } from '$lib/server/docker';
import type { RequestHandler } from './$types';

// La consola del servidor triat (xat inclòs), que la pàgina «Servidor» va demanant.
export const GET: RequestHandler = async ({ locals }) => {
	requireRole(locals, 'admin');
	if (!locals.server?.container) error(400, 'No hi ha cap servidor triat');
	try {
		return json({ lines: await dockerLogs(locals.server) });
	} catch (e) {
		if (e instanceof DockerError) error(502, e.message);
		throw e;
	}
};

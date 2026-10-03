import fs from 'node:fs/promises';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { requireRole } from '$lib/server/actions';
import type { RequestHandler } from './$types';

// La imatge del servidor triat (server-icon.png), per a la vista prèvia de la pàgina «Opcions».
export const GET: RequestHandler = async ({ locals }) => {
	requireRole(locals, 'admin');
	const dir = locals.server?.dataDir;
	if (!dir) error(404, 'Sense imatge');
	const png = await fs.readFile(path.join(dir, 'server-icon.png')).catch(() => null);
	if (!png) error(404, 'Sense imatge');
	return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' } });
};

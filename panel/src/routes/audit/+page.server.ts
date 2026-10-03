import { listAudit } from '$lib/server/audit';
import { bridge } from '$lib/server/bridge';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Noms dels jugadors per mostrar-los en lloc de l'UUID (si el Bridge respon).
	const names: Record<string, string> = {};
	try {
		for (const p of await bridge.players()) {
			if (p.name) names[p.uuid] = p.name;
		}
	} catch {
		// Sense connexió: es mostren els UUID.
	}
	return { entries: listAudit(500), names };
};

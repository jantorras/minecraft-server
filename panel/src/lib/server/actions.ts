import { error, fail } from '@sveltejs/kit';
import { hasRole, type PanelUser, type Role } from '$lib/roles';
import { audit } from './audit';
import { BridgeError } from './bridge';

export function requireRole(locals: App.Locals, role: Role): PanelUser {
	if (!hasRole(locals.user, role)) {
		error(403, 'No tens permís per fer això');
	}
	return locals.user!;
}

export function field(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
}

/** Dies d'un camp numèric → segons. Buit = permanent (undefined). */
export function durationField(form: FormData, key: string): number | undefined {
	const raw = field(form, key);
	if (!raw) return undefined;
	const days = Number(raw);
	if (!Number.isFinite(days) || days <= 0) throw new BridgeError(400, 'La durada ha de ser un nombre de dies positiu');
	return Math.round(days * 86400);
}

/**
 * Executa una acció del Bridge amb control de permisos i registre d'auditoria.
 * Retorna { success } o un fail() amb el missatge d'error per al formulari.
 */
export async function bridgeAction(
	locals: App.Locals,
	opts: { role?: Role; action: string; target: string; success: string },
	run: () => Promise<unknown>
) {
	const user = requireRole(locals, opts.role ?? 'admin');
	try {
		const details = await run();
		audit(user, opts.action, opts.target, details ?? undefined);
		return { success: opts.success };
	} catch (e) {
		if (e instanceof BridgeError) {
			return fail(e.status >= 500 ? 502 : 400, { error: e.message });
		}
		throw e;
	}
}

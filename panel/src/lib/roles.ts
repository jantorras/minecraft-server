export type Role = 'mod' | 'admin' | 'owner';

export const ROLES: Role[] = ['mod', 'admin', 'owner'];

export const ROLE_LABELS: Record<Role, string> = {
	mod: 'Moderador (només lectura)',
	admin: 'Admin',
	owner: 'Owner'
};

const RANK: Record<Role, number> = { mod: 1, admin: 2, owner: 3 };

export interface PanelUser {
	id: number;
	username: string;
	role: Role;
}

/** mod = veure, admin = gestionar el joc, owner = a més, gestionar usuaris del panell. */
export function hasRole(user: PanelUser | null | undefined, role: Role): boolean {
	return !!user && RANK[user.role] >= RANK[role];
}

export function isRole(value: string): value is Role {
	return (ROLES as string[]).includes(value);
}

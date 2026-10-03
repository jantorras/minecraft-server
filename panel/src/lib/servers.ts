// Constants dels servidors compartides entre client i servidor.

/** Cookie amb l'id del servidor triat al selector. */
export const SERVER_COOKIE = 'server';

export const TYPE_LABELS = {
	paper: 'Normal (Paper)',
	velocity: 'Proxy (Velocity)'
} as const;

export const STATUS_LABELS = {
	creating: 'Creant…',
	ready: 'A punt',
	error: 'Error'
} as const;

/** Passos de la creació d'un servidor, en ordre. */
export const PROVISION_STEPS = ['files', 'image', 'container', 'boot', 'groups', 'proxy'] as const;
export type ProvisionStep = (typeof PROVISION_STEPS)[number];

export const STEP_LABELS: Record<ProvisionStep, string> = {
	files: 'Preparant la carpeta, la configuració i els plugins',
	image: 'Baixant la imatge de Docker',
	container: 'Creant el contenidor',
	boot: 'Arrencant el servidor per primer cop',
	groups: 'Creant els rols base (LuckPerms)',
	proxy: 'Connectant-lo amb el proxy'
};

export const DEFAULTS = {
	paper: { version: 'LATEST', memory: '3G' },
	velocity: { version: 'LATEST', memory: '512M', hostPort: 25565 }
} as const;

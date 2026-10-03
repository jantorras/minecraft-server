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
export const PROVISION_STEPS = ['files', 'image', 'container', 'boot', 'groups', 'world', 'proxy'] as const;
export type ProvisionStep = (typeof PROVISION_STEPS)[number];

export const STEP_LABELS: Record<ProvisionStep, string> = {
	files: 'Preparant la carpeta, la configuració i els plugins',
	image: 'Baixant la imatge de Docker',
	container: 'Creant el contenidor',
	boot: 'Arrencant el servidor per primer cop',
	groups: 'Creant els rols base (LuckPerms)',
	world: 'Preparant el món',
	proxy: 'Connectant-lo amb el proxy'
};

/** Com és el món d'un servidor normal. Només es pot triar en crear-lo. */
export type WorldType = 'normal' | 'flat' | 'void';

export const WORLD_LABELS: Record<WorldType, string> = {
	normal: 'Món normal',
	flat: 'Món pla',
	void: 'Buit amb una plataforma'
};

export const PLATFORM = { min: 1, max: 64, default: 10 } as const;
/** Radi (en blocs) que Chunky pot generar per endavant en crear el servidor. */
export const PREGEN = { min: 100, max: 20000, presets: [1000, 2000, 3000, 5000] } as const;
export const LOBBY_MEMORY = '1G';

export const DEFAULTS = {
	paper: { version: 'LATEST', memory: '3G' },
	velocity: { version: 'LATEST', memory: '512M', hostPort: 25565 }
} as const;

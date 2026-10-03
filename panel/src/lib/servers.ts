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

export const DEFAULTS = {
	paper: { version: 'LATEST', memory: '3G' },
	velocity: { version: 'LATEST', memory: '512M', hostPort: 25565 }
} as const;

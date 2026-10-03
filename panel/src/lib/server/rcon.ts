import net from 'node:net';
import type { McServer } from './servers';

// Client mínim del protocol RCON (Source RCON), per enviar ordres de consola
// a un servidor. https://wiki.vg/RCON

export class RconError extends Error {}

export function rconConfigured(server: McServer): boolean {
	return !!(server.rconPort && server.rconPassword);
}

const AUTH = 3;
const EXEC = 2;

function buildPacket(id: number, type: number, payload: string): Buffer {
	const body = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0, 0])]);
	const header = Buffer.alloc(8);
	header.writeInt32LE(id, 0);
	header.writeInt32LE(type, 4);
	const lengthField = Buffer.alloc(4);
	lengthField.writeInt32LE(header.length + body.length, 0);
	return Buffer.concat([lengthField, header, body]);
}

function tryReadPacket(buf: Buffer): { id: number; payload: string; rest: Buffer } | null {
	if (buf.length < 4) return null;
	const length = buf.readInt32LE(0);
	if (buf.length < 4 + length) return null;
	const id = buf.readInt32LE(4);
	const payload = buf.subarray(12, 4 + length - 2).toString('utf8');
	return { id, payload, rest: Buffer.from(buf.subarray(4 + length)) };
}

export async function rconCommand(server: McServer, command: string): Promise<string> {
	if (!rconConfigured(server)) throw new RconError('Aquest servidor no té consola RCON');
	const host = server.rconHost;
	const port = server.rconPort!;
	const password = server.rconPassword!;

	return new Promise<string>((resolve, reject) => {
		const socket = net.createConnection({ host, port });
		let buf: Buffer = Buffer.alloc(0);
		let authenticated = false;
		let settled = false;

		const finish = (err: Error | null, result?: string) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			socket.destroy();
			if (err) reject(err);
			else resolve(result ?? '');
		};

		const timer = setTimeout(() => finish(new RconError('Temps d’espera esgotat parlant amb RCON')), 8000);

		socket.on('connect', () => socket.write(buildPacket(1, AUTH, password)));

		socket.on('data', (chunk: Buffer) => {
			buf = Buffer.concat([buf, chunk]);
			let pkt;
			while ((pkt = tryReadPacket(buf))) {
				buf = pkt.rest;
				if (!authenticated) {
					if (pkt.id === -1) return finish(new RconError('Contrasenya RCON incorrecta'));
					authenticated = true;
					socket.write(buildPacket(2, EXEC, command));
				} else {
					return finish(null, pkt.payload);
				}
			}
		});

		socket.on('error', (err) => finish(new RconError(`No es pot connectar amb RCON: ${err.message}`)));
		socket.on('close', () => finish(new RconError('RCON ha tancat la connexió')));
	});
}

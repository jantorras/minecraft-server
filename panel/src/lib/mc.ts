// Converteix text amb codis de Minecraft (&c, &l, &#RRGGBB...) en trossos amb estil.

const COLORS: Record<string, string> = {
	'0': '#000000',
	'1': '#0000AA',
	'2': '#00AA00',
	'3': '#00AAAA',
	'4': '#AA0000',
	'5': '#AA00AA',
	'6': '#FFAA00',
	'7': '#AAAAAA',
	'8': '#555555',
	'9': '#5555FF',
	a: '#55FF55',
	b: '#55FFFF',
	c: '#FF5555',
	d: '#FF55FF',
	e: '#FFFF55',
	f: '#FFFFFF'
};

export interface Segment {
	text: string;
	color?: string;
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	strike?: boolean;
}

type Style = Omit<Segment, 'text'>;

export function parseLegacy(input: string | null | undefined): Segment[] {
	if (!input) return [];
	const out: Segment[] = [];
	let style: Style = {};
	let buf = '';
	const flush = () => {
		if (buf) out.push({ ...style, text: buf });
		buf = '';
	};

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		// Etiquetes MiniMessage (<#RRGGBB>, </...>, <bold>...): colors hex s'apliquen, la resta s'ignora.
		if (ch === '<') {
			const end = input.indexOf('>', i);
			const tag = end > i ? input.slice(i + 1, end) : '';
			if (/^\/?[#a-z_:0-9-]+$/i.test(tag)) {
				flush();
				if (/^#[0-9a-f]{6}$/i.test(tag)) style = { ...style, color: tag };
				else if (tag === 'bold' || tag === 'b') style = { ...style, bold: true };
				else if (tag === 'reset') style = {};
				i = end;
				continue;
			}
		}
		if ((ch === '&' || ch === '§') && i + 1 < input.length) {
			const hex = input.slice(i + 2, i + 8);
			if (input[i + 1] === '#' && /^[0-9a-fA-F]{6}$/.test(hex)) {
				flush();
				style = { color: '#' + hex };
				i += 7;
				continue;
			}
			const code = input[i + 1].toLowerCase();
			if (code in COLORS) {
				flush();
				style = { color: COLORS[code] };
				i++;
				continue;
			}
			if ('lmnokr'.includes(code)) {
				flush();
				if (code === 'l') style = { ...style, bold: true };
				if (code === 'o') style = { ...style, italic: true };
				if (code === 'n') style = { ...style, underline: true };
				if (code === 'm') style = { ...style, strike: true };
				if (code === 'r') style = {};
				i++;
				continue;
			}
		}
		buf += ch;
	}
	flush();
	return out;
}

/** Codis de color per a l'ajuda dels formularis. */
export const COLOR_CODES = Object.entries(COLORS).map(([code, color]) => ({ code, color }));

/** Primer color que apareix a un prefix/tag, per pintar insígnies amb el color real del joc. */
export function firstColor(input: string | null | undefined): string | null {
	return parseLegacy(input).find((s) => s.color)?.color ?? null;
}

// --- Missatge de la llista de servidors (MOTD) ---
// Al panell es desa amb codis & (&c, &l, &#RRGGBB) i salts de línia reals; cada tipus de
// servidor el vol en un format diferent: § a Paper, etiquetes MiniMessage a Velocity.

const TAG_TO_CODE: Record<string, string> = {
	black: '0',
	dark_blue: '1',
	dark_green: '2',
	dark_aqua: '3',
	dark_red: '4',
	dark_purple: '5',
	gold: '6',
	gray: '7',
	grey: '7',
	dark_gray: '8',
	dark_grey: '8',
	blue: '9',
	green: 'a',
	aqua: 'b',
	red: 'c',
	light_purple: 'd',
	yellow: 'e',
	white: 'f',
	bold: 'l',
	b: 'l',
	italic: 'o',
	i: 'o',
	em: 'o',
	underlined: 'n',
	u: 'n',
	strikethrough: 'm',
	st: 'm',
	obfuscated: 'k',
	obf: 'k',
	reset: 'r'
};

const CODE_TO_TAG: Record<string, string> = {
	'0': 'black',
	'1': 'dark_blue',
	'2': 'dark_green',
	'3': 'dark_aqua',
	'4': 'dark_red',
	'5': 'dark_purple',
	'6': 'gold',
	'7': 'gray',
	'8': 'dark_gray',
	'9': 'blue',
	a: 'green',
	b: 'aqua',
	c: 'red',
	d: 'light_purple',
	e: 'yellow',
	f: 'white',
	l: 'bold',
	o: 'italic',
	n: 'underlined',
	m: 'strikethrough',
	k: 'obfuscated',
	r: 'reset'
};

/** Qualsevol format (§, &, MiniMessage, «\n» literal) → el del panell: codis & i salts de línia reals. */
export function normalizeMotd(input: string): string {
	return (
		input
			.replace(/\r/g, '')
			.replace(/\\n/g, '\n')
			// §x§R§R§G§G§B§B → &#RRGGBB
			.replace(/[§&]x((?:[§&][0-9a-fA-F]){6})/g, (_, hex: string) => '&#' + hex.replace(/[§&]/g, '').toUpperCase())
			.replace(/§/g, '&')
			.replace(/<(\/?)([#a-z_0-9]+)>/gi, (whole, close: string, tag: string) => {
				const t = tag.toLowerCase();
				if (t === 'newline' || t === 'br') return close ? '' : '\n';
				// Les etiquetes de tancament no tenen equivalent amb codis: l'estil segueix fins al següent.
				if (close) return '';
				if (/^#[0-9a-f]{6}$/.test(t)) return '&' + t.toUpperCase();
				return t in TAG_TO_CODE ? '&' + TAG_TO_CODE[t] : whole;
			})
			// Un color ja treu l'estil anterior: el «reset» de davant sobra.
			.replace(/&r(?=&(?:#[0-9A-Fa-f]{6}|[0-9a-fA-F]))/gi, '')
			// Un «<» escapat de MiniMessage torna a ser un «<» normal.
			.replace(/\\</g, '<')
	);
}

/** Format de Paper (server.properties): codis § i «\n» literal entre línies. */
export function motdForPaper(motd: string): string {
	return normalizeMotd(motd)
		.replace(/&#([0-9A-Fa-f]{6})/g, (_, hex: string) => '§x' + [...hex.toLowerCase()].map((c) => '§' + c).join(''))
		.replace(/&([0-9a-fk-orA-FK-OR])/g, '§$1')
		.replace(/\n/g, '\\n');
}

/** Format de Velocity (velocity.toml): etiquetes MiniMessage. */
export function motdForVelocity(motd: string): string {
	return (
		normalizeMotd(motd)
			// Un «<» escrit tal qual no ha de semblar una etiqueta.
			.replace(/</g, '\\<')
			.replace(/&#([0-9A-Fa-f]{6})/g, (_, hex: string) => `<reset><#${hex.toUpperCase()}>`)
			.replace(/&([0-9a-fk-orA-FK-OR])/g, (_, code: string) => {
				const c = code.toLowerCase();
				// Com al joc: un color nou treu la negreta, la cursiva, etc.
				return /[0-9a-f]/.test(c) ? `<reset><${CODE_TO_TAG[c]}>` : `<${CODE_TO_TAG[c]}>`;
			})
			.replace(/\n/g, '<newline>')
	);
}

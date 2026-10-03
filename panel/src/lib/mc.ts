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

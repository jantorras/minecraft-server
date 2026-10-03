const dateFmt = new Intl.DateTimeFormat('ca', { dateStyle: 'short', timeStyle: 'short' });

export function formatDate(ms: number): string {
	return dateFmt.format(new Date(ms));
}

/** Caducitat en segons (epoch) → "caduca d'aquí a 3 d" / "permanent". */
export function formatExpiry(epochSeconds: number | null): string {
	if (epochSeconds === null) return 'permanent';
	const diff = epochSeconds * 1000 - Date.now();
	if (diff <= 0) return 'caducat';
	const minutes = Math.round(diff / 60000);
	if (minutes < 60) return `caduca en ${minutes} min`;
	const hours = Math.round(minutes / 60);
	if (hours < 48) return `caduca en ${hours} h`;
	return `caduca en ${Math.round(hours / 24)} dies`;
}

// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PanelUser } from '$lib/roles';
import type { McServer } from '$lib/server/servers';

declare global {
	namespace App {
		interface Locals {
			user: PanelUser | null;
			/** El servidor triat al selector; null si encara no n'hi ha cap. */
			server: McServer | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

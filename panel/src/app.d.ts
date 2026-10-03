// See https://svelte.dev/docs/kit/types#app.d.ts
import type { PanelUser } from '$lib/roles';

declare global {
	namespace App {
		interface Locals {
			user: PanelUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

<script lang="ts">
	import { parseLegacy } from '$lib/mc';

	let { text }: { text: string | null | undefined } = $props();
	const segments = $derived(parseLegacy(text));
</script>

<span class="mc"
	>{#each segments as s, i (i)}<span
			style:color={s.color ?? '#FFFFFF'}
			style:font-weight={s.bold ? 'bold' : undefined}
			style:font-style={s.italic ? 'italic' : undefined}
			style:text-decoration={[s.underline && 'underline', s.strike && 'line-through'].filter(Boolean).join(' ') ||
				undefined}>{s.text}</span
		>{/each}</span
>

<style>
	.mc {
		font-family: var(--font-mc);
		white-space: pre;
	}
</style>

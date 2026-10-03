<script lang="ts">
	import { COLOR_CODES } from '$lib/mc';

	let {
		value = $bindable(''),
		input = $bindable<HTMLInputElement | HTMLTextAreaElement | null>(null)
	}: {
		value: string;
		input?: HTMLInputElement | HTMLTextAreaElement | null;
	} = $props();

	const FORMATS = [
		{ code: 'l', label: 'B', title: 'Negreta' },
		{ code: 'o', label: 'I', title: 'Cursiva' },
		{ code: 'n', label: 'S', title: 'Subratllat' },
		{ code: 'm', label: 'T', title: 'Ratllat' },
		{ code: 'r', label: '⟲', title: 'Treure estil' }
	];

	let customHex = $state('#ffffff');

	function insert(code: string) {
		const el = input;
		const start = el?.selectionStart ?? value.length;
		const end = el?.selectionEnd ?? value.length;
		value = value.slice(0, start) + code + value.slice(end);
		const pos = start + code.length;
		queueMicrotask(() => {
			el?.focus();
			el?.setSelectionRange?.(pos, pos);
		});
	}
</script>

<div class="picker">
	<div class="swatches">
		{#each COLOR_CODES as c (c.code)}
			<button
				type="button"
				class="swatch"
				style:background={c.color}
				title="&{c.code}"
				aria-label="Color &{c.code}"
				onclick={() => insert('&' + c.code)}
			></button>
		{/each}
		<label class="custom" title="Color personalitzat">
			<input type="color" bind:value={customHex} aria-label="Color personalitzat" />
		</label>
		<button type="button" class="secondary small" onclick={() => insert('&#' + customHex.slice(1).toUpperCase())}>
			+ hex
		</button>
	</div>
	<div class="formats">
		{#each FORMATS as f (f.code)}
			<button type="button" class="secondary small" title={f.title} onclick={() => insert('&' + f.code)}>
				{f.label}
			</button>
		{/each}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		margin: 0.4rem 0 0.75rem;
	}
	.swatches,
	.formats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		align-items: center;
	}
	.swatch {
		width: 1.4rem;
		height: 1.4rem;
		padding: 0;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.custom {
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 3px;
		border: 1px solid var(--border-strong);
		overflow: hidden;
		display: inline-block;
		cursor: pointer;
	}
	.custom input {
		width: 160%;
		height: 160%;
		padding: 0;
		border: none;
		margin: -20%;
		cursor: pointer;
	}
	.formats {
		padding-left: 0.5rem;
		border-left: 1px solid var(--border);
	}
	.formats button {
		font-family: var(--font-mc);
		min-width: 1.6rem;
	}
</style>

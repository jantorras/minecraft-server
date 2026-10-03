<script lang="ts">
	import McText from './McText.svelte';
	import StylePicker from './StylePicker.svelte';

	// Editor del missatge de la llista de servidors: dues línies, colors i estils amb botons,
	// i una vista prèvia de com surt al joc. El valor s'envia amb codis & (el servidor el
	// converteix al format que toqui).
	let {
		name,
		value,
		serverName,
		maxPlayers,
		icon
	}: {
		name: string;
		value: string;
		serverName: string;
		maxPlayers: number;
		icon: string | null;
	} = $props();

	let first = $derived(value.split('\n')[0] ?? '');
	let second = $derived(value.split('\n')[1] ?? '');
	let active = $state(0);
	let firstInput = $state<HTMLInputElement | null>(null);
	let secondInput = $state<HTMLInputElement | null>(null);

	const joined = $derived(second.trim() ? `${first}\n${second}` : first);
</script>

<div class="listing" aria-label="Com es veu a la llista de servidors">
	{#if icon}
		<img class="listing-icon" src={icon} alt="" width="64" height="64" />
	{:else}
		<div class="listing-icon default" aria-hidden="true"></div>
	{/if}
	<div class="listing-text">
		<div class="listing-top">
			<span class="listing-name">{serverName}</span>
			<span class="listing-count">0/{maxPlayers || '?'}</span>
		</div>
		<div class="listing-line"><McText text={first || ' '} /></div>
		<div class="listing-line"><McText text={second || ' '} /></div>
	</div>
</div>

<input type="hidden" {name} value={joined} />

<div class="lines">
	<label>
		Línia 1
		<input bind:this={firstInput} bind:value={first} onfocus={() => (active = 0)} maxlength="150" required class:active={active === 0} />
	</label>
	<label>
		<span>Línia 2 <span class="muted">(opcional)</span></span>
		<input bind:this={secondInput} bind:value={second} onfocus={() => (active = 1)} maxlength="150" class:active={active === 1} />
	</label>
</div>

<div class="tools">
	<span class="muted hint">Posa el cursor on vulguis que comenci el color o l’estil (línia {active + 1}) i prem:</span>
	{#if active === 0}
		<StylePicker bind:value={first} input={firstInput} />
	{:else}
		<StylePicker bind:value={second} input={secondInput} />
	{/if}
</div>

<style>
	/* Com surt el servidor a la llista del joc. */
	.listing {
		display: flex;
		gap: 0.7rem;
		align-items: center;
		padding: 0.6rem 0.7rem;
		background: var(--preview-bg);
		color: var(--preview-text);
		border-radius: var(--radius);
		font-family: var(--font-mc);
		font-size: 0.9rem;
		overflow: hidden;
	}
	.listing-icon {
		width: 64px;
		height: 64px;
		flex: none;
		image-rendering: pixelated;
	}
	.listing-icon.default {
		background: #5b8731;
		box-shadow:
			inset 0 -22px 0 #7a5a3a,
			inset 3px 3px 0 rgba(255, 255, 255, 0.18),
			inset -3px -3px 0 rgba(0, 0, 0, 0.35);
	}
	.listing-text {
		flex: 1;
		min-width: 0;
	}
	.listing-top {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.listing-count {
		opacity: 0.6;
	}
	.listing-line {
		min-height: 1.35em;
		color: #aaaaaa;
		overflow: hidden;
	}
	.listing-line :global(.mc > span:not([style*='color'])) {
		color: inherit;
	}
	.lines {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.lines label {
		margin: 0;
	}
	.lines input {
		font-family: var(--font-mc);
	}
	.lines input.active {
		border-color: var(--accent);
	}
	.tools {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.hint {
		font-size: 0.8rem;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import Flash from '$lib/components/Flash.svelte';

	let { data, form } = $props();

	const effectIds = $derived(Object.keys(data.effects));
	const iconUrl = (effect: string) =>
		`https://cdn.jsdelivr.net/gh/misode/mcmeta@assets/assets/minecraft/textures/mob_effect/${effect.toLowerCase()}.png`;

	const DURATIONS = [10, 15, 30, 60];
	const LEVELS = [
		{ value: 0, label: 'I' },
		{ value: 1, label: 'II' },
		{ value: 2, label: 'III' }
	];

	let selectedEffect = $state<Record<string, string>>({});
	let selectedDuration = $state<Record<string, number>>({});
	let selectedLevel = $state<Record<string, number>>({});

	const effectOf = (uuid: string) => selectedEffect[uuid] ?? effectIds[0];
	const durationOf = (uuid: string) => selectedDuration[uuid] ?? 15;
	const levelOf = (uuid: string) => selectedLevel[uuid] ?? 0;
</script>

<svelte:head><title>Calderó · Panell</title></svelte:head>

<h1>Calderó</h1>
<p class="muted">Efectes curts i inofensius als jugadors connectats. Es poden treure en qualsevol moment.</p>

<Flash {form} />

{#if data.online.length === 0}
	<div class="card"><p class="muted">No hi ha ningú connectat ara mateix.</p></div>
{:else}
	<div class="players">
		{#each data.online as p (p.uuid)}
			<section class="card">
				<h2><McText text={(p.prefix ?? '') + '&f' + (p.name ?? p.uuid)} /></h2>

				<div class="effects">
					{#each effectIds as id (id)}
						<button
							type="button"
							class="effect"
							class:selected={effectOf(p.uuid) === id}
							title={data.effects[id]}
							onclick={() => (selectedEffect[p.uuid] = id)}
						>
							<span class="slot"><img src={iconUrl(id)} alt="" width="24" height="24" /></span>
							<span class="label">{data.effects[id]}</span>
						</button>
					{/each}
				</div>

				<form method="POST" action="?/apply" use:enhance class="row apply">
					<input type="hidden" name="id" value={p.uuid} />
					<input type="hidden" name="effect" value={effectOf(p.uuid)} />
					<label>
						Durada
						<select
							value={durationOf(p.uuid)}
							onchange={(e) => (selectedDuration[p.uuid] = Number(e.currentTarget.value))}
						>
							{#each DURATIONS as d (d)}
								<option value={d}>{d}s</option>
							{/each}
						</select>
					</label>
					<input type="hidden" name="durationSeconds" value={durationOf(p.uuid)} />
					<label>
						Nivell
						<select value={levelOf(p.uuid)} onchange={(e) => (selectedLevel[p.uuid] = Number(e.currentTarget.value))}>
							{#each LEVELS as l (l.value)}
								<option value={l.value}>{l.label}</option>
							{/each}
						</select>
					</label>
					<input type="hidden" name="amplifier" value={levelOf(p.uuid)} />
					<button>Llençar {data.effects[effectOf(p.uuid)]}</button>
				</form>

				<form method="POST" action="?/clear" use:enhance>
					<input type="hidden" name="id" value={p.uuid} />
					<button type="submit" class="secondary small">Treure tots els efectes</button>
				</form>
			</section>
		{/each}
	</div>
{/if}

<style>
	.players {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.9rem;
		align-items: start;
	}
	.effects {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
		gap: 0.3rem;
		margin-bottom: 0.75rem;
	}
	.effect {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		background: var(--surface);
		border: 1px solid var(--border);
		color: var(--text);
		padding: 0.4rem 0.2rem;
		box-shadow: none;
	}
	.effect.selected {
		border-color: var(--text);
		background: var(--bg);
	}
	.effect .slot {
		width: 1.8rem;
		height: 1.8rem;
		display: grid;
		place-items: center;
		background: var(--preview-bg);
		border-radius: 3px;
	}
	.effect .slot img {
		width: 70%;
		height: 70%;
		image-rendering: pixelated;
	}
	.effect .label {
		font-size: 0.65rem;
		text-align: center;
		line-height: 1.15;
		color: var(--muted);
	}
	.apply {
		margin-bottom: 0.6rem;
	}
</style>

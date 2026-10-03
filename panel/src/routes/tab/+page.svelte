<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import StylePicker from '$lib/components/StylePicker.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();
	const canEdit = $derived(hasRole(data.user, 'admin'));

	let header = $state('');
	let headerInput = $state<HTMLTextAreaElement | null>(null);
	let footer = $state('');
	let order = $state<string[]>([]);
	let showTag = $state(false);
	$effect.pre(() => {
		header = data.tab.header.join('\n');
		footer = data.tab.footer.join('\n');
		order = [...data.tab.groupOrder];
		showTag = data.tab.showTag;
	});

	const groupByName = $derived(new Map(data.groups.map((g) => [g.name, g])));
	const missing = $derived(data.groups.filter((g) => !order.includes(g.name)));

	function move(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= order.length) return;
		[order[i], order[j]] = [order[j], order[i]];
	}

	function sortByWeight() {
		order = [...data.groups].sort((a, b) => b.weight - a.weight).map((g) => g.name);
	}

	// Vista prèvia: placeholders habituals amb valors d'exemple
	const SAMPLE: Record<string, string> = {
		'%player%': 'Steve',
		'%online%': '5',
		'%ping%': '23',
		'%staffonline%': '1',
		'%world%': 'world',
		'%memory-used%': '2048',
		'%memory-max%': '6144'
	};
	const sample = (line: string) => line.replace(/%[a-z_:-]+%/gi, (p) => SAMPLE[p.toLowerCase()] ?? p);

	// Jugadors d'exemple (un per grup de l'ordre) per veure l'ordenació
	const exampleTag = $derived(data.tags[0]?.display ?? '');
	const previewPlayers = $derived(
		order
			.filter((name) => groupByName.has(name))
			.slice(0, 6)
			.map((name, i) => {
				const g = groupByName.get(name)!;
				return (g.prefix ?? '') + '&f' + ['Steve', 'Alex', 'Noor', 'Sunny', 'Ari', 'Zuri'][i] + (showTag && i === 0 && exampleTag ? ' ' + exampleTag : '');
			})
	);
</script>

<svelte:head><title>TAB · Panell</title></svelte:head>

<h1>TAB</h1>
<p class="muted">El que es veu quan un jugador prem la tecla Tab.</p>

<Flash {form} />

{#if !data.tab.available}
	<div class="card">El plugin <strong>TAB</strong> no està instal·lat al servidor.</div>
{:else}
	<div class="grid">
		<form method="POST" use:enhance={() => async ({ update }) => update({ reset: false })} class="card">
			<fieldset disabled={!canEdit}>
				<label>
					Capçalera (una línia per fila)
					<textarea bind:this={headerInput} name="header" rows="6" bind:value={header}></textarea>
				</label>
				<StylePicker bind:value={header} bind:input={headerInput} />
				<label>
					Peu
					<textarea name="footer" rows="5" bind:value={footer}></textarea>
				</label>
				<p class="muted small">
					Placeholders útils: <code>%player%</code> <code>%online%</code> <code>%ping%</code> <code>%world%</code>
					<code>%animation:Nom%</code>. Colors: <code>&amp;a</code> o <code>&lt;#FF8800&gt;</code>.
				</p>

				<h2>Ordre dels grups</h2>
				<p class="muted small">Els grups de dalt surten primer a la llista.</p>
				<ol class="order">
					{#each order as name, i (name)}
						<li>
							<input type="hidden" name="groupOrder" value={name} />
							<span>
								{#if groupByName.get(name)?.prefix}
									<span class="preview"><McText text={groupByName.get(name)?.prefix} /></span>
								{/if}
								{name}
								{#if !groupByName.has(name)}<span class="muted">(no existeix a LuckPerms)</span>{/if}
							</span>
							{#if canEdit}
								<span class="row">
									<button type="button" class="secondary small" onclick={() => move(i, -1)} disabled={i === 0} aria-label="Pujar">↑</button>
									<button type="button" class="secondary small" onclick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Baixar">↓</button>
									<button type="button" class="danger small" onclick={() => order.splice(i, 1)} aria-label="Treure">✕</button>
								</span>
							{/if}
						</li>
					{/each}
				</ol>
				{#if canEdit}
					<div class="row" style="margin: 0.5rem 0 1rem">
						{#each missing as g (g.name)}
							<button type="button" class="secondary small" onclick={() => order.push(g.name)}>+ {g.name}</button>
						{/each}
						<button type="button" class="secondary small" onclick={sortByWeight}>Ordenar per pes</button>
					</div>
				{/if}

				<label class="inline" style="margin-bottom: 1rem">
					<input type="checkbox" name="showTag" bind:checked={showTag} />
					Mostrar el tag de <code>/tags</code> al costat del nom (TAB i damunt del cap)
				</label>

				{#if canEdit}<button>Desar i recarregar el TAB</button>{/if}
			</fieldset>
		</form>

		<section class="card">
			<h2>Vista prèvia</h2>
			<div class="tablist">
				{#each header.split('\n') as line, i (i)}
					<div class="center"><McText text={sample(line)} />&nbsp;</div>
				{/each}
				<div class="players">
					{#each previewPlayers as p, i (i)}
						<div><McText text={p} /></div>
					{:else}
						<div class="muted">(cap grup a l'ordre)</div>
					{/each}
				</div>
				{#each footer.split('\n') as line, i (i)}
					<div class="center"><McText text={sample(line)} />&nbsp;</div>
				{/each}
			</div>
			<p class="muted small">Aproximada: les animacions i alguns placeholders només es veuen al joc.</p>
		</section>
	</div>
{/if}

<style>
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
	textarea {
		font-family: var(--font-mc);
		resize: vertical;
	}
	.small {
		font-size: 0.85rem;
	}
	.order {
		padding-left: 1.5rem;
		margin: 0;
	}
	.order li {
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--border);
	}
	.order li,
	.order li > span:first-of-type {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.tablist {
		background: rgba(0, 0, 0, 0.75);
		color: #fff;
		border-radius: 4px;
		padding: 0.5rem;
		overflow-x: auto;
	}
	.center {
		text-align: center;
	}
	.players {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 2px;
		margin: 0.5rem 0;
	}
	.players > div {
		background: rgba(255, 255, 255, 0.12);
		padding: 0 0.4rem;
	}
</style>

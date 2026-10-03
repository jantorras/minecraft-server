<script lang="ts">
	import McText from '$lib/components/McText.svelte';
	import { firstColor } from '$lib/mc';

	let { data } = $props();
	let search = $state('');

	const tagDisplay = $derived(new Map(data.tags.map((t) => [t.id, t.display])));
	const filtered = $derived(
		data.players.filter((p) => {
			const q = search.trim().toLowerCase();
			return !q || (p.name ?? '').toLowerCase().includes(q) || p.uuid.includes(q) || p.primaryGroup.includes(q);
		})
	);
</script>

<svelte:head><title>Jugadors · Panell</title></svelte:head>

<h1>Jugadors</h1>

<div class="card">
	<div class="row">
		<input type="search" placeholder="Cerca per nom, UUID o grup…" bind:value={search} style="flex: 1" />
		<span class="muted">{filtered.length} de {data.players.length}</span>
	</div>
</div>

<div class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th></th>
				<th>Jugador</th>
				<th>Grup</th>
				<th>Com es veu al TAB</th>
			</tr>
		</thead>
		<tbody>
			{#each filtered as p (p.uuid)}
				<tr>
					<td><span class="dot" class:on={p.online} title={p.online ? 'Connectat' : 'Desconnectat'}></span></td>
					<td>
						<a href="/players/{p.uuid}">{p.name ?? 'Desconegut'}</a>
						<div class="muted uuid">{p.uuid}</div>
					</td>
					<td><span class="badge"><span class="swatch" style:background={firstColor(p.prefix) ?? 'var(--muted)'}></span>{p.primaryGroup}</span></td>
					<td>
						<span class="preview">
							<McText text={(p.prefix ?? '') + '&f' + (p.name ?? '?') + (p.tag ? ' ' + (tagDisplay.get(p.tag) ?? '') : '')} />
						</span>
					</td>
				</tr>
			{:else}
				<tr><td colspan="4" class="muted">Cap jugador. Apareixen aquí quan entren al servidor per primer cop.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.uuid {
		font-size: 0.75rem;
		font-family: var(--font-mc);
	}
</style>

<script lang="ts">
	import { formatDate } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>Registre · Panell</title></svelte:head>

<h1>Registre de canvis</h1>
<p class="muted">Qui ha fet què des del panell (últims 500 canvis).</p>

<div class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Quan</th>
				<th>Qui</th>
				<th>Acció</th>
				<th>Sobre</th>
				<th>Detalls</th>
			</tr>
		</thead>
		<tbody>
			{#each data.entries as e (e.id)}
				<tr>
					<td class="nowrap">{formatDate(e.at)}</td>
					<td>{e.username}</td>
					<td>{e.action}</td>
					<td>
						{#if data.names[e.target]}
							<a href="/players/{e.target}">{data.names[e.target]}</a>
						{:else}
							{e.target}
						{/if}
					</td>
					<td><code class="details">{e.details ?? ''}</code></td>
				</tr>
			{:else}
				<tr><td colspan="5" class="muted">Encara no hi ha canvis.</td></tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.nowrap {
		white-space: nowrap;
	}
	.details {
		font-size: 0.8rem;
		word-break: break-all;
	}
</style>

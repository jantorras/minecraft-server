<script lang="ts">
	import McText from '$lib/components/McText.svelte';
	import { formatDate } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>Inici · Panell</title></svelte:head>

<h1>Inici</h1>

<div class="grid">
	<section class="card">
		<h2>Servidor</h2>
		{#if data.serverRunning !== null}
			<p>
				<span class="dot" class:on={data.serverRunning}></span>
				{data.serverRunning ? 'Encès' : 'Aturat'}
			</p>
			{#if data.serverRunning && data.health}
				<p class="muted">Jugadors: {data.health.onlinePlayers}</p>
			{/if}
		{:else if data.health}
			<p><span class="dot on"></span> En línia</p>
			<p class="muted">{data.health.server}</p>
		{:else}
			<p><span class="dot"></span> Sense connexió</p>
		{/if}

		{#if data.dockerError}<p class="muted">Docker: {data.dockerError}</p>{/if}
		{#if data.bridgeError}<p class="muted">Bridge: {data.bridgeError}</p>{/if}

		<p><a href="/servidor">Veure i controlar el servidor →</a></p>
	</section>

	<section class="card">
		<h2>Connectats ara ({data.online.length})</h2>
		{#if data.online.length === 0}
			<p class="muted">No hi ha ningú connectat.</p>
		{:else}
			<ul class="plain">
				{#each data.online as p (p.uuid)}
					<li>
						<a href="/players/{p.uuid}"><span class="preview"><McText text={(p.prefix ?? '') + '&f' + (p.name ?? p.uuid)} /></span></a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="card">
		<h2>Últims canvis</h2>
		{#if data.recent.length === 0}
			<p class="muted">Encara no hi ha canvis.</p>
		{:else}
			<ul class="plain">
				{#each data.recent as e (e.id)}
					<li>
						<span><strong>{e.username}</strong> · {e.action} · {e.target}</span>
						<span class="muted">{formatDate(e.at)}</span>
					</li>
				{/each}
			</ul>
			<p><a href="/audit">Veure tot el registre →</a></p>
		{/if}
	</section>
</div>

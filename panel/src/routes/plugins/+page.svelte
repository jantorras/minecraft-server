<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();

	const owner = $derived(hasRole(data.user, 'owner'));
	const pending = (changedAt: number) => data.startedAt !== null && changedAt > data.startedAt;
	const anyPending = $derived(data.plugins.some((p) => pending(p.changedAt)));
</script>

<svelte:head><title>Plugins · Panell</title></svelte:head>

<h1>Plugins{#if data.serverName}<span class="muted"> · {data.serverName}</span>{/if}</h1>
<p class="muted">
	Tots els <code>.jar</code> de la carpeta <code>plugins/</code> del servidor, també els que s’hi hagin copiat a mà. Els canvis
	s’apliquen quan el servidor es reinicia.
</p>

<Flash {form} />

{#if !data.pluginsEnabled}
	<section class="card">
		<p class="muted">
			{data.serverName ? 'Aquest servidor no té directori de dades al qual el panell pugui accedir.' : 'Encara no hi ha cap servidor.'}
		</p>
	</section>
{:else}
	{#if anyPending}
		<section class="card">
			<p>Hi ha plugins canviats des que el servidor està engegat. <a href="/servidor">Reinicia’l →</a></p>
		</section>
	{/if}

	{#if data.plugins.length === 0}
		<section class="card"><p class="muted">Aquest servidor no té cap plugin.</p></section>
	{:else}
		<div class="card table-wrap">
			<table>
				<thead>
					<tr>
						<th>Plugin</th>
						<th>Versió</th>
						<th>Estat</th>
						<th>Mida</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.plugins as p (p.file)}
						<tr>
							<td>
								{p.name}
								<br /><code>{p.file}</code>
								{#if p.description}<br /><span class="muted detail">{p.description}</span>{/if}
							</td>
							<td>{p.version ?? '—'}</td>
							<td>
								<span class="dot" class:on={p.enabled}></span>
								{p.enabled ? 'Actiu' : 'Desactivat'}
								{#if pending(p.changedAt)}<br /><span class="badge">Cal reiniciar</span>{/if}
								{#if p.inCatalogue}<br /><span class="muted detail">Al catàleg</span>{/if}
							</td>
							<td class="muted">{p.sizeKB >= 1024 ? `${(p.sizeKB / 1024).toFixed(1)} MB` : `${p.sizeKB} kB`}</td>
							<td>
								<div class="row">
									{#if p.configDir}
										<a href="/fitxers?path={encodeURIComponent(`plugins/${p.configDir}`)}">
											<button type="button" class="secondary small">Configuració</button>
										</a>
									{/if}
									<form method="POST" action="?/toggle" use:enhance>
										<input type="hidden" name="file" value={p.file} />
										<input type="hidden" name="enabled" value={String(!p.enabled)} />
										<button class="secondary small">{p.enabled ? 'Desactivar' : 'Activar'}</button>
									</form>
									{#if owner && data.canCatalogue}
										<form method="POST" action="?/catalogue" use:enhance>
											<input type="hidden" name="file" value={p.file} />
											<input type="hidden" name="wanted" value={String(!p.inCatalogue)} />
											<button class="secondary small">{p.inCatalogue ? 'Treure del catàleg' : 'Al catàleg'}</button>
										</form>
									{/if}
									<form
										method="POST"
										action="?/delete"
										use:enhance={({ cancel }) => {
											if (!confirm(`Esborrar el plugin ${p.name}? La seva configuració es conserva.`)) cancel();
										}}
									>
										<input type="hidden" name="file" value={p.file} />
										<button class="danger small">Esborrar</button>
									</form>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if data.available.length > 0}
		<section class="card">
			<h2>Disponibles al catàleg</h2>
			<p class="muted detail">Plugins del catàleg que aquest servidor encara no té.</p>
			<ul class="plain">
				{#each data.available as a (a.file)}
					<li>
						<span>
							<strong>{a.name}</strong>
							{#if a.version}<span class="muted">{a.version}</span>{/if}
							{#if a.description}<br /><span class="muted detail">{a.description}</span>{/if}
						</span>
						<form method="POST" action="?/install" use:enhance>
							<input type="hidden" name="file" value={a.file} />
							<button class="small">Instal·lar</button>
						</form>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section class="card">
		<h2>Afegir un plugin</h2>
		<form method="POST" action="?/upload" enctype="multipart/form-data" use:enhance class="row">
			<label>Fitxer .jar <input name="file" type="file" accept=".jar" required /></label>
			<button style="margin-bottom: 0.75rem">Pujar</button>
		</form>
		{#if data.canCatalogue}
			<p class="muted detail">
				El <strong>catàleg</strong> són els plugins que el panell copia a cada servidor nou d’aquest tipus.
			</p>
		{/if}
	</section>
{/if}

<style>
	.detail {
		font-size: 0.85rem;
	}
</style>

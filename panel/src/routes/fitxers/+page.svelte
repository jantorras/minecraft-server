<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';

	let { data, form } = $props();

	const EDITABLE = /\.(ya?ml|json|properties|txt|conf|cfg|toml|log|md)$/i;

	const segments = $derived(
		data.rel
			? data.rel.split('/').map((name, i, arr) => ({ name, path: arr.slice(0, i + 1).join('/') }))
			: []
	);
	const parentPath = $derived(segments.length > 0 ? segments.slice(0, -1).map((s) => s.name).join('/') : '');

	let editing = $derived(data.browse?.kind === 'file');
	let newFolderOpen = $state(false);
</script>

<svelte:head><title>Fitxers · Panell</title></svelte:head>

<h1>Fitxers{#if data.serverName}<span class="muted"> · {data.serverName}</span>{/if}</h1>

<Flash {form} />

{#if !data.filesEnabled}
	<section class="card"><p class="muted">
			{data.serverName ? 'Aquest servidor no té directori de dades al qual el panell pugui accedir.' : 'Encara no hi ha cap servidor.'}
		</p></section>
{:else if data.error}
	<section class="card">
		<p class="muted">{data.error}</p>
	</section>
{:else if data.browse?.kind === 'file'}
	<section class="card">
		<div class="path-row">
			<a href="/fitxers?path={encodeURIComponent(parentPath)}">← Tornar a la carpeta</a>
			<code>{data.browse.rel}</code>
		</div>
		{#if EDITABLE.test(data.browse.rel)}
			<form method="POST" action="?/write" use:enhance>
				<input type="hidden" name="path" value={data.browse.rel} />
				<textarea name="contents" rows="24" spellcheck="false">{data.browse.contents}</textarea>
				<div class="row" style="margin-top: 0.75rem">
					<button>Desar</button>
					<a href="/fitxers?path={encodeURIComponent(parentPath)}"><button type="button" class="secondary">Cancel·lar</button></a>
				</div>
			</form>
		{:else}
			<p class="muted">Aquest tipus de fitxer no es pot editar com a text des d'aquí.</p>
		{/if}
	</section>
{:else if data.browse}
	<section class="card">
		<nav class="breadcrumb muted">
			<a href="/fitxers">Arrel</a>
			{#each segments as s (s.path)}
				<span> / </span><a href="/fitxers?path={encodeURIComponent(s.path)}">{s.name}</a>
			{/each}
		</nav>

		<ul class="plain files">
			{#each data.browse.entries as e (e.rel)}
				<li>
					{#if e.dir}
						<a href="/fitxers?path={encodeURIComponent(e.rel)}">📁 {e.name}</a>
					{:else if EDITABLE.test(e.name)}
						<a href="/fitxers?path={encodeURIComponent(e.rel)}">📄 {e.name}</a>
					{:else}
						<span>📦 {e.name}</span>
					{/if}
					<form
						method="POST"
						action="?/delete"
						use:enhance={({ cancel }) => {
							if (!confirm(`Esborrar ${e.name}?`)) cancel();
						}}
					>
						<input type="hidden" name="path" value={e.rel} />
						<button class="small danger" type="submit">Esborrar</button>
					</form>
				</li>
			{/each}
			{#if data.browse.entries.length === 0}
				<li class="muted">Carpeta buida.</li>
			{/if}
		</ul>

		<div class="row" style="margin-top: 1rem">
			<form method="POST" action="?/upload" use:enhance enctype="multipart/form-data" class="row">
				<input type="hidden" name="dir" value={data.rel} />
				<input type="file" name="file" required />
				<button>Pujar fitxer</button>
			</form>
			{#if !newFolderOpen}
				<button type="button" class="secondary small" onclick={() => (newFolderOpen = true)}>Nova carpeta</button>
			{:else}
				<form method="POST" action="?/createFolder" use:enhance class="row">
					<input type="hidden" name="parent" value={data.rel} />
					<input name="name" placeholder="nom de la carpeta" required autocomplete="off" />
					<button class="small">Crear</button>
				</form>
			{/if}
		</div>
	</section>
{/if}

<style>
	.path-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.75rem;
	}
	textarea {
		width: 100%;
		font-family: var(--font-mc);
		font-size: 0.85rem;
	}
	.breadcrumb {
		margin-bottom: 0.9rem;
		font-size: 0.88rem;
	}
	.files li {
		gap: 0.75rem;
	}
	.files li > a,
	.files li > span {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import StylePicker from '$lib/components/StylePicker.svelte';
	import MaterialPicker from '$lib/components/MaterialPicker.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();
	const canEdit = $derived(hasRole(data.user, 'admin'));

	const iconUrl = (material: string) =>
		`https://cdn.jsdelivr.net/gh/misode/mcmeta@assets/assets/minecraft/textures/item/${material.toLowerCase()}.png`;

	let editing = $state<string | null>(null);
	let editDisplay = $state('');
	let editInput = $state<HTMLInputElement | null>(null);
	let editMaterial = $state('NAME_TAG');

	function startEdit(t: { id: string; display: string; material: string }) {
		editing = t.id;
		editDisplay = t.display;
		editMaterial = t.material;
	}

	let newId = $state('');
	let newDisplay = $state('');
	let newInput = $state<HTMLInputElement | null>(null);
	let newMaterial = $state('NAME_TAG');
</script>

<svelte:head><title>Tags · Panell</title></svelte:head>

<h1>Tags</h1>
<p class="muted">
	Els jugadors trien el seu tag amb <code>/tags</code>. Per desbloquejar-ne un, dona'l des de la fitxa del jugador,
	o a un grup sencer amb el permís <code>bridge.tag.&lt;id&gt;</code>.
</p>

<Flash {form} />

<div class="slots">
	{#each data.tags as t (t.id)}
		{#if editing === t.id}
			<form
				method="POST"
				action="?/update"
				class="card tile editing"
				use:enhance={() => async ({ result, update }) => {
					await update({ reset: false });
					if (result.type === 'success') editing = null;
				}}
			>
				<input type="hidden" name="id" value={t.id} />
				<input type="hidden" name="material" value={editMaterial} />
				<MaterialPicker bind:value={editMaterial} />
				<label>
					Com es veu
					<input bind:this={editInput} name="display" required maxlength="64" bind:value={editDisplay} />
				</label>
				<StylePicker bind:value={editDisplay} bind:input={editInput} />
				<label>
					Descripció
					<input name="description" maxlength="200" value={t.description} />
				</label>
				<p class="item-preview"><span class="slot"><img src={iconUrl(editMaterial)} alt="" width="24" height="24" /></span><span class="preview"><McText text={editDisplay} /></span></p>
				<div class="row">
					<button>Desar</button>
					<button type="button" class="secondary" onclick={() => (editing = null)}>Cancel·lar</button>
				</div>
			</form>
		{:else}
			<div class="card tile">
				<div class="item-preview">
					<span class="slot"><img src={iconUrl(t.material)} alt="" width="24" height="24" /></span>
					<span class="preview"><McText text={t.display} /></span>
				</div>
				<p class="muted id">{t.id}</p>
				{#if t.description}<p class="desc">{t.description}</p>{/if}
				{#if canEdit}
					<div class="row">
						<button class="secondary small" onclick={() => startEdit(t)}>Editar</button>
						<form
							method="POST"
							action="?/delete"
							use:enhance={({ cancel }) => {
								if (!confirm(`Esborrar el tag ${t.id}?`)) cancel();
							}}
						>
							<input type="hidden" name="id" value={t.id} />
							<button class="danger small">Esborrar</button>
						</form>
					</div>
				{/if}
			</div>
		{/if}
	{:else}
		<p class="muted">Encara no hi ha tags.</p>
	{/each}
</div>

{#if canEdit}
	<section class="card new-tag">
		<h2>Nou tag</h2>
		<form
			method="POST"
			action="?/create"
			use:enhance={() => async ({ result, update }) => {
				await update({ reset: false });
				if (result.type === 'success') {
					newId = '';
					newDisplay = '';
					newMaterial = 'NAME_TAG';
				}
			}}
		>
			<input type="hidden" name="material" value={newMaterial} />
			<div class="row">
				<MaterialPicker bind:value={newMaterial} />
				<span class="item-preview">
					<span class="slot big"><img src={iconUrl(newMaterial)} alt="" width="32" height="32" /></span>
					<span class="preview"><McText text={'&fSteve ' + newDisplay} /></span>
				</span>
			</div>
			<div class="row">
				<label>
					Id
					<input name="id" required pattern="[a-z0-9_\-]+" maxlength="32" placeholder="pescador" bind:value={newId} />
				</label>
				<label style="flex: 1">
					Com es veu
					<input bind:this={newInput} name="display" required maxlength="64" placeholder="&3[Pescador]" bind:value={newDisplay} />
				</label>
			</div>
			<StylePicker bind:value={newDisplay} bind:input={newInput} />
			<label>
				Descripció
				<input name="description" maxlength="200" placeholder="Per a qui pesca més que ningú" />
			</label>
			<button>Crear</button>
		</form>
	</section>
{/if}

<style>
	.slots {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
		gap: 0.9rem;
		margin-bottom: 1rem;
		align-items: start;
	}
	.tile {
		margin-bottom: 0;
	}
	.tile.editing {
		grid-column: 1 / -1;
	}
	.item-preview {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0 0 0.5rem;
	}
	.slot {
		width: 2rem;
		height: 2rem;
		flex: none;
		display: grid;
		place-items: center;
		background: var(--preview-bg);
		border-radius: 3px;
	}
	.slot.big {
		width: 2.6rem;
		height: 2.6rem;
	}
	.slot img {
		width: 70%;
		height: 70%;
		image-rendering: pixelated;
	}
	.id {
		font-family: var(--font-mc);
		font-size: 0.78rem;
		margin: 0 0 0.3rem;
	}
	.desc {
		font-size: 0.88rem;
		color: var(--muted);
		margin: 0 0 0.6rem;
	}
	.new-tag {
		max-width: 46rem;
	}
</style>

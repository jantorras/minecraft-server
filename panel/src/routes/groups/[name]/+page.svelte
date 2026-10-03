<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import StylePicker from '$lib/components/StylePicker.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();
	const g = $derived(data.group);
	const canEdit = $derived(hasRole(data.user, 'admin'));

	let prefix = $state('');
	let prefixInput = $state<HTMLInputElement | null>(null);
	let suffix = $state('');
	$effect.pre(() => {
		prefix = g.prefix ?? '';
		suffix = g.suffix ?? '';
	});

	const others = $derived(data.groups.filter((o) => o.name !== g.name));
</script>

<svelte:head><title>{g.name} · Grups · Panell</title></svelte:head>

<p><a href="/groups">← Grups</a></p>
<h1>{g.displayName ?? g.name}</h1>

<Flash {form} />

<div class="grid">
	<section class="card">
		<h2>Configuració</h2>
		<form method="POST" action="?/update" use:enhance>
			<fieldset disabled={!canEdit}>
				<div class="row">
					<label>
						Nom visible
						<input name="displayName" maxlength="64" value={g.displayName ?? ''} />
					</label>
					<label>
						Pes
						<input name="weight" type="number" min="0" max="10000" value={g.weight} style="width: 7rem" />
					</label>
				</div>
				<label>
					Prefix
					<input bind:this={prefixInput} name="prefix" maxlength="128" bind:value={prefix} />
				</label>
				<label>
					Sufix
					<input name="suffix" maxlength="128" bind:value={suffix} />
				</label>
				<StylePicker bind:value={prefix} bind:input={prefixInput} />
				<p><span class="preview"><McText text={prefix + '&fSteve' + suffix} /></span></p>

				<p style="margin-bottom: 0.25rem">Hereta de</p>
				<div class="row" style="margin-bottom: 1rem">
					{#each others as o (o.name)}
						<label class="inline">
							<input type="checkbox" name="parents" value={o.name} checked={g.parents.includes(o.name)} />
							{o.name}
						</label>
					{/each}
				</div>
				{#if canEdit}<button>Desar</button>{/if}
			</fieldset>
		</form>
	</section>

	{#if canEdit && g.name !== 'default'}
		<section class="card">
			<h2>Esborrar</h2>
			<p class="muted">Els jugadors d'aquest grup el perdran. No es pot desfer.</p>
			<form
				method="POST"
				action="?/delete"
				use:enhance={({ cancel }) => {
					if (!confirm(`Segur que vols esborrar el grup ${g.name}?`)) cancel();
				}}
			>
				<button class="danger">Esborrar grup</button>
			</form>
		</section>
	{/if}
</div>

<style>
	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
</style>

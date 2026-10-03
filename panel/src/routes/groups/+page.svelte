<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import StylePicker from '$lib/components/StylePicker.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { firstColor } from '$lib/mc';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();
	const canEdit = $derived(hasRole(data.user, 'admin'));
	let newPrefix = $state('');
	let newPrefixInput = $state<HTMLInputElement | null>(null);
</script>

<svelte:head><title>Grups · Panell</title></svelte:head>

<h1>Grups</h1>
<p class="muted">El grup amb més pes mana: el seu prefix és el que es veu i surt primer al TAB.</p>

<Flash {form} />

<div class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Grup</th>
				<th>Pes</th>
				<th>Prefix</th>
				<th>Hereta de</th>
			</tr>
		</thead>
		<tbody>
			{#each data.groups as g (g.name)}
				<tr>
					<td>
						<a href="/groups/{g.name}" class="name">
							<span class="dot-swatch" style:background={firstColor(g.prefix) ?? 'var(--muted)'}></span>
							{g.displayName ?? g.name}
						</a>
						{#if g.displayName}<span class="muted">({g.name})</span>{/if}
					</td>
					<td>{g.weight}</td>
					<td>{#if g.prefix}<span class="preview"><McText text={g.prefix} /></span>{:else}<span class="muted">—</span>{/if}</td>
					<td>{g.parents.join(', ') || '—'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

{#if canEdit}
	<section class="card">
		<h2>Nou grup</h2>
		<form method="POST" action="?/create" use:enhance>
			<div class="row">
				<label>
					Nom intern
					<input name="name" required pattern="[a-z0-9_\-]+" maxlength="36" placeholder="vip" />
				</label>
				<label>
					Nom visible
					<input name="displayName" maxlength="64" placeholder="VIP" />
				</label>
				<label>
					Pes
					<input name="weight" type="number" min="0" max="10000" value="20" style="width: 7rem" />
				</label>
				<label>
					Hereta de
					<select name="parent">
						<option value="">— Cap —</option>
						{#each data.groups as g (g.name)}
							<option value={g.name} selected={g.name === 'default'}>{g.name}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="row">
				<label style="flex: 1">
					Prefix
					<input bind:this={newPrefixInput} name="prefix" maxlength="128" placeholder="&e[VIP] " bind:value={newPrefix} />
				</label>
				<span class="preview" style="margin-bottom: 0.75rem"><McText text={newPrefix + '&fSteve'} /></span>
			</div>
			<StylePicker bind:value={newPrefix} bind:input={newPrefixInput} />
			<button>Crear</button>
		</form>
	</section>
{/if}

<style>
	.name {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.dot-swatch {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 50%;
		flex: none;
	}
</style>

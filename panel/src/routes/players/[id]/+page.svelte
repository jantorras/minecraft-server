<script lang="ts">
	import { enhance } from '$app/forms';
	import McText from '$lib/components/McText.svelte';
	import StylePicker from '$lib/components/StylePicker.svelte';
	import Flash from '$lib/components/Flash.svelte';
	import { formatExpiry } from '$lib/format';
	import { firstColor } from '$lib/mc';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();

	const p = $derived(data.player);
	const canEdit = $derived(hasRole(data.user, 'admin'));
	const tagById = $derived(new Map(data.tags.map((t) => [t.id, t])));
	const grantedDirect = $derived(new Set(p.tagGrants.map((g) => g.tag)));
	const lockedTags = $derived(data.tags.filter((t) => !p.unlockedTags.includes(t.id)));

	// Vista prèvia en viu del prefix/sufix personal
	let prefix = $state('');
	let prefixInput = $state<HTMLInputElement | null>(null);
	let suffix = $state('');
	$effect.pre(() => {
		prefix = p.personalPrefix ?? '';
		suffix = p.personalSuffix ?? '';
	});

	const activeTagDisplay = $derived(p.tag ? (tagById.get(p.tag)?.display ?? '') : '');
	// Prefix que tindria sense el personal: el del grup (o avantpassat) amb més pes que en tingui.
	const groupPrefix = $derived.by(() => {
		const byName = new Map(data.groups.map((g) => [g.name, g]));
		const seen = new Set<string>();
		const queue = p.groups.map((m) => m.group);
		let best: { weight: number; prefix: string } | null = null;
		while (queue.length) {
			const g = byName.get(queue.pop()!);
			if (!g || seen.has(g.name)) continue;
			seen.add(g.name);
			if (g.prefix && (!best || g.weight > best.weight)) best = { weight: g.weight, prefix: g.prefix };
			queue.push(...g.parents);
		}
		return best?.prefix ?? '';
	});
	const previewPrefix = $derived(prefix || groupPrefix);
	const groupColorByName = $derived(new Map(data.groups.map((gr) => [gr.name, firstColor(gr.prefix)])));
	const tabPreview = $derived(
		previewPrefix + '&f' + (p.name ?? '?') + (suffix || '') + (activeTagDisplay ? ' ' + activeTagDisplay : '')
	);
</script>

<svelte:head><title>{p.name ?? 'Jugador'} · Panell</title></svelte:head>

<p><a href="/players">← Jugadors</a></p>
<h1>
	<span class="dot" class:on={p.online}></span>
	{p.name ?? 'Desconegut'}
</h1>
<p class="muted uuid">{p.uuid}</p>

<Flash {form} />

<div class="card">
	<h2>Com es veu</h2>
	<span class="preview big"><McText text={tabPreview} /></span>
</div>

<div class="grid">
	<!-- Rols -->
	<section class="card">
		<h2>Rol</h2>
		<p>
			Grup principal:
			<span class="badge"><span class="swatch" style:background={groupColorByName.get(p.primaryGroup) ?? 'var(--muted)'}></span>{p.primaryGroup}</span>
		</p>

		{#if canEdit}
			<form method="POST" action="?/setGroup" use:enhance class="row">
				<label style="flex: 1">
					Canviar rol (substitueix tots els grups)
					<select name="group" required>
						{#each data.groups as g (g.name)}
							<option value={g.name} selected={g.name === p.primaryGroup}>{g.displayName ?? g.name}</option>
						{/each}
					</select>
				</label>
				<button style="margin-bottom: 0.75rem">Desar</button>
			</form>
		{/if}

		<h3>Grups</h3>
		<ul class="plain">
			{#each p.groups as m (m.group)}
				<li>
					<span>
						<span class="badge"><span class="swatch" style:background={groupColorByName.get(m.group) ?? 'var(--muted)'}></span>{m.group}</span>
						<span class="muted">{formatExpiry(m.expiresAt)}</span>
					</span>
					{#if canEdit}
						<form method="POST" action="?/removeGroup" use:enhance>
							<input type="hidden" name="group" value={m.group} />
							<button class="danger small">Treure</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>

		{#if canEdit}
			<form method="POST" action="?/addGroup" use:enhance class="row" style="margin-top: 1rem">
				<label>
					Afegir grup
					<select name="group" required>
						{#each data.groups as g (g.name)}
							<option value={g.name}>{g.displayName ?? g.name}</option>
						{/each}
					</select>
				</label>
				<label>
					Dies (buit = permanent)
					<input name="days" type="number" min="0.01" step="any" style="width: 9rem" />
				</label>
				<button style="margin-bottom: 0.75rem">Afegir</button>
			</form>
		{/if}
	</section>

	<!-- Prefix personal -->
	<section class="card">
		<h2>Prefix i sufix personal</h2>
		<p class="muted">Passen per davant del prefix del grup. Deixa-ho buit per fer servir el del grup.</p>
		<form method="POST" action="?/meta" use:enhance>
			<label>
				Prefix
				<input bind:this={prefixInput} name="prefix" bind:value={prefix} maxlength="128" placeholder="&6[Rei] " disabled={!canEdit} />
			</label>
			<label>
				Sufix
				<input name="suffix" bind:value={suffix} maxlength="128" disabled={!canEdit} />
			</label>
			{#if canEdit}<StylePicker bind:value={prefix} bind:input={prefixInput} />{/if}
			{#if canEdit}<button>Desar</button>{/if}
		</form>
	</section>

	<!-- Tags -->
	<section class="card">
		<h2>Tags</h2>

		{#if canEdit}
			<form method="POST" action="?/selectTag" use:enhance class="row">
				<label style="flex: 1">
					Tag que porta
					<select name="tag">
						<option value="" selected={!p.tag}>— Cap —</option>
						{#each p.unlockedTags as id (id)}
							<option value={id} selected={id === p.tag}>{id}</option>
						{/each}
					</select>
				</label>
				<button style="margin-bottom: 0.75rem">Posar</button>
			</form>
		{:else}
			<p>Porta: {p.tag ?? 'cap'}</p>
		{/if}

		<h3>Desbloquejats</h3>
		<ul class="plain">
			{#each p.unlockedTags as id (id)}
				{@const grant = p.tagGrants.find((g) => g.tag === id)}
				<li>
					<span>
						<span class="preview"><McText text={tagById.get(id)?.display ?? id} /></span>
						<span class="muted">{grant ? formatExpiry(grant.expiresAt) : 'per grup'}</span>
					</span>
					{#if canEdit && grantedDirect.has(id)}
						<form method="POST" action="?/revokeTag" use:enhance>
							<input type="hidden" name="tag" value={id} />
							<button class="danger small">Treure</button>
						</form>
					{/if}
				</li>
			{:else}
				<li class="muted">Cap tag desbloquejat.</li>
			{/each}
		</ul>

		{#if canEdit && lockedTags.length > 0}
			<form method="POST" action="?/grantTag" use:enhance class="row" style="margin-top: 1rem">
				<label>
					Desbloquejar tag
					<select name="tag" required>
						{#each lockedTags as t (t.id)}
							<option value={t.id}>{t.id}</option>
						{/each}
					</select>
				</label>
				<label>
					Dies (buit = permanent)
					<input name="days" type="number" min="0.01" step="any" style="width: 9rem" />
				</label>
				<button style="margin-bottom: 0.75rem">Donar</button>
			</form>
		{/if}
	</section>
</div>

<style>
	.uuid {
		font-family: var(--font-mc);
		font-size: 0.85rem;
		margin-top: -0.75rem;
	}
	.big {
		font-size: 1.15rem;
		padding: 0.6rem 1rem;
	}
	h3 {
		font-size: 0.95rem;
		margin: 1rem 0 0.25rem;
	}
</style>

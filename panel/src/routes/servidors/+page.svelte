<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';
	import { DEFAULTS, STATUS_LABELS, STEP_LABELS } from '$lib/servers';

	let { data, form } = $props();

	type Server = (typeof data.list)[number];
	type ServerType = 'paper' | 'velocity';

	const owner = $derived(hasRole(data.user, 'owner'));
	const proxies = $derived(data.list.filter((s) => s.type === 'velocity'));
	const standalone = $derived(data.list.filter((s) => s.type === 'paper' && s.proxyId === null));
	const backendsOf = (proxyId: number) => data.list.filter((s) => s.proxyId === proxyId);
	const creating = $derived(data.list.some((s) => s.status === 'creating'));

	// Mentre algun servidor s'està creant, es va refrescant l'estat.
	$effect(() => {
		if (!creating) return;
		const timer = setInterval(invalidateAll, 2000);
		return () => clearInterval(timer);
	});

	const MEMORY_PRESETS: Record<ServerType, string[]> = {
		paper: ['2G', '3G', '4G', '6G', '8G'],
		velocity: ['512M', '1G', '2G']
	};

	const TYPES: { type: ServerType; title: string; text: string }[] = [
		{ type: 'paper', title: 'Servidor normal', text: 'Un món on es juga, amb els seus plugins. És el que vols si només en tens un.' },
		{ type: 'velocity', title: 'Proxy', text: 'La porta d’entrada: una sola adreça que reparteix els jugadors entre diversos servidors.' }
	];

	/** El primer port lliure a partir del 25565, per proposar-lo. */
	const freePort = $derived.by(() => {
		const used = new Set(data.list.map((s) => s.hostPort));
		let port = 25565;
		while (used.has(port)) port++;
		return port;
	});

	const duration = (seconds: number) => (seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`);

	// --- Nou servidor ---
	let open = $state(false);
	let type = $state<ServerType>('paper');
	let name = $state('');
	let slug = $state('');
	let slugEdited = $state(false);
	let proxy = $state('');
	let port = $state<number | null>(null);
	let memory = $state<string>(DEFAULTS.paper.memory);
	let version = $state('');

	function slugify(text: string): string {
		return text
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^[^a-z]+|-+$/g, '')
			.slice(0, 24);
	}

	function setType(next: ServerType) {
		type = next;
		memory = DEFAULTS[next].memory;
		if (next === 'velocity') proxy = '';
	}

	function resetNew() {
		open = false;
		name = slug = version = proxy = '';
		slugEdited = false;
		port = null;
		setType('paper');
	}

	const effectiveSlug = $derived(slugEdited ? slug : slugify(name));
	const behindProxy = $derived(type === 'paper' && proxy !== '');
	const effectivePort = $derived(behindProxy ? null : (port ?? freePort));
	const proxyName = $derived(proxies.find((p) => String(p.id) === proxy)?.name ?? null);

	// --- Servidors existents ---
	let editing = $state<number | null>(null);
	let removing = $state<number | null>(null);
	let editMemory = $state('');

	function startEdit(s: Server) {
		removing = null;
		editing = editing === s.id ? null : s.id;
		editMemory = s.memory;
	}
</script>

<svelte:head><title>Servidors · Panell</title></svelte:head>

{#snippet icon(kind: ServerType)}
	<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
		{#if kind === 'paper'}
			<path d="M16 4 27 10v12l-11 6L5 22V10l11-6Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
			<path d="M5 10l11 6 11-6M16 16v12" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
			<path d="M10.5 7 21.5 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.45" />
		{:else}
			<rect x="11" y="4" width="10" height="8" rx="1" stroke="currentColor" stroke-width="2" />
			<path d="M16 12v5M7 22v-5h18v5" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
			<rect x="3" y="22" width="8" height="6" rx="1" stroke="currentColor" stroke-width="2" />
			<rect x="21" y="22" width="8" height="6" rx="1" stroke="currentColor" stroke-width="2" />
			<path d="M16 17v5" stroke="currentColor" stroke-width="2" />
			<rect x="12" y="22" width="8" height="6" rx="1" stroke="currentColor" stroke-width="2" />
		{/if}
	</svg>
{/snippet}

{#snippet memoryPicker(kind: ServerType, value: string, pick: (m: string) => void)}
	<div class="chips">
		{#each MEMORY_PRESETS[kind] as m (m)}
			<button type="button" class="chip" class:picked={value === m} onclick={() => pick(m)}>{m.replace(/([MG])$/, ' $1B')}</button>
		{/each}
		<input
			class="chip-input"
			value={MEMORY_PRESETS[kind].includes(value) ? '' : value}
			oninput={(e) => pick(e.currentTarget.value.toUpperCase())}
			placeholder="Altra (5G)"
			maxlength="4"
			aria-label="Una altra quantitat de memòria"
		/>
	</div>
{/snippet}

{#snippet node(s: Server)}
	<article class="node" class:current={s.id === data.currentServerId} class:is-error={s.status === 'error'}>
		<div class="node-main">
			<div class="tile" class:ready={s.status === 'ready'} class:error={s.status === 'error'} class:busy={s.status === 'creating'}>
				{@render icon(s.type)}
			</div>
			<div class="node-text">
				<div class="node-title">
					<strong>{s.name}</strong>
					{#if s.id === data.currentServerId}<span class="badge">Triat</span>{/if}
				</div>
				<div class="tags">
					<span class="tag">{s.type === 'paper' ? 'Paper' : 'Velocity'} {s.version || ''}</span>
					{#if s.memory}<span class="tag">{s.memory}</span>{/if}
					{#if s.hostPort !== null}<span class="tag strong">port {s.hostPort}</span>{/if}
					{#if s.managed}<span class="tag faint">mc-{s.slug}</span>{/if}
				</div>
			</div>
			<div class="node-status">
				<span class="dot" class:on={s.status === 'ready'} class:bad={s.status === 'error'}></span>
				{STATUS_LABELS[s.status]}
			</div>
		</div>

		{#if s.status === 'creating'}
			{@const c = s.creation}
			{#if c}
				{@const at = c.steps.indexOf(c.step)}
				<div class="creation">
					<div class="creation-head">
						<span>Pas {at + 1} de {c.steps.length}</span>
						<span class="muted">fa {duration(c.seconds)} que es crea</span>
					</div>
					<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax={c.steps.length} aria-valuenow={at}>
						{#each c.steps as step, i (step)}
							<span class="seg" class:done={i < at} class:now={i === at}></span>
						{/each}
					</div>
					<ol class="steps-list">
						{#each c.steps as step, i (step)}
							<li class:done={i < at} class:now={i === at}>
								<span class="mark" aria-hidden="true">{i < at ? '✓' : i === at ? '▸' : '·'}</span>
								<span>{STEP_LABELS[step]}</span>
								{#if i === at}<span class="muted">{duration(c.stepSeconds)}</span>{/if}
							</li>
						{/each}
					</ol>
					{#if c.step === 'image'}
						<p class="muted note">El primer cop cal baixar uns centenars de MB; els següents servidors del mateix tipus se salten aquest pas en segons.</p>
					{/if}
					{#if c.log.length > 0}
						<pre class="creation-log">{c.log.join('\n')}</pre>
					{/if}
				</div>
			{:else}
				<div class="progress" role="progressbar" aria-label="Creant el servidor"></div>
				<p class="muted note">S’està creant.</p>
			{/if}
		{:else if s.statusDetail}
			<p class="note" class:problem={s.status === 'error'}>{s.statusDetail}</p>
		{/if}

		<div class="node-actions">
			{#if s.id !== data.currentServerId}
				<form method="POST" action="?/select">
					<input type="hidden" name="id" value={s.id} />
					<input type="hidden" name="back" value="/servidors" />
					<button class="secondary small">Triar</button>
				</form>
			{/if}
			{#if owner && s.managed}
				{#if s.status === 'error'}
					<form method="POST" action="?/retry" use:enhance>
						<input type="hidden" name="id" value={s.id} />
						<button class="small">Reintentar</button>
					</form>
				{/if}
				{#if s.status !== 'creating'}
					<button class="secondary small" onclick={() => startEdit(s)}>Configurar</button>
					<button
						class="danger small"
						onclick={() => {
							editing = null;
							removing = removing === s.id ? null : s.id;
						}}>Treure</button
					>
				{/if}
			{/if}
		</div>

		{#if editing === s.id}
			<form
				method="POST"
				action="?/update"
				class="drawer"
				use:enhance={() =>
					async ({ update }) => {
						editing = null;
						await update();
					}}
			>
				<input type="hidden" name="id" value={s.id} />
				<input type="hidden" name="memory" value={editMemory} />
				<div class="field">
					<span class="field-label">Memòria</span>
					{@render memoryPicker(s.type, editMemory, (m) => (editMemory = m))}
				</div>
				<div class="row">
					<label>Versió <input name="version" value={s.version} required maxlength="20" /></label>
					{#if s.type === 'paper' && proxies.length > 0}
						<label>
							S’hi entra per
							<select name="proxyId">
								<option value="">Port propi</option>
								{#each proxies as p (p.id)}
									<option value={p.id} selected={p.id === s.proxyId}>Proxy «{p.name}»</option>
								{/each}
							</select>
						</label>
					{/if}
					<label>
						Port públic
						<input name="hostPort" type="number" min="1024" max="65535" value={s.hostPort ?? ''} placeholder="cap" />
					</label>
					<button style="margin-bottom: 0.75rem">Aplicar</button>
				</div>
				<p class="muted note">El servidor es reinicia si cal. Darrere d’un proxy, deixa el port públic buit.</p>
			</form>
		{/if}

		{#if removing === s.id}
			<form
				method="POST"
				action="?/delete"
				class="drawer danger-drawer"
				use:enhance={() =>
					async ({ update }) => {
						removing = null;
						await update();
					}}
			>
				<input type="hidden" name="id" value={s.id} />
				<p>S’atura el contenidor i les dades es mouen a la paperera (no s’esborren).</p>
				<div class="row">
					<label>
						Escriu <code>{s.slug}</code> per confirmar
						<input name="confirm" required autocomplete="off" />
					</label>
					<button class="danger" style="margin-bottom: 0.75rem">Treure «{s.name}»</button>
				</div>
			</form>
		{/if}
	</article>
{/snippet}

<div class="head">
	<h1>Servidors</h1>
	{#if owner && data.canProvision && !open}
		<button onclick={() => (open = true)}>+ Nou servidor</button>
	{/if}
</div>

<Flash {form} />

{#if owner && !data.canProvision}
	<section class="card">
		<p class="muted">La creació de servidors no està configurada (falta <code>MC_ROOT</code> al <code>.env</code> del panell).</p>
	</section>
{/if}

{#if open}
	<form
		method="POST"
		action="?/create"
		class="card builder"
		use:enhance={() =>
			async ({ result, update }) => {
				if (result.type === 'success') resetNew();
				await update({ reset: false });
			}}
	>
		<input type="hidden" name="type" value={type} />
		<input type="hidden" name="slug" value={effectiveSlug} />
		<input type="hidden" name="memory" value={memory} />
		<input type="hidden" name="proxyId" value={behindProxy ? proxy : ''} />
		<input type="hidden" name="hostPort" value={effectivePort ?? ''} />

		<div class="steps">
			<div class="field">
				<span class="field-label"><span class="num">1</span> Què vols crear?</span>
				<div class="options two">
					{#each TYPES as t (t.type)}
						<button type="button" class="option" class:picked={type === t.type} aria-pressed={type === t.type} onclick={() => setType(t.type)}>
							<span class="option-icon">{@render icon(t.type)}</span>
							<span class="option-text">
								<strong>{t.title}</strong>
								<span class="muted">{t.text}</span>
							</span>
						</button>
					{/each}
				</div>
			</div>

			<div class="field">
				<span class="field-label"><span class="num">2</span> Com es diu?</span>
				<div class="row">
					<label class="grow">
						Nom
						<input name="name" bind:value={name} required maxlength="40" autocomplete="off" placeholder={type === 'paper' ? 'Survival' : 'Entrada'} />
					</label>
					<label>
						Identificador
						<input
							value={effectiveSlug}
							oninput={(e) => {
								slug = e.currentTarget.value.toLowerCase();
								slugEdited = slug !== '';
							}}
							required
							pattern="[a-z][a-z0-9-]{'{1,23}'}"
							placeholder="survival"
							autocomplete="off"
							class="mono"
						/>
					</label>
				</div>
				<p class="muted note">L’identificador és el nom de la carpeta i del contenidor, i no es pot canviar després.</p>
			</div>

			<div class="field">
				<span class="field-label"><span class="num">3</span> Com hi entren els jugadors?</span>
				<div class="options">
					<div class="option with-port" class:picked={!behindProxy}>
						<button type="button" class="option-hit" aria-pressed={!behindProxy} onclick={() => (proxy = '')}>
							<span class="option-text">
								<strong>{type === 'velocity' ? 'Port públic del proxy' : 'Directament, amb port propi'}</strong>
								<span class="muted">Els jugadors posen l’adreça de la VM i aquest port.</span>
							</span>
						</button>
						<input
							type="number"
							min="1024"
							max="65535"
							class="port mono"
							value={port ?? freePort}
							oninput={(e) => (port = e.currentTarget.value === '' ? null : Number(e.currentTarget.value))}
							onfocus={() => (proxy = '')}
							aria-label="Port públic"
						/>
					</div>
					{#if type === 'paper'}
						{#each proxies as p (p.id)}
							<button
								type="button"
								class="option"
								class:picked={proxy === String(p.id)}
								aria-pressed={proxy === String(p.id)}
								onclick={() => (proxy = String(p.id))}
							>
								<span class="option-icon small-icon">{@render icon('velocity')}</span>
								<span class="option-text">
									<strong>Pel proxy «{p.name}»</strong>
									<span class="muted">Sense port propi: s’hi arriba des de l’adreça del proxy (port {p.hostPort}).</span>
								</span>
							</button>
						{/each}
					{/if}
				</div>
			</div>

			<div class="field">
				<span class="field-label"><span class="num">4</span> Memòria i versió</span>
				{@render memoryPicker(type, memory, (m) => (memory = m))}
				<div class="chips" style="margin-top: 0.6rem">
					<button type="button" class="chip" class:picked={version === ''} onclick={() => (version = '')}>Última versió</button>
					<input
						name="version"
						class="chip-input wide"
						bind:value={version}
						placeholder={type === 'paper' ? 'o una de concreta (26.2)' : 'o una de concreta'}
						maxlength="20"
						aria-label="Versió concreta"
					/>
				</div>
			</div>
		</div>

		<aside class="summary">
			<span class="field-label">Es crearà</span>
			<div class="preview-node">
				<div class="tile ready">{@render icon(type)}</div>
				<div class="node-text">
					<strong>{name || 'Sense nom'}</strong>
					<div class="tags">
						<span class="tag">{type === 'paper' ? 'Paper' : 'Velocity'} {version || 'última'}</span>
						<span class="tag">{memory || '—'}</span>
					</div>
				</div>
			</div>
			<ul class="facts">
				<li><span class="muted">Contenidor</span><code>mc-{effectiveSlug || '…'}</code></li>
				<li><span class="muted">Carpeta</span><code>servers/{effectiveSlug || '…'}/</code></li>
				<li>
					<span class="muted">S’hi entra</span>
					<span>{behindProxy ? `pel proxy «${proxyName}»` : `pel port ${effectivePort}`}</span>
				</li>
				{#if type === 'paper'}
					<li><span class="muted">Plugins</span><span>els del catàleg</span></li>
				{/if}
			</ul>
			<div class="row">
				<button disabled={!name || !effectiveSlug}>Crear</button>
				<button type="button" class="secondary" onclick={resetNew}>Cancel·lar</button>
			</div>
			<p class="muted note">La primera arrencada baixa la imatge i pot trigar uns minuts.</p>
		</aside>
	</form>
{/if}

{#if data.list.length === 0}
	{#if !open}
		<section class="card empty">
			<div class="tile big">{@render icon('paper')}</div>
			<h2>Encara no hi ha cap servidor</h2>
			<p class="muted">Cada servidor és un contenidor Docker que el panell crea i configura sol.</p>
			{#if owner && data.canProvision}
				<button onclick={() => (open = true)}>Crea el primer servidor</button>
			{/if}
		</section>
	{/if}
{:else}
	<section class="map">
		<div class="entry">
			<span class="entry-label">Jugadors</span>
		</div>
		<div class="lanes">
			{#each proxies as p (p.id)}
				{@const children = backendsOf(p.id)}
				<div class="lane">
					{@render node(p)}
					<div class="branch">
						{#each children as c (c.id)}
							<div class="twig">{@render node(c)}</div>
						{:else}
							<div class="twig"><p class="muted hollow">Aquest proxy encara no té cap servidor al darrere.</p></div>
						{/each}
					</div>
				</div>
			{/each}
			{#each standalone as s (s.id)}
				<div class="lane">{@render node(s)}</div>
			{/each}
		</div>
	</section>
{/if}

<style>
	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.mono {
		font-family: var(--font-mc);
	}
	.note {
		font-size: 0.85rem;
		margin: 0.4rem 0 0;
	}
	.note.problem {
		color: var(--danger);
	}

	/* Peça quadrada amb bisell, com una casella d'inventari. */
	.tile {
		width: 3rem;
		height: 3rem;
		flex: none;
		display: grid;
		place-items: center;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-deep);
		color: var(--muted);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.tile :global(svg) {
		width: 1.9rem;
		height: 1.9rem;
	}
	.tile.ready {
		background: var(--ok-bg);
		color: var(--ok);
		border-color: var(--ok);
	}
	.tile.error {
		background: var(--danger-bg);
		color: var(--danger);
		border-color: var(--danger);
	}
	.tile.busy {
		animation: pulse 1.4s ease-in-out infinite;
	}
	.tile.big {
		width: 4.5rem;
		height: 4.5rem;
	}
	.tile.big :global(svg) {
		width: 3rem;
		height: 3rem;
	}

	/* --- Mapa de servidors --- */
	.map {
		margin-bottom: 1rem;
	}
	.entry {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 0.2rem;
	}
	.entry-label {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--muted);
		border: 1px dashed var(--border-strong);
		border-radius: 999px;
		padding: 0.1rem 0.7rem;
	}
	/* El tronc es dibuixa tram a tram a cada branca, perquè s'acabi just a l'última. */
	.lanes {
		margin-left: 1.5rem;
		padding-top: 0.6rem;
	}
	.branch {
		margin-left: 1.5rem;
		padding-top: 0.7rem;
	}
	.lane,
	.twig {
		position: relative;
		padding: 0 0 0.8rem 1.4rem;
	}
	.lane::before,
	.twig::before {
		content: '';
		position: absolute;
		left: 0;
		top: 2.1rem;
		width: 1.4rem;
		border-top: 2px solid var(--border-strong);
	}
	.lane::after,
	.twig::after {
		content: '';
		position: absolute;
		left: 0;
		top: -0.7rem;
		bottom: 0;
		border-left: 2px solid var(--border-strong);
	}
	.lane:last-child::after,
	.twig:last-child::after {
		bottom: auto;
		height: calc(2.8rem + 2px);
	}
	.twig:last-child {
		padding-bottom: 0;
	}
	.hollow {
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		padding: 1rem;
		margin: 0;
		font-size: 0.88rem;
	}

	.node {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.7rem 0.85rem;
	}
	.node.current {
		border-color: var(--accent);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.node.is-error {
		border-color: var(--danger);
	}
	.node-main,
	.preview-node {
		display: flex;
		align-items: center;
		gap: 0.8rem;
	}
	.node-text {
		flex: 1;
		min-width: 0;
	}
	.node-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
		font-size: 1.05rem;
	}
	.node-status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.88rem;
		white-space: nowrap;
	}
	.dot.bad {
		background: var(--danger);
	}
	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: 0.3rem;
	}
	.tag {
		font-family: var(--font-mc);
		font-size: 0.75rem;
		padding: 0.05rem 0.4rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
	}
	.tag.strong {
		border-color: var(--border-strong);
		font-weight: 600;
	}
	.tag.faint {
		color: var(--muted);
		background: none;
	}
	.node-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.node-actions:empty {
		display: none;
	}
	.progress {
		height: 0.4rem;
		margin-top: 0.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: repeating-linear-gradient(-45deg, var(--bg-deep) 0 8px, var(--border-strong) 8px 16px);
		background-size: 200% 100%;
		animation: slide 1.2s linear infinite;
	}
	.creation {
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}
	.creation-head {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.88rem;
		font-weight: 600;
	}
	.creation-head .muted {
		font-weight: 400;
	}
	.track {
		display: flex;
		gap: 3px;
		margin: 0.45rem 0 0.6rem;
	}
	.seg {
		flex: 1;
		height: 0.5rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg-deep);
	}
	.seg.done {
		background: var(--ok);
		border-color: var(--ok);
	}
	.seg.now {
		background: repeating-linear-gradient(-45deg, var(--bg-deep) 0 6px, var(--border-strong) 6px 12px);
		background-size: 200% 100%;
		animation: slide 1.2s linear infinite;
	}
	.steps-list {
		list-style: none;
		padding: 0;
		margin: 0;
		font-size: 0.88rem;
	}
	.steps-list li {
		display: flex;
		gap: 0.5rem;
		padding: 0.12rem 0;
		color: var(--muted);
	}
	.steps-list li.done {
		color: var(--text);
	}
	.steps-list li.now {
		color: var(--text);
		font-weight: 600;
	}
	.steps-list li.now .muted {
		font-weight: 400;
	}
	.mark {
		width: 1rem;
		text-align: center;
		font-family: var(--font-mc);
	}
	li.done .mark {
		color: var(--ok);
	}
	.creation-log {
		margin: 0.6rem 0 0;
		padding: 0.5rem 0.6rem;
		max-height: 8.5rem;
		overflow: auto;
		background: var(--preview-bg);
		color: var(--preview-text);
		border-radius: var(--radius);
		font-size: 0.75rem;
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.drawer {
		margin-top: 0.7rem;
		padding-top: 0.7rem;
		border-top: 1px solid var(--border);
	}
	.danger-drawer p {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
	}

	/* --- Nou servidor --- */
	.builder {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 17rem;
		gap: 1.5rem;
		align-items: start;
	}
	.steps {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}
	.field-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 600;
		font-size: 0.95rem;
		margin-bottom: 0.5rem;
	}
	.num {
		width: 1.4rem;
		height: 1.4rem;
		display: grid;
		place-items: center;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-family: var(--font-mc);
		font-size: 0.8rem;
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.options {
		display: grid;
		gap: 0.5rem;
	}
	.options.two {
		grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
	}
	.option {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		text-align: left;
		white-space: normal;
		font-weight: 400;
		padding: 0.7rem 0.8rem;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border-strong);
	}
	div.option {
		border-radius: var(--radius);
	}
	.option-hit {
		flex: 1;
		text-align: left;
		white-space: normal;
		font-weight: 400;
		padding: 0;
		background: none;
		color: inherit;
		border: none;
		box-shadow: none;
	}
	.option.picked {
		border-color: var(--accent);
		background: var(--surface);
		box-shadow:
			inset 0 0 0 1px var(--accent),
			inset 4px 0 0 var(--accent);
	}
	.option-icon {
		flex: none;
		width: 2.6rem;
		height: 2.6rem;
		color: var(--muted);
	}
	.option-icon.small-icon {
		width: 1.8rem;
		height: 1.8rem;
	}
	.option.picked .option-icon {
		color: var(--text);
	}
	.option-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.86rem;
	}
	.option-text strong {
		font-size: 0.95rem;
	}
	.port {
		width: 6.5rem;
		flex: none;
	}
	.grow {
		flex: 1;
		min-width: 12rem;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}
	.chip {
		background: var(--bg);
		color: var(--text);
		border-color: var(--border-strong);
		font-family: var(--font-mc);
		font-size: 0.85rem;
		padding: 0.35rem 0.75rem;
	}
	.chip.picked {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent-strong);
	}
	.chip-input {
		width: 7rem;
		font-family: var(--font-mc);
		font-size: 0.85rem;
		padding: 0.35rem 0.6rem;
	}
	.chip-input.wide {
		width: 15rem;
	}
	.summary {
		position: sticky;
		top: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.9rem;
	}
	.facts {
		list-style: none;
		padding: 0;
		margin: 0.8rem 0;
		font-size: 0.86rem;
	}
	.facts li {
		display: flex;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.3rem 0;
		border-bottom: 1px solid var(--border);
	}
	.facts li > :last-child {
		text-align: right;
		overflow-wrap: anywhere;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		text-align: center;
		padding: 2.5rem 1rem;
	}
	.empty h2,
	.empty p {
		margin: 0;
	}
	.empty button {
		margin-top: 0.8rem;
	}

	@keyframes slide {
		to {
			background-position: -32px 0;
		}
	}
	@keyframes pulse {
		50% {
			opacity: 0.45;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.progress,
		.seg.now,
		.tile.busy {
			animation: none;
		}
	}
	@media (max-width: 900px) {
		.builder {
			grid-template-columns: 1fr;
		}
		.summary {
			position: static;
		}
	}
</style>

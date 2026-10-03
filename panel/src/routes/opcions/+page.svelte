<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Flash from '$lib/components/Flash.svelte';
	import MotdEditor from '$lib/components/MotdEditor.svelte';
	import { DIFFICULTIES, DIFFICULTY_LABELS, GAMEMODES, GAMEMODE_LABELS } from '$lib/servers';

	let { data, form } = $props();

	// Mentre s'aplica un canvi el servidor es reinicia: la pàgina es refresca sola.
	$effect(() => {
		if (!data.busy) return;
		const timer = setInterval(invalidateAll, 3000);
		return () => clearInterval(timer);
	});

	const RULES = [
		{ name: 'pvp', label: 'PvP', text: 'Els jugadors es poden fer mal entre ells.' },
		{ name: 'allowNether', label: 'Nether', text: 'Es pot anar al Nether.' },
		{ name: 'allowFlight', label: 'Permetre volar', text: 'No expulsa qui vola en supervivència. Cal amb alguns plugins.' },
		{ name: 'hardcore', label: 'Hardcore', text: 'Qui mor passa a espectador.' }
	] as const;

	// Valors del formulari que tenen vista prèvia o lectura en viu.
	let maxPlayers = $derived(data.kind === 'game' ? data.game.maxPlayers : data.kind === 'proxy' ? data.proxy.maxPlayers : 0);
	let view = $derived(data.kind === 'game' ? data.game.viewDistance : 10);
	let simulation = $derived(data.kind === 'game' ? data.game.simulationDistance : 10);

	// --- Imatge del servidor ---
	let iconPreview = $state<string | null>(null);
	let iconError = $state<string | null>(null);
	const iconSrc = $derived(iconPreview ?? (data.kind !== 'none' && data.icon ? `/opcions/icon?v=${data.icon}` : null));

	/** El joc només accepta PNG de 64×64: es retalla quadrada pel centre i s'escala aquí mateix. */
	async function toIcon(file: File): Promise<Blob> {
		const bitmap = await createImageBitmap(file);
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 64;
		const ctx = canvas.getContext('2d')!;
		const side = Math.min(bitmap.width, bitmap.height);
		// Una imatge ja petita (pixel art) s'amplia sense difuminar.
		ctx.imageSmoothingEnabled = side > 64;
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 64, 64);
		return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('sense imatge'))), 'image/png'));
	}

	const iconSubmit: import('@sveltejs/kit').SubmitFunction = async ({ action, formData, cancel }) => {
		iconError = null;
		if (action.search.includes('iconRemove')) {
			iconPreview = null;
			return;
		}
		const file = formData.get('icon');
		if (!(file instanceof File) || file.size === 0) return cancel();
		try {
			const icon = await toIcon(file);
			formData.set('icon', icon, 'server-icon.png');
			iconPreview = URL.createObjectURL(icon);
		} catch {
			iconError = 'No s’ha pogut llegir aquesta imatge. Prova amb un PNG o un JPG.';
			cancel();
		}
	};

	const confirmRestart = (what: string) =>
		({ cancel }: { cancel: () => void }) => {
			if (!confirm(`Per aplicar-ho ${what} es reinicia i els jugadors es desconnecten. Continuar?`)) cancel();
		};
</script>

<svelte:head><title>Opcions · Panell</title></svelte:head>

<h1>Opcions{#if data.name}<span class="muted"> · {data.name}</span>{/if}</h1>

<Flash {form} />

{#snippet iconControls()}
	<div class="icon-row">
		<label class="file">
			Imatge del servidor
			<input
				type="file"
				name="icon"
				accept="image/*"
				form="icon-form"
				onchange={(e) => {
					if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
				}}
			/>
			<span class="muted hint">Qualsevol imatge: es retalla quadrada i es deixa a 64×64, que és el que admet el joc.</span>
		</label>
		{#if data.kind !== 'none' && data.icon}
			<button type="submit" class="secondary" form="icon-form" formaction="?/iconRemove">Treure la imatge</button>
		{/if}
	</div>
	{#if iconError}<p class="problem hint">{iconError}</p>{/if}
{/snippet}

<form id="icon-form" method="POST" action="?/icon" enctype="multipart/form-data" use:enhance={iconSubmit} hidden></form>

{#if data.kind === 'none'}
	<section class="card">
		{#if data.busy}
			<p><span class="dot"></span> <strong>S’està aplicant un canvi…</strong></p>
			<p class="muted">El servidor es reinicia. Aquesta pàgina es refresca sola quan acabi.</p>
		{:else if data.name}
			<p class="muted">Aquest servidor no s’ha creat des del panell, així que les seves opcions no es poden canviar des d’aquí.</p>
		{:else}
			<p class="muted">Encara no hi ha cap servidor. <a href="/servidors">Crea’n un a «Servidors»</a>.</p>
		{/if}
	</section>
{:else if data.kind === 'proxy'}
	<p class="muted intro">
		Això és el que veuen els jugadors a la llista de servidors abans d’entrar. Les opcions de la partida (dificultat, mode de
		joc…) són de cada servidor del darrere: tria’l al selector del menú.
	</p>
	<form method="POST" action="?/proxy" use:enhance={confirmRestart('el proxy')}>
		<section class="card">
			<h2>Llista de servidors</h2>
			<MotdEditor name="motd" value={data.proxy.motd} serverName={data.name ?? ''} {maxPlayers} icon={iconSrc} />
			{@render iconControls()}
			<label class="short">
				Jugadors màxims que s’hi mostren
				<input name="maxPlayers" type="number" min="1" bind:value={maxPlayers} required />
				<span class="muted hint">Només és el número que es veu; no limita qui entra.</span>
			</label>
		</section>
		<div class="savebar">
			<button>Desar i reiniciar el proxy</button>
			<span class="muted hint">Reiniciar el proxy desconnecta tothom de tots els seus servidors.</span>
		</div>
	</form>
{:else}
	{@const g = data.game}
	<form method="POST" action="?/game" use:enhance={confirmRestart('el servidor')}>
		<div class="columns">
			<section class="card">
				<h2>Llista de servidors</h2>
				<MotdEditor name="motd" value={g.motd} serverName={data.name ?? ''} {maxPlayers} icon={iconSrc} />
				{@render iconControls()}
				{#if data.proxyName}
					<p class="muted hint">
						Aquest servidor és darrere del proxy «{data.proxyName}»: a la llista dels jugadors s’hi veu el missatge del proxy, no
						aquest. Per canviar-lo, tria el proxy al selector del menú.
					</p>
				{/if}
				<label class="short">
					Màxim de jugadors
					<input name="maxPlayers" type="number" min="1" max="1000" bind:value={maxPlayers} required />
				</label>
			</section>

			<section class="card">
				<h2>Partida</h2>
				<div class="group">
					<span class="group-label">Dificultat</span>
					<div class="seg">
						{#each DIFFICULTIES as d (d)}
							<label class="seg-item"><input type="radio" name="difficulty" value={d} checked={g.difficulty === d} /><span>{DIFFICULTY_LABELS[d]}</span></label>
						{/each}
					</div>
				</div>
				<div class="group">
					<span class="group-label">Mode de joc per defecte</span>
					<div class="seg">
						{#each GAMEMODES as m (m)}
							<label class="seg-item"><input type="radio" name="gamemode" value={m} checked={g.gamemode === m} /><span>{GAMEMODE_LABELS[m]}</span></label>
						{/each}
					</div>
				</div>
				<div class="rules">
					{#each RULES as r (r.name)}
						<label class="rule">
							<input type="checkbox" name={r.name} checked={g[r.name]} />
							<span><strong>{r.label}</strong><span class="muted hint">{r.text}</span></span>
						</label>
					{/each}
				</div>
			</section>

			<section class="card">
				<h2>Rendiment</h2>
				<p class="muted hint">Baixar aquestes distàncies és el que més alleugereix un servidor que va just.</p>
				<label class="slider">
					<span class="slider-head"><span>Distància de visió</span><strong>{view} chunks</strong></span>
					<input name="viewDistance" type="range" min="2" max="32" bind:value={view} />
					<span class="muted hint">Fins on veu el món cada jugador.</span>
				</label>
				<label class="slider">
					<span class="slider-head"><span>Distància de simulació</span><strong>{simulation} chunks</strong></span>
					<input name="simulationDistance" type="range" min="2" max="32" bind:value={simulation} />
					<span class="muted hint">Fins on passen coses al voltant de cada jugador: cultius, mobs, redstone.</span>
				</label>
			</section>

			<section class="card">
				<h2>Accés i protecció</h2>
				<div class="rules">
					<label class="rule">
						<input type="checkbox" name="whitelist" checked={g.whitelist} />
						<span><strong>Llista blanca</strong><span class="muted hint">Només hi entren els jugadors de la llista de més avall.</span></span>
					</label>
				</div>
				<label class="short">
					Protecció de l’inici
					<input name="spawnProtection" type="number" min="0" max="256" value={g.spawnProtection} required />
					<span class="muted hint">Blocs al voltant de l’inici on només construeixen els operadors. 0 = sense.</span>
				</label>
			</section>
		</div>

		<div class="savebar">
			<button>Desar i reiniciar</button>
			<span class="muted hint">Els canvis s’apliquen reiniciant el servidor.</span>
		</div>
	</form>

	<section class="card">
		<h2>Jugadors de la llista blanca</h2>
		{#if !g.whitelist}
			<p class="muted">La llista blanca està desactivada: hi pot entrar tothom.</p>
		{/if}
		{#if data.whitelist === null}
			<p class="muted">Engega el servidor per veure i canviar els jugadors de la llista.</p>
		{:else}
			{#if data.whitelist.length === 0}
				<p class="muted">Encara no hi ha ningú a la llista.</p>
			{:else}
				<div class="names">
					{#each data.whitelist as player (player)}
						<form method="POST" action="?/whitelist" use:enhance class="name">
							<input type="hidden" name="player" value={player} />
							<input type="hidden" name="op" value="remove" />
							<span>{player}</span>
							<button class="secondary small" title="Treure {player}" aria-label="Treure {player}">✕</button>
						</form>
					{/each}
				</div>
			{/if}
			<form method="POST" action="?/whitelist" use:enhance class="row add">
				<input type="hidden" name="op" value="add" />
				<label>Nom del jugador <input name="player" required maxlength="32" autocomplete="off" /></label>
				<button>Afegir</button>
			</form>
		{/if}
	</section>
{/if}

<style>
	.intro {
		max-width: 60rem;
	}
	.columns {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
		gap: 1rem;
		align-items: start;
	}
	.columns .card {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.card h2,
	.card p {
		margin: 0;
	}
	form > .card {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		max-width: 44rem;
	}
	label {
		margin: 0;
	}
	.short input {
		width: 9rem;
	}
	.hint {
		font-size: 0.8rem;
	}
	.group-label {
		display: block;
		font-size: 0.88rem;
		margin-bottom: 0.3rem;
	}

	.icon-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
		align-items: center;
	}
	.file input {
		padding: 0.3rem;
	}
	.problem {
		color: var(--danger);
	}
	.seg {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.seg-item {
		flex-direction: row;
		cursor: pointer;
	}
	.seg-item input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.seg-item span {
		padding: 0.4rem 0.8rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.seg-item input:checked + span {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent-strong);
	}
	.seg-item input:focus-visible + span {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.rules {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.rule {
		flex-direction: row;
		align-items: flex-start;
		gap: 0.6rem;
		padding: 0.5rem 0.7rem;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg);
		cursor: pointer;
	}
	.rule input {
		margin-top: 0.2rem;
	}
	.rule > span {
		display: flex;
		flex-direction: column;
	}

	.slider-head {
		display: flex;
		justify-content: space-between;
	}
	.slider input {
		padding: 0;
		accent-color: var(--accent);
	}

	.savebar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.8rem;
		margin: 1rem 0;
		padding: 0.7rem 0.9rem;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
	}

	.names {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.6rem;
	}
	.name {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.2rem 0.3rem 0.2rem 0.6rem;
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		background: var(--bg);
		font-family: var(--font-mc);
		font-size: 0.88rem;
	}
	.add {
		margin-top: 0.8rem;
		align-items: end;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';
	import { formatDate } from '$lib/format';
	import { hasRole } from '$lib/roles';

	let { data, form } = $props();

	const canControl = $derived(hasRole(data.user, 'admin'));
	const canConsole = $derived(hasRole(data.user, 'owner'));
	const s = $derived(data.server);

	const powerActions = [
		{ action: 'start', label: 'Iniciar', confirm: null, cls: '' },
		{ action: 'restart', label: 'Reiniciar', confirm: 'Reiniciar el servidor? Els jugadors es desconnectaran.', cls: 'secondary' },
		{ action: 'stop', label: 'Aturar', confirm: 'Aturar el servidor?', cls: 'danger' }
	];

	const pct = (v: number | null) => Math.max(0, Math.min(100, v ?? 0));
	const statusLabel = $derived(!s ? '—' : s.running ? 'Encès' : s.exitedWithError ? 'Ha petat' : 'Aturat');
</script>

<svelte:head><title>Servidor · Panell</title></svelte:head>

<h1>Servidor</h1>

<Flash {form} />

{#if !data.dockerEnabled}
	<section class="card">
		<p class="muted">Docker no està configurat al panell (falta MC_CONTAINER).</p>
	</section>
{:else if data.error}
	<section class="card">
		<p><span class="status-dot"></span> <strong>Sense connexió amb Docker</strong></p>
		<p class="muted">{data.error}</p>
	</section>
{:else}
	<section class="hero card" class:is-on={s?.running} class:is-crashed={s?.exitedWithError}>
		<div class="hero-top">
			<div class="hero-status">
				<span class="status-dot" class:on={s?.running} class:crashed={s?.exitedWithError}></span>
				<div>
					<div class="status-label">{statusLabel}</div>
					{#if s?.version}<div class="muted small">{s.version}</div>{/if}
				</div>
			</div>
			{#if s?.running && s.startedAt}
				<div class="uptime muted small">Encès des de {formatDate(s.startedAt)}</div>
			{/if}
		</div>

		{#if s?.running}
			<div class="meters">
				<div class="meter">
					<div class="meter-label">
						<span>Jugadors</span>
						<span>{s.online ?? '?'} / {s.max ?? '?'}</span>
					</div>
					<div class="bar"><div class="bar-fill players" style="width: {s.max && s.online !== null ? pct((s.online / s.max) * 100) : 0}%"></div></div>
				</div>
				<div class="meter">
					<div class="meter-label">
						<span>CPU</span>
						<span>{s.cpuPercent ?? '?'}%</span>
					</div>
					<div class="bar"><div class="bar-fill cpu" style="width: {pct(s.cpuPercent)}%"></div></div>
				</div>
				<div class="meter">
					<div class="meter-label">
						<span>RAM</span>
						<span>{s.memUsedMB ?? '?'} MB{#if s.memLimitMB} / {s.memLimitMB} MB{/if}</span>
					</div>
					<div class="bar"><div class="bar-fill mem" style="width: {pct(s.memPercent)}%"></div></div>
				</div>
			</div>
		{/if}

		{#if canControl}
			<div class="row actions">
				{#each powerActions as a (a.action)}
					<form
						method="POST"
						action="?/power"
						use:enhance={({ cancel }) => {
							if (a.confirm && !confirm(a.confirm)) cancel();
						}}
					>
						<input type="hidden" name="action" value={a.action} />
						<button class={a.cls}>{a.label}</button>
					</form>
				{/each}
				<form method="POST" action="?/backup" use:enhance>
					<button class="secondary">Còpia de seguretat</button>
				</form>
			</div>
		{/if}
	</section>

	{#if canConsole}
		<section class="card console-card">
			<h2>Consola</h2>
			{#if !data.rconEnabled}
				<p class="muted">RCON no està configurat (falten MC_RCON_HOST/PORT/PASSWORD).</p>
			{:else}
				<form method="POST" action="?/command" use:enhance class="console-row">
					<span class="prompt">/</span>
					<input name="command" maxlength="256" placeholder="say Hola a tothom!" autocomplete="off" class="console-input" />
					<button>Enviar</button>
				</form>
			{/if}
		</section>
	{/if}

	<section class="card">
		<h2>Últimes accions del servidor</h2>
		{#if data.recent.length === 0}
			<p class="muted">Encara no hi ha accions registrades.</p>
		{:else}
			<ul class="plain">
				{#each data.recent as e (e.id)}
					<li>
						<span><strong>{e.username}</strong> · {e.action}</span>
						<span class="muted">{formatDate(e.at)}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.hero {
		position: relative;
		overflow: hidden;
		padding: 1.4rem 1.5rem;
	}
	.hero::before {
		content: '';
		position: absolute;
		inset: 0;
		width: 6px;
		background: var(--border-strong);
	}
	.hero.is-on::before {
		background: var(--ok);
	}
	.hero.is-crashed::before {
		background: var(--danger);
	}
	.hero-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.hero-status {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}
	.status-dot {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 50%;
		background: var(--muted);
		flex: none;
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
	}
	.status-dot.on {
		background: var(--ok);
	}
	.status-dot.crashed {
		background: var(--danger);
	}
	.status-label {
		font-size: 1.3rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}
	.small {
		font-size: 0.8rem;
	}
	.meters {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		margin-top: 1.2rem;
	}
	.meter-label {
		display: flex;
		justify-content: space-between;
		font-size: 0.82rem;
		color: var(--muted);
		margin-bottom: 0.3rem;
	}
	.bar {
		height: 0.55rem;
		border-radius: var(--radius);
		background: var(--bg-deep);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	.bar-fill {
		height: 100%;
		border-radius: 1px;
		transition: width 0.4s ease;
	}
	.bar-fill.players {
		background: var(--role-mod);
	}
	.bar-fill.cpu {
		background: var(--role-admin);
	}
	.bar-fill.mem {
		background: var(--role-owner);
	}
	.actions {
		margin-top: 1.3rem;
		padding-top: 1rem;
		border-top: 1px solid var(--border);
	}
	.console-card h2 {
		font-family: var(--font-mc);
	}
	.console-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: var(--preview-bg);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0.5rem 0.7rem;
	}
	.prompt {
		color: var(--preview-text);
		font-family: var(--font-mc);
		font-weight: 700;
		flex: none;
	}
	.console-input {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--preview-text);
		font-family: var(--font-mc);
		padding: 0.2rem 0;
	}
	.console-input:focus-visible {
		outline: none;
	}
	.console-row button {
		flex: none;
	}
</style>

<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import Flash from '$lib/components/Flash.svelte';
	import { hasRole } from '$lib/roles';
	import { DEFAULTS, STATUS_LABELS, TYPE_LABELS } from '$lib/servers';

	let { data, form } = $props();

	const owner = $derived(hasRole(data.user, 'owner'));
	const proxies = $derived(data.list.filter((s) => s.type === 'velocity'));
	const creating = $derived(data.list.some((s) => s.status === 'creating'));

	let editing = $state<number | null>(null);
	let removing = $state<number | null>(null);

	let newType = $state<'paper' | 'velocity'>('paper');
	let newProxy = $state('');

	// Mentre algun servidor s'està creant, es va refrescant l'estat.
	$effect(() => {
		if (!creating) return;
		const timer = setInterval(invalidateAll, 4000);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>Servidors · Panell</title></svelte:head>

<h1>Servidors</h1>
<p class="muted">
	Cada servidor és un contenidor Docker. Un <strong>proxy</strong> (Velocity) és la porta d’entrada que reparteix els
	jugadors entre diversos servidors <strong>normals</strong> (Paper); si només en vols un, no et cal cap proxy.
</p>

<Flash {form} />

{#if data.list.length === 0}
	<section class="card"><p class="muted">Encara no hi ha cap servidor.</p></section>
{:else}
	<div class="card table-wrap">
		<table>
			<thead>
				<tr>
					<th>Servidor</th>
					<th>Tipus</th>
					<th>Versió</th>
					<th>Memòria</th>
					<th>S’hi entra per</th>
					<th>Estat</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.list as s (s.id)}
					<tr>
						<td>
							{s.name}
							{#if s.id === data.currentServerId}<span class="muted">(triat)</span>{/if}
							<br /><code>{s.slug}</code>
						</td>
						<td>{TYPE_LABELS[s.type]}</td>
						<td>{s.version || '—'}</td>
						<td>{s.memory || '—'}</td>
						<td>
							{#if s.proxyName}
								proxy «{s.proxyName}»
							{:else if s.hostPort !== null}
								port {s.hostPort}
							{:else}
								—
							{/if}
						</td>
						<td>
							<span class="dot" class:on={s.status === 'ready'}></span>
							{STATUS_LABELS[s.status]}
							{#if s.statusDetail}<br /><span class="muted detail">{s.statusDetail}</span>{/if}
						</td>
						<td>
							<div class="row">
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
											<button class="secondary small">Reintentar</button>
										</form>
									{/if}
									{#if s.status !== 'creating'}
										<button class="secondary small" onclick={() => (editing = editing === s.id ? null : s.id)}>Configurar</button>
										<button class="danger small" onclick={() => (removing = removing === s.id ? null : s.id)}>Treure</button>
									{/if}
								{/if}
							</div>
						</td>
					</tr>
					{#if editing === s.id}
						<tr>
							<td colspan="7">
								<form
									method="POST"
									action="?/update"
									use:enhance={() =>
										async ({ update }) => {
											editing = null;
											await update();
										}}
									class="row"
								>
									<input type="hidden" name="id" value={s.id} />
									<label>Versió <input name="version" value={s.version} required maxlength="20" /></label>
									<label>Memòria <input name="memory" value={s.memory} required maxlength="4" /></label>
									{#if s.type === 'paper'}
										<label>
											Proxy
											<select name="proxyId">
												<option value="">Cap (port propi)</option>
												{#each proxies as p (p.id)}
													<option value={p.id} selected={p.id === s.proxyId}>{p.name}</option>
												{/each}
											</select>
										</label>
									{/if}
									<label>
										Port públic
										<input name="hostPort" type="number" min="1024" max="65535" value={s.hostPort ?? ''} />
									</label>
									<button class="small" style="margin-bottom: 0.75rem">Aplicar</button>
								</form>
								<p class="muted detail">Aplicar la configuració reinicia el servidor si cal.</p>
							</td>
						</tr>
					{/if}
					{#if removing === s.id}
						<tr>
							<td colspan="7">
								<form
									method="POST"
									action="?/delete"
									use:enhance={() =>
										async ({ update }) => {
											removing = null;
											await update();
										}}
									class="row"
								>
									<input type="hidden" name="id" value={s.id} />
									<label>
										Escriu <code>{s.slug}</code> per confirmar
										<input name="confirm" required autocomplete="off" />
									</label>
									<button class="danger small" style="margin-bottom: 0.75rem">Treure «{s.name}»</button>
								</form>
								<p class="muted detail">S’atura el contenidor i les dades es mouen a la paperera del servidor (no s’esborren).</p>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

{#if owner}
	<section class="card">
		<h2>Nou servidor</h2>
		{#if !data.canProvision}
			<p class="muted">La creació de servidors no està configurada (falta <code>MC_ROOT</code> al <code>.env</code> del panell).</p>
		{:else}
			<form method="POST" action="?/create" use:enhance class="row">
				<label>Nom <input name="name" required maxlength="40" autocomplete="off" /></label>
				<label>
					Identificador
					<input name="slug" required pattern="[a-z][a-z0-9-]{'{1,23}'}" placeholder="survival" autocomplete="off" />
				</label>
				<label>
					Tipus
					<select name="type" bind:value={newType}>
						<option value="paper">{TYPE_LABELS.paper}</option>
						<option value="velocity">{TYPE_LABELS.velocity}</option>
					</select>
				</label>
				<label>Versió <input name="version" placeholder={DEFAULTS[newType].version} maxlength="20" /></label>
				<label>Memòria <input name="memory" placeholder={DEFAULTS[newType].memory} maxlength="4" /></label>
				{#if newType === 'paper' && proxies.length > 0}
					<label>
						Proxy
						<select name="proxyId" bind:value={newProxy}>
							<option value="">Cap (port propi)</option>
							{#each proxies as p (p.id)}
								<option value={String(p.id)}>{p.name}</option>
							{/each}
						</select>
					</label>
				{/if}
				{#if newType === 'velocity' || newProxy === '' || proxies.length === 0}
					<label>
						Port públic
						<input name="hostPort" type="number" min="1024" max="65535" required placeholder="25565" />
					</label>
				{/if}
				<button style="margin-bottom: 0.75rem">Crear</button>
			</form>
			<p class="muted detail">
				L’identificador és el nom de la carpeta i del contenidor (<code>mc-…</code>) i no es pot canviar després. La primera
				arrencada baixa la imatge i pot trigar uns minuts.
			</p>
		{/if}
	</section>
{/if}

<style>
	.detail {
		font-size: 0.85rem;
	}
</style>

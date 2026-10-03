<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';
	import { ROLES, ROLE_LABELS } from '$lib/roles';
	import { formatDate } from '$lib/format';

	let { data, form } = $props();
	let resetting = $state<number | null>(null);
</script>

<svelte:head><title>Usuaris del panell · Panell</title></svelte:head>

<h1>Usuaris del panell</h1>
<p class="muted">
	Comptes per entrar a aquest panell (no són els rols del joc).
	<strong>Moderador</strong>: només mira. <strong>Admin</strong>: gestiona jugadors, grups i tags.
	<strong>Owner</strong>: a més, gestiona aquests comptes.
</p>

<Flash {form} />

<div class="card table-wrap">
	<table>
		<thead>
			<tr>
				<th>Usuari</th>
				<th>Rol</th>
				<th>Creat</th>
				<th>Estat</th>
				<th></th>
			</tr>
		</thead>
		<tbody>
			{#each data.users as u (u.id)}
				{@const self = u.id === data.user?.id}
				<tr>
					<td>{u.username} {#if self}<span class="muted">(tu)</span>{/if}</td>
					<td>
						{#if self}
							<span class="badge">{ROLE_LABELS[u.role]}</span>
						{:else}
							<form method="POST" action="?/setRole" use:enhance class="row">
								<input type="hidden" name="id" value={u.id} />
								<select name="role" onchange={(e) => e.currentTarget.form?.requestSubmit()}>
									{#each ROLES as r (r)}
										<option value={r} selected={r === u.role}>{ROLE_LABELS[r]}</option>
									{/each}
								</select>
							</form>
						{/if}
					</td>
					<td class="muted">{formatDate(u.created_at)}</td>
					<td>{u.disabled ? 'Desactivat' : 'Actiu'}</td>
					<td>
						{#if !self}
							<div class="row">
								<button class="secondary small" onclick={() => (resetting = resetting === u.id ? null : u.id)}>Contrasenya</button>
								<form method="POST" action="?/toggleDisabled" use:enhance>
									<input type="hidden" name="id" value={u.id} />
									<button class="secondary small">{u.disabled ? 'Activar' : 'Desactivar'}</button>
								</form>
								<form
									method="POST"
									action="?/delete"
									use:enhance={({ cancel }) => {
										if (!confirm(`Esborrar l'usuari ${u.username}?`)) cancel();
									}}
								>
									<input type="hidden" name="id" value={u.id} />
									<button class="danger small">Esborrar</button>
								</form>
							</div>
							{#if resetting === u.id}
								<form method="POST" action="?/resetPassword" use:enhance class="row" style="margin-top: 0.5rem">
									<input type="hidden" name="id" value={u.id} />
									<input name="password" type="password" minlength="10" required placeholder="Nova contrasenya" autocomplete="new-password" />
									<button class="small">Desar</button>
								</form>
							{/if}
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<section class="card">
	<h2>Nou usuari</h2>
	<form method="POST" action="?/create" use:enhance class="row">
		<label>Usuari <input name="username" required minlength="3" maxlength="32" autocomplete="off" /></label>
		<label>Contrasenya <input name="password" type="password" required minlength="10" autocomplete="new-password" /></label>
		<label>
			Rol
			<select name="role">
				{#each ROLES as r (r)}
					<option value={r} selected={r === 'mod'}>{ROLE_LABELS[r]}</option>
				{/each}
			</select>
		</label>
		<button style="margin-bottom: 0.75rem">Crear</button>
	</form>
</section>

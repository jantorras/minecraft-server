<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';
	import { ROLE_LABELS } from '$lib/roles';

	let { data, form } = $props();
</script>

<svelte:head><title>El meu compte · Panell</title></svelte:head>

<h1>El meu compte</h1>

<Flash {form} />

<div class="grid">
	<section class="card">
		<h2>{data.user?.username}</h2>
		<p>Rol al panell: <span class="badge">{data.user ? ROLE_LABELS[data.user.role] : ''}</span></p>
	</section>

	<section class="card">
		<h2>Canviar contrasenya</h2>
		<form method="POST" action="?/password" use:enhance>
			<label>Contrasenya actual <input name="current" type="password" autocomplete="current-password" required /></label>
			<label>Nova contrasenya <input name="next" type="password" autocomplete="new-password" minlength="10" required /></label>
			<label>Repeteix-la <input name="confirm" type="password" autocomplete="new-password" minlength="10" required /></label>
			<button>Canviar</button>
		</form>
	</section>
</div>

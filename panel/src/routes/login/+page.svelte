<script lang="ts">
	import { enhance } from '$app/forms';
	import Flash from '$lib/components/Flash.svelte';

	let { form } = $props();
</script>

<svelte:head><title>Entrar · Panell</title></svelte:head>

<div class="wrap">
	<form method="POST" use:enhance class="card">
		<div class="brand">
			<span class="mark" aria-hidden="true"></span>
			<h1>Panell del servidor</h1>
		</div>
		<Flash {form} />
		<label>
			Usuari
			<input name="username" autocomplete="username" required value={form?.username ?? ''} />
		</label>
		<label>
			Contrasenya
			<input name="password" type="password" autocomplete="current-password" required />
		</label>
		<button>Entrar</button>
	</form>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: var(--bg-deep);
	}
	form {
		width: 100%;
		max-width: 360px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin-bottom: 1.1rem;
	}
	.mark {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 2px;
		background: var(--accent);
		box-shadow:
			inset 1px 1px 0 var(--bevel-light),
			inset -1px -1px 0 var(--bevel-dark);
		flex: none;
	}
	h1 {
		font-size: 1.15rem;
		margin: 0;
	}
	button {
		width: 100%;
	}
</style>

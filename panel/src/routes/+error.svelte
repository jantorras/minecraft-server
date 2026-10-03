<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>Error · Panell</title></svelte:head>

<div class="card">
	<h1>{page.status === 404 ? 'No trobat' : 'Alguna cosa ha fallat'}</h1>
	<p>{page.error?.message}</p>
	<p><a href="/">← Tornar a l'inici</a></p>
</div>

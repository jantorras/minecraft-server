<script lang="ts">
	let { form }: { form: { error?: string; success?: string } | null | undefined } = $props();
</script>

{#if form?.error}
	<p class="flash error" role="alert">{form.error}</p>
{:else if form?.success}
	<p class="flash success" role="status">{form.success}</p>
{/if}

<style>
	.flash {
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		margin: 0 0 1rem;
	}
	.error {
		background: var(--danger-bg);
		color: var(--danger);
	}
	.success {
		background: var(--ok-bg);
		color: var(--ok);
	}
</style>

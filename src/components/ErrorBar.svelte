<script lang="ts">
	import { store } from '$lib/store.svelte';
</script>

{#if store.errorMessage}
	<div class="error-bar">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
			<circle cx="12" cy="12" r="10" />
			<line x1="15" y1="9" x2="9" y2="15" />
			<line x1="9" y1="9" x2="15" y2="15" />
		</svg>
		<span>{store.errorMessage}</span>
		<button class="dismiss" onclick={() => store.setError(null)} aria-label="Dismiss">
			✕
		</button>
	</div>
{/if}

<style>
	.error-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #991b1b;
		font-size: 0.9rem;
	}

	.dismiss {
		margin-left: auto;
		background: none;
		border: none;
		color: #991b1b;
		cursor: pointer;
		font-size: 1rem;
		padding: 0 0.25rem;
	}

	.dismiss:hover {
		opacity: 0.7;
	}
</style>

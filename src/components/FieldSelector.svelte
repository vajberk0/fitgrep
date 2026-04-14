<script lang="ts">
	import { store } from '$lib/store.svelte';

	function toggle(key: string) {
		store.toggleField(key);
	}
</script>

{#if store.data}
	<div class="field-selector">
		<span class="selector-label">Metrics</span>
		<div class="chips">
			{#each store.data.availableFields as field (field.key)}
				<button
					class="chip"
					class:enabled={store.enabledFields.includes(field.key)}
					style="--chip-color: {field.color}"
					onclick={() => toggle(field.key)}
					aria-pressed={store.enabledFields.includes(field.key)}
				>
					<span class="chip-dot"></span>
					{field.label}
					{#if field.unit}
						<span class="chip-unit">({field.unit})</span>
					{/if}
				</button>
			{/each}
		</div>
	</div>
{/if}

<style>
	.field-selector {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}

	.selector-label {
		font-size: 0.8rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-right: 0.25rem;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.3rem 0.65rem;
		border-radius: 20px;
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		border: 1.5px solid var(--border-color);
		background: var(--surface);
		color: var(--text-muted);
		transition: all 0.15s ease;
		user-select: none;
	}

	.chip:hover {
		border-color: var(--chip-color);
	}

	.chip.enabled {
		background: color-mix(in srgb, var(--chip-color) 12%, var(--surface));
		border-color: var(--chip-color);
		color: var(--text);
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--border-color);
		transition: background 0.15s ease;
	}

	.chip.enabled .chip-dot {
		background: var(--chip-color);
	}

	.chip-unit {
		opacity: 0.6;
		font-size: 0.75rem;
	}
</style>

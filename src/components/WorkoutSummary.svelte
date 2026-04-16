<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { formatDate, formatElapsed, formatDistance, formatSpeed } from '$lib/stats';
</script>

{#if store.data}
	<div class="summary-bar">
		<div class="summary-item">
			<span class="summary-label">Date</span>
			<span class="summary-value">{formatDate(store.data.summary.startTime)}</span>
		</div>
		<div class="summary-divider"></div>
		<div class="summary-item">
			<span class="summary-label">Sport</span>
			<span class="summary-value">{store.data.summary.sport}{store.data.summary.subSport ? ` / ${store.data.summary.subSport}` : ''}</span>
		</div>
		<div class="summary-divider"></div>
		<div class="summary-item">
			<span class="summary-label">Duration</span>
			<span class="summary-value">{formatElapsed(store.data.summary.totalDuration)}</span>
		</div>
		<div class="summary-divider"></div>
		{#if store.data.laps.length > 0}
			<div class="summary-divider"></div>
			<div class="summary-item">
				<span class="summary-label">Laps</span>
				<span class="summary-value">{store.data.laps.length}</span>
			</div>
		{/if}
		{#if store.data.summary.totalDistance > 0}
			<div class="summary-item">
				<span class="summary-label">Distance</span>
				<span class="summary-value">{formatDistance(store.data.summary.totalDistance)}</span>
			</div>
			<div class="summary-divider"></div>
		{/if}
		{#if store.data.summary.totalAscent > 0}
			<div class="summary-item">
				<span class="summary-label">Elevation Gain</span>
				<span class="summary-value">{store.data.summary.totalAscent.toFixed(0)} m</span>
			</div>
		{/if}
	</div>
{/if}

<style>
	.summary-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem 0;
		padding: 0.75rem 1rem;
		background: var(--surface);
		border-radius: 10px;
		border: 1px solid var(--border-color);
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0 0.75rem;
	}

	.summary-label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.summary-value {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.summary-divider {
		width: 1px;
		height: 28px;
		background: var(--border-color);
	}
</style>

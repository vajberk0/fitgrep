<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { formatElapsed, formatPaceDecimal } from '$lib/stats';
	import type { FieldStats, FieldInfo } from '$lib/types';

	function fmt(val: number, field?: FieldInfo): string {
		if (field?.unit === 'min/km') return formatPaceDecimal(val);
		if (Math.abs(val) >= 1000) return val.toFixed(0);
		if (Math.abs(val) >= 100) return val.toFixed(0);
		if (Math.abs(val) >= 10) return val.toFixed(1);
		return val.toFixed(2);
	}
</script>

{#if store.data && store.enabledFieldInfos.length > 0}
	<div class="stats-panel">
		<div class="stats-header">
			<div class="stats-title">Statistics</div>
			<div class="stats-range">
				{#if store.selectionRange}
					{formatElapsed(store.selectionRange.startElapsed)} – {formatElapsed(store.selectionRange.endElapsed)}
					<span class="stats-duration">({formatElapsed(store.selectionDuration)})</span>
				{:else}
					Full workout
				{/if}
			</div>
		</div>

		<div class="stats-table-wrapper">
			<table class="stats-table">
				<thead>
					<tr>
						<th class="col-field">Metric</th>
						<th class="col-min">MIN</th>
						<th class="col-avg">AVG</th>
						<th class="col-max">MAX</th>
					</tr>
				</thead>
				<tbody>
					{#each store.enabledFieldInfos as field (field.key)}
						{@const stats = store.selectionStats[field.key]}
						<tr>
							<td class="col-field">
								<span class="field-dot" style="background: {field.color}"></span>
								{field.label}
								{#if field.unit}
									<span class="field-unit">({field.unit})</span>
								{/if}
							</td>
							{#if stats}
								<td class="col-min">{fmt(stats.min, field)}</td>
								<td class="col-avg">{fmt(stats.avg, field)}</td>
								<td class="col-max">{fmt(stats.max, field)}</td>
							{:else}
								<td class="col-min">—</td>
								<td class="col-avg">—</td>
								<td class="col-max">—</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/if}

<style>
	.stats-panel {
		background: var(--surface);
		border-radius: 12px;
		border: 1px solid var(--border-color);
		overflow: hidden;
	}

	.stats-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.stats-title {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--text);
	}

	.stats-range {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.stats-duration {
		margin-left: 0.25rem;
		color: var(--accent);
		font-weight: 600;
	}

	.stats-table-wrapper {
		overflow-x: auto;
	}

	.stats-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.stats-table th {
		padding: 0.5rem 1rem;
		text-align: left;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		border-bottom: 1px solid var(--border-color);
		background: var(--bg);
	}

	.stats-table td {
		padding: 0.55rem 1rem;
		border-bottom: 1px solid var(--border-color);
	}

	.stats-table tr:last-child td {
		border-bottom: none;
	}

	.stats-table tr:hover td {
		background: var(--surface-hover);
	}

	.col-field {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 500;
		white-space: nowrap;
	}

	.field-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.field-unit {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-weight: 400;
	}

	.col-min, .col-avg, .col-max {
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		text-align: right;
	}

	.col-avg {
		font-weight: 700;
		color: var(--text);
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { formatElapsed, formatPaceDecimal } from '$lib/stats';
	import type { EChartsType } from 'echarts';

	let chartEl: HTMLDivElement;
	let chart: EChartsType | null = $state(null);
	let resizeObserver: ResizeObserver | null = null;
	let chartReady = $state(false);
	let programmaticZoom = false;

	onMount(async () => {
		const echarts = await import('echarts');
		chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
		chartReady = true;
		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(chartEl);

		chart.on('datazoom', () => {
			if (programmaticZoom) return;
			if (!store.data || !chart) return;
			// User manually zoomed — deselect any selected lap pill
			if (store.selectedLap !== null) {
				store.clearLapSelection();
			}
			const option = chart.getOption() as any;
			const dz = option.dataZoom as any[];
			if (!dz || dz.length === 0) return;

			const sliderDz = dz.find((d: any) => d.type === 'slider') ?? dz[0];
			const start = sliderDz.start ?? 0;
			const end = sliderDz.end ?? 100;

			const records = store.data.records;
			const totalRecords = records.length;
			const startIdx = Math.floor((start / 100) * totalRecords);
			const endIdx = Math.ceil((end / 100) * totalRecords);

			store.setSelectionRange({
				startIndex: startIdx,
				endIndex: endIdx,
				startElapsed: records[startIdx]?.elapsed ?? 0,
				endElapsed: records[Math.min(endIdx - 1, totalRecords - 1)]?.elapsed ?? 0,
			});
		});

		return () => {
			resizeObserver?.disconnect();
			chart?.dispose();
		};
	});

	// Reactive chart update
	$effect(() => {
		if (!chart || !store.data || !chartReady) return;

		const enabledInfos = store.enabledFieldInfos;
		const records = store.data.records;
		const laps = store.data.laps;

		// Preserve current zoom across chart rebuilds
		const currentSelection = store.selectionRange;
		const totalRecords = records.length;
		let savedStartPercent = 0;
		let savedEndPercent = 100;
		if (currentSelection && totalRecords > 0) {
			savedStartPercent = (currentSelection.startIndex / totalRecords) * 100;
			savedEndPercent = (currentSelection.endIndex / totalRecords) * 100;
		}

		if (records.length === 0 || enabledInfos.length === 0) {
			chart.setOption({
				title: {
					text: enabledInfos.length === 0 ? 'Select metrics above to view chart' : 'No data points',
					left: 'center',
					top: 'center',
					textStyle: { color: '#999', fontSize: 14, fontWeight: 'normal' },
				},
				xAxis: { show: false },
				yAxis: { show: false },
				series: [],
			}, true);
			return;
		}

		// Build Y-axes: each enabled field gets its own axis (all hidden, so no visual clutter)
		const axisMap = new Map<string, number>();
		const yAxes: any[] = [];

		enabledInfos.forEach((field, i) => {
			axisMap.set(field.key, i);
			yAxes.push(buildYAxis(field, i));
		});

		const series = enabledInfos.map((field) => ({
			name: field.label,
			type: 'line' as const,
			data: records.map((r) => {
				const val = r[field.key];
				return val != null ? [r.elapsed, val] : [r.elapsed, null];
			}),
			yAxisIndex: axisMap.get(field.key) ?? 0,
			symbol: 'none',
			sampling: 'lttb' as const,
			lineStyle: { width: 2, color: field.color },
			itemStyle: { color: field.color },
			emphasis: {
				lineStyle: { width: 3 },
			},
			connectNulls: false,
		}));

		// Build markLines: use lap boundaries if available, otherwise fall back to 5-min intervals
		const markLineData: any[] = [];
		if (laps.length > 0) {
			// Draw vertical lines at each lap boundary (start of lap 2, 3, ... N)
			for (let i = 1; i < laps.length; i++) {
				markLineData.push({
					xAxis: laps[i].startElapsed,
					label: {
						formatter: `L${laps[i].number}`,
						position: 'insideStartTop',
						fontSize: 10,
						color: '#666',
					},
					lineStyle: {
						color: '#999',
						width: 1,
						type: 'dashed' as const,
					},
				});
			}
		} else {
			// Fallback: 5-minute interval lines
			const maxElapsed = records[records.length - 1].elapsed;
			for (let t = 300; t < maxElapsed; t += 300) {
				markLineData.push({
					xAxis: t,
					label: {
						formatter: formatElapsed(t),
						position: 'insideStartTop' as const,
						fontSize: 10,
						color: '#999',
					},
					lineStyle: {
						color: '#e0e0e0',
						width: 1,
						type: 'dotted' as const,
					},
				});
			}
		}

		const option: any = {
			animation: false,
			grid: {
				left: 20,
				right: 20,
				top: 30,
				bottom: 80,
				containLabel: false,
			},
			tooltip: {
				trigger: 'axis',
				axisPointer: { type: 'cross', snap: true },
				formatter: (params: any[]) => {
					if (!params || params.length === 0) return '';
					const elapsed = params[0].axisValue;
					let html = `<div style="font-weight:600;margin-bottom:4px">${formatElapsed(elapsed)}</div>`;
					for (const p of params) {
						const yVal = Array.isArray(p.value) ? p.value[1] : p.value;
						if (yVal != null) {
							const field = enabledInfos.find((f) => f.label === p.seriesName);
							const isPace = field?.unit === 'min/km';
							const displayVal = isPace ? formatPaceDecimal(yVal) : yVal.toFixed(1);
							const unit = field?.unit ? ` ${field.unit}` : '';
							html += `<div style="display:flex;align-items:center;gap:6px">
								<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color}"></span>
								${p.seriesName}: <strong>${displayVal}${unit}</strong>
							</div>`;
						}
					}
					return html;
				},
			},
			xAxis: {
				type: 'value',
				name: 'Time',
				nameLocation: 'center',
				nameGap: 30,
				min: 'dataMin',
				max: 'dataMax',
				axisLabel: {
					formatter: (val: number) => formatElapsed(val),
					fontSize: 11,
				},
				axisLine: { lineStyle: { color: '#ccc' } },
			},
			yAxis: yAxes,
			series: series.length > 0 ? [{
				...series[0],
				markLine: markLineData.length > 0 ? {
					silent: true,
					symbol: 'none',
					data: markLineData,
				} : undefined,
			}, ...series.slice(1)] : series,
			dataZoom: [
				{
					type: 'slider',
					xAxisIndex: 0,
					start: savedStartPercent,
					end: savedEndPercent,
					height: 30,
					bottom: 10,
					borderColor: '#ddd',
					fillerColor: 'rgba(52, 152, 219, 0.15)',
					handleStyle: { color: '#3498db', borderColor: '#3498db' },
					dataBackground: {
						lineStyle: { color: '#ccc' },
						areaStyle: { color: '#eee' },
					},
					selectedDataBackground: {
						lineStyle: { color: '#3498db' },
						areaStyle: { color: 'rgba(52, 152, 219, 0.1)' },
					},
					labelFormatter: (val: number) => formatElapsed(val),
				},
				{
					type: 'inside',
					xAxisIndex: 0,
				},
			],
		};

		programmaticZoom = true;
		chart.setOption(option, true);
		programmaticZoom = false;

		programmaticZoom = true;
		if (currentSelection) {
			store.setSelectionRange(currentSelection);
		} else {
			store.setSelectionRange({
				startIndex: 0,
				endIndex: totalRecords,
				startElapsed: records[0]?.elapsed ?? 0,
				endElapsed: records[totalRecords - 1]?.elapsed ?? 0,
			});
		}
		programmaticZoom = false;
	});

	function handleLapClick(lapNumber: number | null) {
		if (lapNumber === store.selectedLap) {
			// Deselect if clicking the same lap
			store.selectLap(null);
		} else {
			store.selectLap(lapNumber);
		}
	}

	function formatDuration(seconds: number): string {
		if (seconds < 60) return `${Math.round(seconds)}s`;
		const m = Math.floor(seconds / 60);
		const s = Math.round(seconds % 60);
		if (m < 60) return `${m}:${String(s).padStart(2, '0')}`;
		const h = Math.floor(m / 60);
		const rm = m % 60;
		return `${h}:${String(rm).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	function formatDistance(meters: number | null): string {
		if (meters == null) return '';
		if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
		return `${Math.round(meters)} m`;
	}

	function buildYAxis(field: any, index: number) {
		const isRight = index % 2 === 1;
		return {
			type: 'value' as const,
			show: false,
			splitLine: { show: index === 0, lineStyle: { color: '#f0f0f0' } },
			position: (isRight ? 'right' : 'left') as 'left' | 'right',
			inverse: !!field.inverted,
		};
	}
</script>

<div class="chart-container">
	{#if !chartReady}
		<div class="chart-loading">Loading chart…</div>
	{/if}
	<div bind:this={chartEl} class="chart-el"></div>

	{#if store.data && store.laps.length > 0}
		<div class="lap-pills">
			<button
				class="lap-pill {!store.selectedLap ? 'active' : ''}"
				onclick={() => store.selectLap(null)}
				title="Show full workout"
			>
				All
			</button>
			{#each store.laps as lap (lap.number)}
				<button
					class="lap-pill {store.selectedLap === lap.number ? 'active' : ''}"
					onclick={() => handleLapClick(lap.number)}
					title="Lap {lap.number}: {formatDuration(lap.duration)}{lap.distance ? ', ' + formatDistance(lap.distance) : ''}"
				>
					<span class="lap-number">L{lap.number}</span>
					<span class="lap-meta">{formatDuration(lap.duration)}{lap.distance != null ? ` · ${formatDistance(lap.distance)}` : ''}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>

<style>
	.chart-container {
		width: 100%;
		background: var(--surface);
		border-radius: 12px;
		border: 1px solid var(--border-color);
		overflow: hidden;
		position: relative;
	}

	.chart-loading {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: var(--text-muted);
		font-size: 0.9rem;
		z-index: 1;
	}

	.chart-el {
		width: 100%;
		height: 420px;
	}

	.lap-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px 12px 12px;
		border-top: 1px solid var(--border-color);
	}

	.lap-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 10px;
		border: 1px solid var(--border-color);
		border-radius: 16px;
		background: var(--bg);
		color: var(--text);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		font-family: inherit;
		line-height: 1.3;
	}

	.lap-pill:hover {
		background: var(--accent-light);
		border-color: var(--accent);
	}

	.lap-pill.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}

	.lap-number {
		font-weight: 700;
	}

	.lap-meta {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.lap-pill.active .lap-meta {
		color: rgba(255, 255, 255, 0.85);
	}

	@media (max-width: 768px) {
		.chart-el {
			height: 300px;
		}

		.lap-pills {
			gap: 4px;
			padding: 6px 8px 8px;
		}

		.lap-pill {
			padding: 3px 8px;
			font-size: 0.7rem;
		}
	}
</style>
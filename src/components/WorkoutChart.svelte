<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { formatElapsed, formatPaceDecimal } from '$lib/stats';
	import type { EChartsType } from 'echarts';

	let chartEl: HTMLDivElement;
	let chart: EChartsType | null = $state(null);
	let resizeObserver: ResizeObserver | null = null;
	let chartReady = $state(false);
	let hasDistance = $state(false);

	// Guard flag: suppress datazoom events during programmatic zoom changes
	let suppressingZoomEvents = false;

	onMount(async () => {
		const echarts = await import('echarts');
		chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
		chartReady = true;
		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(chartEl);

		chart.on('datazoom', () => {
			if (suppressingZoomEvents) return;
			if (!store.data || !chart) return;

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

			// User manually zoomed — deselect any selected lap pill
			if (store.selectedLap !== null) {
				store.clearLapSelection();
			}

			store.setSelectionRange({
				startIndex: startIdx,
				endIndex: endIdx,
				startElapsed: records[startIdx]?.elapsed ?? 0,
				endElapsed: records[Math.min(endIdx - 1, totalRecords - 1)]?.elapsed ?? 0,
				startDistance: hasDistance ? records[startIdx]?.distance : undefined,
				endDistance: hasDistance ? records[Math.min(endIdx - 1, totalRecords - 1)]?.distance : undefined,
			});
		});

		return () => {
			resizeObserver?.disconnect();
			chart?.dispose();
		};
	});

	/** Zoom chart to a specific range using dispatchAction (lightweight, no rebuild) */
	function zoomChartToRange(startPercent: number, endPercent: number) {
		if (!chart) return;
		suppressingZoomEvents = true;
		chart.dispatchAction({
			type: 'dataZoom',
			start: startPercent,
			end: endPercent,
		});
		// Use setTimeout to ensure any async datazoom events are also suppressed
		setTimeout(() => { suppressingZoomEvents = false; }, 50);
	}

	// Full chart rebuild — only when data/fields/laps change, not zoom
	$effect(() => {
		if (!chart || !store.data || !chartReady) return;

		// Depend on data + fields + chart axis
		const enabledInfos = store.enabledFieldInfos;
		const records = store.data.records;
		const axis = store.chartAxis;
		const laps = store.data.laps;

		if (records.length === 0 || enabledInfos.length === 0) {
			suppressingZoomEvents = true;
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
			suppressingZoomEvents = false;
			return;
		}

		// Check if distance field is available in records
		hasDistance = records.length > 0 && records[0].distance != null;

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
				const xVal = axis === 'distance' && r.distance != null ? r.distance : r.elapsed;
				return val != null ? [xVal, val] : [xVal, null];
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
			for (let i = 1; i < laps.length; i++) {
				const lapXVal = axis === 'distance' && laps[i].distance != null ? laps[i].distance : laps[i].startElapsed;
				markLineData.push({
					xAxis: lapXVal,
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
			const maxVal = axis === 'distance' && hasDistance
				? records[records.length - 1].distance!
				: records[records.length - 1].elapsed;
			const interval = axis === 'distance' && hasDistance ? 500 : 300;
			for (let t = interval; t < maxVal; t += interval) {
				markLineData.push({
					xAxis: t,
					label: {
						formatter: axis === 'distance' && hasDistance ? formatDistance(t) : formatElapsed(t),
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

		// Read current zoom to preserve across rebuilds (untracked so zoom changes
		// don't trigger a full chart rebuild — zoom is handled via dispatchAction)
		const currentRange = untrack(() => store.selectionRange);
		const totalRecords = records.length;
		let startPct = 0;
		let endPct = 100;
		if (currentRange && totalRecords > 0) {
			startPct = (currentRange.startIndex / totalRecords) * 100;
			endPct = (currentRange.endIndex / totalRecords) * 100;
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
					const axisVal = params[0].axisValue;
					let html = `<div style="font-weight:600;margin-bottom:4px">${axis === 'distance' && hasDistance ? formatDistance(axisVal) : formatElapsed(axisVal)}</div>`;
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
				name: axis === 'distance' && hasDistance ? 'Distance' : 'Time',
				nameLocation: 'center',
				nameGap: 30,
				min: 'dataMin',
				max: 'dataMax',
				axisLabel: {
					formatter: (val: number) => (axis === 'distance' && hasDistance ? formatDistance(val) : formatElapsed(val)),
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
					start: startPct,
					end: endPct,
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
					labelFormatter: (val: number) => (axis === 'distance' && hasDistance ? formatDistance(val) : formatElapsed(val)),
				},
				{
					type: 'inside',
					xAxisIndex: 0,
					start: startPct,
					end: endPct,
				},
			],
		};

		suppressingZoomEvents = true;
		chart.setOption(option, true);

		// Set initial selection to match current zoom
		if (!currentRange) {
			store.setSelectionRange({
				startIndex: 0,
				endIndex: totalRecords,
				startElapsed: records[0]?.elapsed ?? 0,
				endElapsed: records[totalRecords - 1]?.elapsed ?? 0,
				startDistance: hasDistance ? records[0].distance ?? 0 : undefined,
				endDistance: hasDistance ? records[totalRecords - 1].distance : undefined,
			});
		}

		// Keep suppressing events briefly to catch async datazoom events from setOption
		setTimeout(() => { suppressingZoomEvents = false; }, 100);
	});

	function handleLapClick(lapNumber: number | null) {
		if (lapNumber === store.selectedLap) {
			store.selectLap(null);
		} else {
			store.selectLap(lapNumber);
		}
		// Zoom chart to match the new selection range
		const sel = store.selectionRange;
		if (sel && store.data) {
			const totalRecords = store.data.records.length;
			if (totalRecords > 0) {
				const startPct = (sel.startIndex / totalRecords) * 100;
				const endPct = (sel.endIndex / totalRecords) * 100;
				zoomChartToRange(startPct, endPct);
			}
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

	{#if store.data && hasDistance}
		<div class="axis-toggle">
			<button
				class="axis-btn {store.chartAxis === 'time' ? 'active' : ''}"
			onclick={() => store.setChartAxis('time')}
			>Time</button>
			<button
				class="axis-btn {store.chartAxis === 'distance' ? 'active' : ''}"
			onclick={() => store.setChartAxis('distance')}
			>Distance</button>
		</div>
	{/if}

	<div bind:this={chartEl} class="chart-el"></div>

	{#if store.data && store.laps.length > 0}
		<div class="lap-pills">
			<button
				class="lap-pill {!store.selectedLap ? 'active' : ''}"
				onclick={() => handleLapClick(null)}
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

	.axis-toggle {
		display: flex;
		gap: 4px;
		padding: 8px 12px 0;
	}

	.axis-btn {
		padding: 4px 12px;
		border: 1px solid var(--border-color);
		border-radius: 6px;
		background: var(--bg);
		color: var(--text-muted);
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		font-family: inherit;
	}

	.axis-btn:hover {
		background: var(--accent-light);
		color: var(--text);
	}

	.axis-btn.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
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
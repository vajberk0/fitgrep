<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { formatElapsed, formatPaceDecimal } from '$lib/stats';
	import type { EChartsType } from 'echarts';

	let chartEl: HTMLDivElement;
	let chart: EChartsType | null = $state(null);
	let resizeObserver: ResizeObserver | null = null;
	let chartReady = $state(false);

	onMount(async () => {
		const echarts = await import('echarts');
		chart = echarts.init(chartEl, undefined, { renderer: 'canvas' });
		chartReady = true;
		resizeObserver = new ResizeObserver(() => chart?.resize());
		resizeObserver.observe(chartEl);

		chart.on('datazoom', () => {
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
			series,
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

		chart.setOption(option, true);

		// Restore selection range from before rebuild
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
	});

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

	@media (max-width: 768px) {
		.chart-el {
			height: 300px;
		}
	}
</style>

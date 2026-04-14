<!-- fitgrep: explore your Garmin FIT workout data -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { loadLastFile } from '$lib/preferences';
	import { loadFileBuffer } from '$lib/storage';
	import UploadZone from './components/UploadZone.svelte';
	import ErrorBar from './components/ErrorBar.svelte';
	import WorkoutSummary from './components/WorkoutSummary.svelte';
	import FieldSelector from './components/FieldSelector.svelte';
	import WorkoutChart from './components/WorkoutChart.svelte';
	import StatsPanel from './components/StatsPanel.svelte';
	import GpsMap from './components/GpsMap.svelte';
	import StoredFiles from './components/StoredFiles.svelte';

	function handleNewFile() {
		store.setWorkoutData(null);
	}

	// Auto-load last viewed file on mount
	onMount(async () => {
		const lastFile = loadLastFile();
		if (!lastFile) return;

		const buffer = loadFileBuffer(lastFile);
		if (!buffer) return; // file was deleted from storage

		store.setLoading(true);
		try {
			const { parseFitFile } = await import('$lib/parser');
			const data = await parseFitFile(buffer);
			store.setWorkoutData(data, lastFile);
		} catch (err) {
			console.warn('Auto-load failed:', err);
			// Non-critical — just show the upload screen
		} finally {
			store.setLoading(false);
		}
	});
</script>

<main class="app">
	<header class="app-header">
		<div class="header-left">
			<h1 class="app-title">fitgrep</h1>
			<span class="app-tagline">Workout Analyzer</span>
		</div>
		{#if store.data}
			<button class="btn-new" onclick={handleNewFile}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				New File
			</button>
		{/if}
	</header>

	<ErrorBar />

	{#if !store.data}
		<section class="upload-section">
			<div class="upload-layout">
				<StoredFiles />
				<div class="upload-divider">
					{#if store.storedFiles.length > 0}
						<div class="divider-line"></div>
						<span class="divider-text">or</span>
						<div class="divider-line"></div>
					{/if}
				</div>
				<UploadZone />
			</div>
		</section>
	{:else}
		<section class="workout-section">
			<WorkoutSummary />
			<FieldSelector />
			<WorkoutChart />
			<StatsPanel />
			<GpsMap />
		</section>
	{/if}
</main>

<style>
	.app {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.5rem;
		min-height: 100vh;
	}

	.app-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
	}

	.header-left {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
	}

	.app-title {
		font-size: 1.6rem;
		font-weight: 800;
		margin: 0;
		color: var(--accent);
		letter-spacing: -0.02em;
	}

	.app-tagline {
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 500;
	}

	.btn-new {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.85rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-new:hover {
		background: var(--surface-hover);
		border-color: var(--accent);
	}

	.upload-section {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 60vh;
	}

	.upload-layout {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.25rem;
		width: 100%;
		max-width: 520px;
	}

	.upload-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
	}

	.divider-line {
		flex: 1;
		height: 1px;
		background: var(--border-color);
	}

	.divider-text {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.workout-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
</style>

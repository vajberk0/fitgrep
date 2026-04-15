<!-- fitgrep: explore your Garmin FIT workout data -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { store } from '$lib/store.svelte';
	import { loadLastFile } from '$lib/preferences';
	import { loadFileBuffer, saveFile } from '$lib/storage';
	import { getShareIdFromUrl, loadSharedWorkout, cleanShareUrl, getSelectionFromUrl } from '$lib/share';
	import UploadZone from './components/UploadZone.svelte';
	import ErrorBar from './components/ErrorBar.svelte';
	import WorkoutSummary from './components/WorkoutSummary.svelte';
	import FieldSelector from './components/FieldSelector.svelte';
	import WorkoutChart from './components/WorkoutChart.svelte';
	import StatsPanel from './components/StatsPanel.svelte';
	import GpsMap from './components/GpsMap.svelte';
	import StoredFiles from './components/StoredFiles.svelte';
	import ShareModal from './components/ShareModal.svelte';

	function handleNewFile() {
		store.setWorkoutData(null);
	}

	/** Find the record index closest to a given elapsed time. */
	function findClosestIndex(records: { elapsed: number }[], target: number, upperBound = false): number {
		if (records.length === 0) return 0;
		let lo = 0, hi = records.length - 1;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (records[mid].elapsed < target) lo = mid + 1;
			else hi = mid;
		}
		// For end index, we want the first index past the target (exclusive end)
		if (upperBound && lo < records.length - 1 && records[lo].elapsed < target) lo++;
		return lo;
	}

	// Auto-load shared workout or last viewed file on mount
	onMount(async () => {
		// Check for share link first (?s=ID)
		const shareId = getShareIdFromUrl();
		if (shareId) {
			store.setLoading(true);
			try {
				const shared = await loadSharedWorkout(shareId);
				if (shared) {
					const { parseFitFile } = await import('$lib/parser');
					const data = await parseFitFile(shared.buffer);

					// Save to localStorage so user can revisit without the share link
					saveFile(shared.filename, shared.buffer, data.summary);
					store.refreshStoredFiles();

					store.setWorkoutData(data, shared.filename);

					// Apply the sharer's enabled fields to preserve their view
					if (shared.fields.length > 0) {
						store.setEnabledFields(shared.fields);
					}

					// Apply shared selection range (zoom) if present in URL
					const sharedSel = getSelectionFromUrl();
					if (sharedSel) {
						const records = data.records;
						const startIdx = findClosestIndex(records, sharedSel.startElapsed);
						const endIdx = findClosestIndex(records, sharedSel.endElapsed, true);
						store.setSelectionRange({
							startIndex: startIdx,
							endIndex: endIdx,
							startElapsed: records[startIdx]?.elapsed ?? sharedSel.startElapsed,
							endElapsed: records[Math.min(endIdx - 1, records.length - 1)]?.elapsed ?? sharedSel.endElapsed,
						});
					}

					// Clean share params from URL so refresh doesn't re-fetch
					cleanShareUrl();
				} else {
					store.setError('This share link is invalid or has expired.');
					cleanShareUrl();
				}
			} catch (err) {
				console.error('Share load failed:', err);
				store.setError('Could not load shared workout.');
				cleanShareUrl();
			} finally {
				store.setLoading(false);
			}
			return;
		}

		// Fall back to auto-loading last viewed file
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
			<a class="github-link" href="https://github.com/vajberk0/fitgrep" target="_blank" rel="noopener noreferrer" aria-label="View source on GitHub">
				<svg viewBox="0 0 16 16" fill="currentColor" width="18" height="18"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
			</a>
		</div>
		{#if store.data}
			<div class="header-actions">
				<ShareModal />
				<button class="btn-new" onclick={handleNewFile}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				New File
				</button>
			</div>
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

	.github-link {
		display: inline-flex;
		align-items: center;
		color: var(--text-muted);
		margin-left: 0.25rem;
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}

	.github-link:hover {
		opacity: 1;
		color: var(--text);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

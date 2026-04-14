<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { deleteFile, loadFileBuffer, formatDuration, formatDistance } from '$lib/storage';

	async function selectFile(meta: { filename: string }) {
		store.setLoading(true);
		store.setError(null);
		try {
			const buffer = loadFileBuffer(meta.filename);
			if (!buffer) {
				store.setError('File data not found in storage. Please re-upload.');
				store.refreshStoredFiles();
				return;
			}
			const { parseFitFile } = await import('$lib/parser');
			const data = await parseFitFile(buffer);
			store.setWorkoutData(data, meta.filename);
		} catch (err: any) {
			console.error('Error loading stored file:', err);
			store.setError('Could not load stored file. It may be corrupted.');
		} finally {
			store.setLoading(false);
		}
	}

	function handleDelete(e: MouseEvent, filename: string) {
		e.stopPropagation();
		deleteFile(filename);
		store.refreshStoredFiles();
	}

	function formatDate(iso: string): string {
		try {
			return new Date(iso).toLocaleDateString(undefined, {
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			});
		} catch {
			return iso;
		}
	}
</script>

{#if store.storedFiles.length > 0}
	<div class="stored-files">
		<h3 class="stored-title">Previous Workouts</h3>
		<div class="file-list">
			{#each store.storedFiles as meta (meta.filename)}
				<div
					class="file-card"
					role="button"
					tabindex="0"
					onclick={() => selectFile(meta)}
					onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') selectFile(meta); }}
					class:disabled={store.isLoading}
				>
					<div class="file-info">
						<span class="file-name">{meta.filename}</span>
						<div class="file-meta">
							<span class="meta-tag sport-tag">{meta.sport}</span>
							<span class="meta-sep">·</span>
							<span>{formatDate(meta.startTime)}</span>
							<span class="meta-sep">·</span>
							<span>{formatDistance(meta.totalDistance)}</span>
							<span class="meta-sep">·</span>
							<span>{formatDuration(meta.totalDuration)}</span>
						</div>
					</div>
					<button
						class="delete-btn"
						onclick={(e) => handleDelete(e, meta.filename)}
						title="Remove from browser storage"
						aria-label="Delete {meta.filename}"
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.stored-files {
		width: 100%;
		max-width: 520px;
	}

	.stored-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		margin-bottom: 0.6rem;
	}

	.file-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		max-height: 280px;
		overflow-y: auto;
	}

	.file-card {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.65rem 0.85rem;
		border: 1px solid var(--border-color);
		border-radius: 10px;
		background: var(--surface);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
		font-family: inherit;
		font-size: inherit;
		color: inherit;
	}

	.file-card:hover:not(.disabled) {
		border-color: var(--accent);
		background: var(--surface-hover);
	}

	.file-card.disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
	}

	.file-name {
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.meta-sep {
		color: var(--border-color);
	}

	.meta-tag {
		font-size: 0.72rem;
		font-weight: 500;
		padding: 0.1rem 0.4rem;
		border-radius: 4px;
		background: var(--accent-light);
		color: var(--accent);
	}

	.sport-tag {
		background: var(--accent-light);
	}

	.delete-btn {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.delete-btn:hover {
		background: #fde8e8;
		color: #e74c3c;
	}
</style>

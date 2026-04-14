<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { saveFile } from '$lib/storage';

	let dragging = $state(false);
	let inputEl: HTMLInputElement;

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragging = false;
		const file = e.dataTransfer?.files?.[0];
		if (file) processFile(file);
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		dragging = false;
	}

	function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) processFile(file);
	}

	async function processFile(file: File) {
		if (!file.name.toLowerCase().endsWith('.fit')) {
			store.setError("This doesn't look like a valid FIT file. Please upload a .fit file.");
			return;
		}

		store.setLoading(true);
		store.setError(null);

		try {
			const buffer = await file.arrayBuffer();
			const { parseFitFile } = await import('$lib/parser');
			const data = await parseFitFile(buffer);

			// Save to localStorage (overwrites if same filename)
			saveFile(file.name, buffer, data.summary);
			store.refreshStoredFiles();

			store.setWorkoutData(data, file.name);
		} catch (err: any) {
			console.error('FIT parse error:', err);
			const msg = err?.message ?? 'Could not read this workout file';
			if (msg.includes('No record')) {
				store.setError('No record data found in this file');
			} else {
				store.setError('Could not read this workout file. Make sure it\'s a valid .FIT file.');
			}
			store.setWorkoutData(null);
		} finally {
			store.setLoading(false);
		}
	}
</script>

<div
	class="upload-zone"
	class:dragging
	class:loading={store.isLoading}
	ondrop={handleDrop}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	role="button"
	tabindex="0"
	onclick={() => inputEl?.click()}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputEl?.click(); }}
>
	<input
		bind:this={inputEl}
		type="file"
		accept=".fit"
		onchange={handleFileInput}
		style="display: none"
	/>

	{#if store.isLoading}
		<div class="upload-content">
			<div class="spinner"></div>
			<p class="upload-text">Analyzing workout data…</p>
		</div>
	{:else}
		<div class="upload-content">
			<svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
			<p class="upload-text">Drop your .FIT file here or click to browse</p>
			<p class="upload-subtext">Garmin FIT workout files</p>
		</div>
	{/if}
</div>

<style>
	.upload-zone {
		border: 2px dashed var(--border-color);
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		background: var(--surface);
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.upload-zone:hover,
	.upload-zone.dragging {
		border-color: var(--accent);
		background: var(--surface-hover);
	}

	.upload-zone.dragging {
		transform: scale(1.01);
	}

	.upload-zone.loading {
		pointer-events: none;
		opacity: 0.8;
	}

	.upload-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}

	.upload-icon {
		width: 48px;
		height: 48px;
		color: var(--text-muted);
	}

	.upload-text {
		font-size: 1.1rem;
		color: var(--text);
		margin: 0;
	}

	.upload-subtext {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--border-color);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>

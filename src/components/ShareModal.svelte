<script lang="ts">
	import { store } from '$lib/store.svelte';
	import { shareWorkout } from '$lib/share';
	import { loadFileBuffer } from '$lib/storage';

	let open = $state(false);
	let shareLink = $state('');
	let isSharing = $state(false);
	let shareError = $state('');
	let copied = $state(false);

	function openModal() {
		shareLink = '';
		shareError = '';
		copied = false;
		open = true;
	}

	function closeModal() {
		open = false;
	}

	async function handleShare() {
		if (!store.data || !store.currentFilename) return;

		isSharing = true;
		shareError = '';
		copied = false;

		try {
			// Load raw FIT file from localStorage
			const buffer = loadFileBuffer(store.currentFilename);
			if (!buffer) {
				throw new Error('File data not found in local storage. Please re-upload the file.');
			}

			const result = await shareWorkout(
				buffer,
				store.currentFilename,
				store.enabledFields,
				store.selectionRange,
			);

			shareLink = result.url;
		} catch (err: any) {
			console.error('Share failed:', err);
			shareError = err?.message || 'Could not create share link';
		} finally {
			isSharing = false;
		}
	}

	async function copyLink() {
		if (!shareLink) return;
		try {
			await navigator.clipboard.writeText(shareLink);
			copied = true;
			setTimeout(() => { copied = false; }, 2000);
		} catch {
			// Fallback for insecure contexts or older browsers
			const input = document.querySelector('.share-link-input') as HTMLInputElement;
			if (input) {
				input.select();
				document.execCommand('copy');
				copied = true;
				setTimeout(() => { copied = false; }, 2000);
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closeModal();
	}
</script>

{#if store.data}
	<button class="btn-share" onclick={openModal} title="Share this workout">
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
			<circle cx="18" cy="5" r="3" />
			<circle cx="6" cy="12" r="3" />
			<circle cx="18" cy="19" r="3" />
			<line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
			<line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
		</svg>
		Share
	</button>
{/if}

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeModal} onkeydown={handleKeydown}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2>Share Workout</h2>
				<button class="modal-close" onclick={closeModal} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>
			</div>

			{#if !shareLink && !shareError}
				<div class="modal-body">
					<p class="share-description">
						Create a link that lets anyone view this workout with the same charts, fields, and time selection you have.
					</p>
					<p class="share-note">
						The FIT file will be uploaded to a shareable link that expires after 90 days.
					</p>
					<button class="btn-create" onclick={handleShare} disabled={isSharing}>
						{#if isSharing}
							<div class="spinner-sm"></div>
							Creating link…
						{:else}
							Create Share Link
						{/if}
					</button>
				</div>
			{:else if shareError}
				<div class="modal-body">
					<p class="share-error">{shareError}</p>
					<button class="btn-create" onclick={handleShare}>Try Again</button>
				</div>
			{:else}
				<div class="modal-body">
					<p class="share-success">Link created! Anyone with this link can view your workout.</p>
					<div class="share-link-row">
						<input
							class="share-link-input"
							type="text"
							readonly
							value={shareLink}
							onclick={(e) => (e.target as HTMLInputElement).select()}
						/>
						<button class="btn-copy" onclick={copyLink}>
							{#if copied}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16">
									<polyline points="20 6 9 17 4 12" />
								</svg>
								Copied!
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
									<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
								</svg>
								Copy
							{/if}
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.btn-share {
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

	.btn-share:hover {
		background: var(--surface-hover);
		border-color: var(--accent);
		color: var(--accent);
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.15s ease;
	}

	.modal-content {
		background: var(--surface);
		border-radius: 16px;
		width: 90%;
		max-width: 480px;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.2s ease;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--border-color);
	}

	.modal-header h2 {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.modal-close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.modal-body {
		padding: 1.5rem;
	}

	.share-description {
		font-size: 0.9rem;
		color: var(--text);
		margin: 0 0 0.5rem;
	}

	.share-note {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin: 0 0 1.25rem;
	}

	.btn-create {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.7rem 1rem;
		border: none;
		border-radius: 10px;
		background: var(--accent);
		color: white;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.btn-create:hover {
		opacity: 0.9;
	}

	.btn-create:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.share-success {
		font-size: 0.9rem;
		color: var(--text);
		margin: 0 0 1rem;
		font-weight: 500;
	}

	.share-link-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	.share-link-input {
		flex: 1;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		font-size: 0.8rem;
		font-family: monospace;
		background: var(--bg);
		color: var(--text);
		outline: none;
		min-width: 0;
	}

	.share-link-input:focus {
		border-color: var(--accent);
	}

	.btn-copy {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 0.85rem;
		border: 1px solid var(--border-color);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s ease;
	}

	.btn-copy:hover {
		background: var(--surface-hover);
		border-color: var(--accent);
		color: var(--accent);
	}

	.share-error {
		font-size: 0.9rem;
		color: #dc2626;
		margin: 0 0 1rem;
	}

	.spinner-sm {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideUp {
		from { transform: translateY(10px); opacity: 0; }
		to { transform: translateY(0); opacity: 1; }
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
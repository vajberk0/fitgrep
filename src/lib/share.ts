/**
 * Share service for fitgrep.
 *
 * Uploads workout data to the Cloudflare Worker backend and generates
 * shareable links. Also handles loading shared workouts from URLs.
 */

// ── Configuration ──────────────────────────────────────────────────────────

const SHARE_API = import.meta.env.VITE_SHARE_API || 'http://localhost:8787';

// ── Types ─────────────────────────────────────────────────────────────────

export interface SharePayload {
	/** Payload format version */
	v: 1;
	/** Original filename */
	filename: string;
	/** Enabled field keys to preserve chart config */
	fields: string[];
	/** Base64-encoded raw FIT file */
	file: string;
}

export interface ShareResult {
	/** The full shareable URL */
	url: string;
	/** The short share ID */
	id: string;
}

// ── Upload cache ──────────────────────────────────────────────────────────

// Cache file fingerprint → share ID so we don't re-upload the same file
const shareCache = new Map<string, { id: string }>();

/** Cheap fingerprint: length + sampled bytes → fast hash. */
function fileFingerprint(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const len = bytes.length;
	let h = len;
	// Sample first 4KB
	const headEnd = Math.min(4096, len);
	for (let i = 0; i < headEnd; i++) h = ((h << 5) - h + bytes[i]) | 0;
	// Sample last 4KB
	const tailStart = Math.max(0, len - 4096);
	for (let i = tailStart; i < len; i++) h = ((h << 5) - h + bytes[i]) | 0;
	return `${len}-${h >>> 0}`;
}

// ── Encoding helpers ──────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	const chunkSize = 8192;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Upload workout data and generate a share link.
 *
 * @param buffer  Raw FIT file ArrayBuffer
 * @param filename  Original filename
 * @param fields  Currently enabled field keys
 * @returns  Share result with URL and ID
 */
export async function shareWorkout(
	buffer: ArrayBuffer,
	filename: string,
	fields: string[],
	selection?: { startElapsed: number; endElapsed: number } | null,
): Promise<ShareResult> {
	const fp = fileFingerprint(buffer);
	let id = shareCache.get(fp)?.id;

	if (!id) {
		// Upload only if we haven't seen this file before
		const payload: SharePayload = {
			v: 1,
			filename,
			fields,
			file: arrayBufferToBase64(buffer),
		};

		const res = await fetch(`${SHARE_API}/share`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const err = await res.json().catch(() => ({ error: 'Upload failed' }));
			throw new Error((err as any).error || `Upload failed (${res.status})`);
		}

		({ id } = (await res.json()) as { id: string });
		shareCache.set(fp, { id });
	}

	// Build share URL — selection is always fresh since it's just a URL param
	const base = window.location.origin + window.location.pathname;
	let url = `${base}?s=${id}`;

	if (selection) {
		url += `&t=${Math.round(selection.startElapsed)}-${Math.round(selection.endElapsed)}`;
	}

	return { url, id };
}

/**
 * Load a shared workout from a share ID.
 *
 * @param id  The share ID from the URL
 * @returns  Parsed payload, or null if not found / expired
 */
export async function loadSharedWorkout(id: string): Promise<{
	buffer: ArrayBuffer;
	filename: string;
	fields: string[];
} | null> {
	try {
		const res = await fetch(`${SHARE_API}/share/${id}`);
		if (!res.ok) return null;

		const payload: SharePayload = await res.json();
		if (payload.v !== 1 || !payload.file || !payload.filename) return null;

		return {
			buffer: base64ToArrayBuffer(payload.file),
			filename: payload.filename,
			fields: payload.fields ?? [],
		};
	} catch {
		return null;
	}
}

/**
 * Check the URL for a share ID parameter (?s=...).
 * Returns the share ID or null.
 */
export function getShareIdFromUrl(): string | null {
	const params = new URLSearchParams(window.location.search);
	const id = params.get('s');
	if (!id) return null;
	// Validate format: 8-char alphanumeric lowercase
	if (!/^[a-z0-9]{4,12}$/.test(id)) return null;
	return id;
}

/**
 * Get selection range from URL params (?t=<start>-<end> in elapsed seconds).
 * Returns null if no selection param present.
 */
export function getSelectionFromUrl(): { startElapsed: number; endElapsed: number } | null {
	const params = new URLSearchParams(window.location.search);
	const t = params.get('t');
	if (!t) return null;
	const parts = t.split('-');
	if (parts.length !== 2) return null;
	const start = parseFloat(parts[0]);
	const end = parseFloat(parts[1]);
	if (isNaN(start) || isNaN(end) || start < 0 || end <= start) return null;
	return { startElapsed: start, endElapsed: end };
}

export function cleanShareUrl(): void {
	const url = new URL(window.location.href);
	let changed = false;
	if (url.searchParams.has('s')) {
		url.searchParams.delete('s');
		changed = true;
	}
	if (url.searchParams.has('t')) {
		url.searchParams.delete('t');
		changed = true;
	}
	if (changed) {
		window.history.replaceState({}, '', url.toString());
	}
}
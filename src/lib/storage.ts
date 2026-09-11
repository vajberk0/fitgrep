import type { WorkoutSummary } from './types';

const DB_NAME = 'fitgrep';
const DB_VERSION = 1;
const STORE = 'files';

// Legacy localStorage keys — migrated into IndexedDB on first use, then removed.
const LEGACY_META_KEY = 'fitgrep_files_meta';
const LEGACY_FILE_PREFIX = 'fitgrep_file:';

export interface StoredFileMeta {
	filename: string;
	sport: string;
	startTime: string; // ISO
	totalDistance: number; // meters
	totalDuration: number; // seconds
	savedAt: string; // ISO
}

interface StoredEntry {
	meta: StoredFileMeta;
	buffer: ArrayBuffer;
}

// ─── IndexedDB plumbing ───────────────────────────────────────────────────
// FIT files can be several MB; localStorage's ~5 MB quota (plus ~33% base64
// inflation) caused QuotaExceededError once a few workouts were saved.
// IndexedDB stores ArrayBuffers natively with a much larger, dynamic quota.

let dbPromise: Promise<IDBDatabase | null> | null = null;
let memoryFallback: Map<string, StoredEntry> | null = null; // no IndexedDB → session-only

function getDb(): Promise<IDBDatabase | null> {
	if (!dbPromise) {
		dbPromise = new Promise((resolve) => {
			if (typeof indexedDB === 'undefined') {
				memoryFallback = new Map();
				resolve(null);
				return;
			}
			const req = indexedDB.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) {
					db.createObjectStore(STORE, { keyPath: 'meta.filename' });
				}
			};
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => {
				memoryFallback = new Map();
				resolve(null);
			};
			req.onblocked = () => {
				memoryFallback = new Map();
				resolve(null);
			};
		});
	}
	return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function runStore<T>(
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
	const db = await getDb();
	if (!db) return null;
	const tx = db.transaction(STORE, mode);
	return requestToPromise(fn(tx.objectStore(STORE)));
}

// ─── Legacy localStorage migration ────────────────────────────────────────

let migrated = false;

async function migrateLegacy(): Promise<void> {
	if (migrated || typeof localStorage === 'undefined') return;
	migrated = true;
	try {
		const raw = localStorage.getItem(LEGACY_META_KEY);
		if (!raw) return;
		const metas = JSON.parse(raw) as StoredFileMeta[];
		const db = await getDb();
		for (const meta of metas) {
			const base64 = localStorage.getItem(LEGACY_FILE_PREFIX + meta.filename);
			if (!base64) continue;
			const buffer = base64ToArrayBuffer(base64);
			if (db) {
				await runStore('readwrite', (s) => s.put({ meta, buffer }));
			} else {
				memoryFallback?.set(meta.filename, { meta, buffer });
			}
		}
		// Only clean up after a successful move
		localStorage.removeItem(LEGACY_META_KEY);
		for (const meta of metas) {
			localStorage.removeItem(LEGACY_FILE_PREFIX + meta.filename);
		}
	} catch (err) {
		console.warn('Could not migrate previously saved workouts:', err);
	}
}

// ─── Public API ───────────────────────────────────────────────────────────

function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer;
}

function byNewest(a: StoredFileMeta, b: StoredFileMeta): number {
	return b.savedAt.localeCompare(a.savedAt);
}

function isDuplicate(a: StoredFileMeta, b: StoredFileMeta): boolean {
	const nameMatch = a.filename === b.filename;
	const timeMatch = Math.abs(new Date(a.startTime).getTime() - new Date(b.startTime).getTime()) < 60_000;
	return nameMatch && timeMatch;
}

export async function getStoredFiles(): Promise<StoredFileMeta[]> {
	await migrateLegacy();
	const db = await getDb();
	if (!db) {
		return [...memoryFallback?.values() ?? []].map((e) => e.meta).sort(byNewest);
	}
	const entries = (await runStore('readonly', (s) => s.getAll())) as StoredEntry[] | null;
	return (entries ?? []).map((e) => e.meta).sort(byNewest);
}

export async function saveFile(filename: string, buffer: ArrayBuffer, summary: WorkoutSummary): Promise<void> {
	await migrateLegacy();
	const meta: StoredFileMeta = {
		filename,
		sport: summary.sport,
		startTime: summary.startTime.toISOString(),
		totalDistance: summary.totalDistance,
		totalDuration: summary.totalDuration,
		savedAt: new Date().toISOString(),
	};
	const entry: StoredEntry = { meta, buffer };

	const db = await getDb();
	if (!db) {
		memoryFallback?.set(filename, entry);
		return;
	}

	// Replace any duplicate (same workout previously stored under another name)
	const existing = (await runStore('readonly', (s) => s.getAll())) as StoredEntry[] | null;
	const dup = (existing ?? []).find((e) => isDuplicate(e.meta, meta));
	if (dup && dup.meta.filename !== filename) {
		await runStore('readwrite', (s) => s.delete(dup.meta.filename));
	}

	await runStore('readwrite', (s) => s.put(entry));
}

export async function loadFileBuffer(filename: string): Promise<ArrayBuffer | null> {
	const db = await getDb();
	if (!db) return memoryFallback?.get(filename)?.buffer ?? null;
	const entry = (await runStore('readonly', (s) => s.get(filename))) as StoredEntry | null;
	return entry?.buffer ?? null;
}

export async function deleteFile(filename: string): Promise<void> {
	const db = await getDb();
	if (!db) {
		memoryFallback?.delete(filename);
		return;
	}
	await runStore('readwrite', (s) => s.delete(filename));
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m ${s}s`;
	return `${s}s`;
}

export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		return (meters / 1000).toFixed(1) + ' km';
	}
	return Math.round(meters) + ' m';
}

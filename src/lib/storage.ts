import type { WorkoutSummary } from './types';

const META_KEY = 'fitgrep_files_meta';
const FILE_PREFIX = 'fitgrep_file:';

export interface StoredFileMeta {
	filename: string;
	sport: string;
	startTime: string; // ISO
	totalDistance: number; // meters
	totalDuration: number; // seconds
	savedAt: string; // ISO
}

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

export function getStoredFiles(): StoredFileMeta[] {
	try {
		const raw = localStorage.getItem(META_KEY);
		if (!raw) return [];
		return JSON.parse(raw) as StoredFileMeta[];
	} catch {
		return [];
	}
}

export function saveFile(filename: string, buffer: ArrayBuffer, summary: WorkoutSummary): void {
	// Save file data
	const base64 = arrayBufferToBase64(buffer);
	localStorage.setItem(FILE_PREFIX + filename, base64);

	// Update metadata list (deduplicate by filename)
	const files = getStoredFiles();
	const meta: StoredFileMeta = {
		filename,
		sport: summary.sport,
		startTime: summary.startTime.toISOString(),
		totalDistance: summary.totalDistance,
		totalDuration: summary.totalDuration,
		savedAt: new Date().toISOString(),
	};

	const idx = files.findIndex((f) => f.filename === filename);
	if (idx >= 0) {
		// Remove old data if filename changed (shouldn't happen, but safe)
		files[idx] = meta;
	} else {
		files.unshift(meta); // newest first
	}

	localStorage.setItem(META_KEY, JSON.stringify(files));
}

export function loadFileBuffer(filename: string): ArrayBuffer | null {
	const base64 = localStorage.getItem(FILE_PREFIX + filename);
	if (!base64) return null;
	return base64ToArrayBuffer(base64);
}

export function deleteFile(filename: string): void {
	localStorage.removeItem(FILE_PREFIX + filename);
	const files = getStoredFiles().filter((f) => f.filename !== filename);
	localStorage.setItem(META_KEY, JSON.stringify(files));
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

import type { WorkoutData, FieldInfo, SelectionRange, FieldStats } from './types';
import { calcFieldStats } from './stats';
import { getStoredFiles, type StoredFileMeta } from './storage';
import { saveFieldPreferences, loadFieldPreferences, saveLastFile, clearLastFile } from './preferences';

// ─── Reactive State ───────────────────────────────────────────────────────
// Svelte 5 runes-based store using module-level $state

let workoutData = $state<WorkoutData | null>(null);
let currentFilename = $state<string | null>(null);
let enabledFields = $state<string[]>([]); // field keys
let selectionRange = $state<SelectionRange | null>(null);
let isLoading = $state(false);
let errorMessage = $state<string | null>(null);
let storedFiles = $state<StoredFileMeta[]>([]);

// ─── Derived State ────────────────────────────────────────────────────────

function getEnabledFieldInfos(): FieldInfo[] {
	if (!workoutData) return [];
	return workoutData.availableFields.filter((f) => enabledFields.includes(f.key));
}

function getSelectionStats(): Record<string, FieldStats | null> {
	if (!workoutData || workoutData.records.length === 0) return {};

	const startIdx = selectionRange?.startIndex ?? 0;
	const endIdx = selectionRange?.endIndex ?? workoutData.records.length;

	const stats: Record<string, FieldStats | null> = {};
	for (const field of getEnabledFieldInfos()) {
		stats[field.key] = calcFieldStats(workoutData.records, field.key, startIdx, endIdx);
	}
	return stats;
}

function getSelectionDuration(): number {
	if (!workoutData || workoutData.records.length === 0) return 0;
	const startIdx = selectionRange?.startIndex ?? 0;
	const endIdx = selectionRange?.endIndex ?? workoutData.records.length;
	const start = workoutData.records[Math.min(startIdx, workoutData.records.length - 1)]?.elapsed ?? 0;
	const end = workoutData.records[Math.min(endIdx - 1, workoutData.records.length - 1)]?.elapsed ?? 0;
	return end - start;
}

// ─── Actions ──────────────────────────────────────────────────────────────

function setWorkoutData(data: WorkoutData | null, filename?: string) {
	workoutData = data;
	currentFilename = filename ?? null;
	if (data) {
		// Apply saved field preferences if available, otherwise use defaults
		const saved = loadFieldPreferences();
		if (saved) {
			const availableKeys = new Set(data.availableFields.map((f) => f.key));
			// Only keep saved fields that actually exist in this workout
			const restored = saved.filter((k) => availableKeys.has(k));
			if (restored.length > 0) {
				enabledFields = restored;
			} else {
				enabledFields = data.availableFields.filter((f) => f.defaultEnabled).map((f) => f.key);
			}
		} else {
			enabledFields = data.availableFields.filter((f) => f.defaultEnabled).map((f) => f.key);
		}
		if (filename) saveLastFile(filename);
	} else {
		enabledFields = [];
		clearLastFile();
	}
	selectionRange = null;
}

/**
 * Set enabled fields from a shared workout (preserves sharer's view).
 */
function setEnabledFields(fields: string[]) {
	if (!workoutData) return;
	const availableKeys = new Set(workoutData.availableFields.map((f) => f.key));
	enabledFields = fields.filter((k) => availableKeys.has(k));
	// Fall back to defaults if none of the shared fields exist
	if (enabledFields.length === 0) {
		enabledFields = workoutData.availableFields.filter((f) => f.defaultEnabled).map((f) => f.key);
	}
}

function toggleField(key: string) {
	if (enabledFields.includes(key)) {
		enabledFields = enabledFields.filter((k) => k !== key);
	} else {
		enabledFields = [...enabledFields, key];
	}
	saveFieldPreferences(enabledFields);
}

function setSelectionRange(range: SelectionRange | null) {
	selectionRange = range;
}

function setLoading(loading: boolean) {
	isLoading = loading;
}

function setError(msg: string | null) {
	errorMessage = msg;
}

function refreshStoredFiles() {
	storedFiles = getStoredFiles();
}

// Initialize stored files from localStorage
storedFiles = getStoredFiles();

// ─── Export as object for reactivity ──────────────────────────────────────

export const store = {
	get data() { return workoutData; },
	get currentFilename() { return currentFilename; },
	get enabledFields() { return enabledFields; },
	get selectionRange() { return selectionRange; },
	get isLoading() { return isLoading; },
	get errorMessage() { return errorMessage; },
	get enabledFieldInfos() { return getEnabledFieldInfos(); },
	get selectionStats() { return getSelectionStats(); },
	get selectionDuration() { return getSelectionDuration(); },
	get storedFiles() { return storedFiles; },

	setWorkoutData,
	setEnabledFields,
	toggleField,
	setSelectionRange,
	setLoading,
	setError,
	refreshStoredFiles,
};

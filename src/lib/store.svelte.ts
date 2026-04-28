import type { WorkoutData, FieldInfo, SelectionRange, FieldStats } from './types';
import { calcFieldStats, calcEfficiencyFactor, calcDecoupling, calcFieldAverage, findHrField } from './stats';
import { getStoredFiles, type StoredFileMeta } from './storage';
import { saveFieldPreferences, loadFieldPreferences, saveLastFile, clearLastFile } from './preferences';

// ─── Reactive State ───────────────────────────────────────────────────────
// Svelte 5 runes-based store using module-level $state

let workoutData = $state<WorkoutData | null>(null);
let currentFilename = $state<string | null>(null);
let enabledFields = $state<string[]>([]); // field keys
let selectionRange = $state<SelectionRange | null>(null);
let chartAxis = $state<'time' | 'distance'>('time'); // x-axis basis for chart
let selectedLap = $state<number | null>(null); // 1-based lap number, or null
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

interface EfficiencyMetric {
	ef: number | null;
	decoupling: number | null;
}

function getEfficiencyMetrics(): { pwHr: EfficiencyMetric | null; paHr: EfficiencyMetric | null } {
	const result = { pwHr: null as EfficiencyMetric | null, paHr: null as EfficiencyMetric | null };

	if (!workoutData || workoutData.records.length === 0) return result;

	const startIdx = selectionRange?.startIndex ?? 0;
	const endIdx = selectionRange?.endIndex ?? workoutData.records.length;
	const records = workoutData.records;
	const availableFields = workoutData.availableFields;

	// Find HR field with data in range
	const hrField = findHrField(records, startIdx, endIdx);
	if (!hrField) return result;

	// Check for power field
	const powerField = availableFields.find(f => f.key === 'power');
	const powerAvg = powerField ? calcFieldAverage(records, 'power', startIdx, endIdx) : null;
	const hasPower = powerAvg != null && powerAvg > 0;

	if (hasPower) {
		const ef = calcEfficiencyFactor(records, 'power', hrField, startIdx, endIdx);
		const decoupling = calcDecoupling(records, 'power', hrField, startIdx, endIdx);
		result.pwHr = { ef, decoupling };
	}

	// Check for pace/speed field: prefer enhanced_speed, then speed, then grade_adjusted_speed
	const speedKeys = ['enhanced_speed', 'speed', 'grade_adjusted_speed'];
	let paceKey: string | null = null;
	let isPaceField = false;
	for (const key of speedKeys) {
		const field = availableFields.find(f => f.key === key);
		if (!field) continue;
		const avg = calcFieldAverage(records, key, startIdx, endIdx);
		if (avg != null && avg > 0) {
			paceKey = key;
			isPaceField = field.unit === 'min/km';
			break;
		}
	}

	if (paceKey) {
		const ef = calcEfficiencyFactor(records, paceKey, hrField, startIdx, endIdx, isPaceField);
		const decoupling = calcDecoupling(records, paceKey, hrField, startIdx, endIdx, isPaceField);
		result.paHr = { ef, decoupling };
	}

	return result;
}

function selectLap(lapNumber: number | null) {
	if (!workoutData || !workoutData.records.length) return;
	if (lapNumber === null) {
		selectedLap = null;
		const totalRecords = workoutData.records.length;
		selectionRange = {
			startIndex: 0,
			endIndex: totalRecords,
			startElapsed: workoutData.records[0]?.elapsed ?? 0,
			endElapsed: workoutData.records[totalRecords - 1]?.elapsed ?? 0,
			startDistance: workoutData.records[0]?.distance,
			endDistance: workoutData.records[totalRecords - 1]?.distance,
		};
		return;
	}
	const lap = workoutData.laps.find(l => l.number === lapNumber);
	if (!lap) return;
	selectedLap = lapNumber;
	const records = workoutData.records;
	let si = 0;
	let ei = records.length;
	for (let i = 0; i < records.length; i++) {
		if (records[i].elapsed >= lap.startElapsed) { si = i; break; }
	}
	for (let i = 0; i < records.length; i++) {
		if (records[i].elapsed >= lap.endElapsed) { ei = i; break; }
	}
	selectionRange = {
		startIndex: si,
		endIndex: ei,
		startElapsed: records[si]?.elapsed ?? lap.startElapsed,
		endElapsed: records[Math.min(ei - 1, records.length - 1)]?.elapsed ?? lap.endElapsed,
		startDistance: records[si]?.distance,
		endDistance: records[Math.min(ei - 1, records.length - 1)]?.distance,
	};
}

function clearLapSelection() {
	selectedLap = null;
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
	selectedLap = null;
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
	get chartAxis() { return chartAxis; },
	get isLoading() { return isLoading; },
	get errorMessage() { return errorMessage; },
	get enabledFieldInfos() { return getEnabledFieldInfos(); },
	get selectionStats() { return getSelectionStats(); },
	get selectionDuration() { return getSelectionDuration(); },
	get efficiencyMetrics() { return getEfficiencyMetrics(); },
	get storedFiles() { return storedFiles; },

	setWorkoutData,
	setEnabledFields,
	get laps() { return workoutData?.laps ?? []; },
	get selectedLap() { return selectedLap; },
	selectLap,
	clearLapSelection,
	toggleField,
	setSelectionRange,
	setChartAxis(axis: 'time' | 'distance') {
		chartAxis = axis;
	},
	setLoading,
	setError,
	refreshStoredFiles,
};

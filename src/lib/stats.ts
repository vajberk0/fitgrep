import type { DataPoint, FieldStats, WorkoutSummary } from './types';

// ─── Efficiency Factor and Decoupling ────────────────────────────────

/**
 * Compute Normalized Power (or normalized output for any field) using the
 * standard 30-second trailing rolling average with IV averaging
 * (raise each rolling average to 4th power → mean → 4th root).
 */
export function calcNormalizedPower(
	records: DataPoint[],
	fieldKey: string,
	startIndex: number = 0,
	endIndex: number = records.length
): number | null {
	const entries: { elapsed: number; val: number }[] = [];
	for (let i = startIndex; i < endIndex; i++) {
		const v = records[i][fieldKey];
		if (v != null && !isNaN(v)) {
			entries.push({ elapsed: records[i].elapsed, val: v });
		}
	}
	if (entries.length < 6) return null;

	const rollingAverages: number[] = [];
	let windowStart = 0;
	for (let i = 0; i < entries.length; i++) {
		const windowEnd = entries[i].elapsed;
		const windowBegin = windowEnd - 30;
		while (windowStart < i && entries[windowStart].elapsed < windowBegin) {
			windowStart++;
		}
		let sum = 0;
		let count = 0;
		for (let j = windowStart; j <= i; j++) {
			sum += entries[j].val;
			count++;
		}
		rollingAverages.push(sum / count);
	}

	let sum4 = 0;
	for (const avg of rollingAverages) {
		sum4 += avg ** 4;
	}
	return Math.pow(sum4 / rollingAverages.length, 1 / 4);
}

/**
 * Compute the average of a field over a range of records.
 */
export function calcFieldAverage(
	records: DataPoint[],
	fieldKey: string,
	startIndex: number = 0,
	endIndex: number = records.length
): number | null {
	let sum = 0;
	let count = 0;
	for (let i = startIndex; i < endIndex; i++) {
		const val = records[i][fieldKey];
		if (val != null && !isNaN(val)) {
			sum += val;
			count++;
		}
	}
	return count > 0 ? sum / count : null;
}

/**
 * Calculate Efficiency Factor (EF) for a field paired with heart rate.
 *
 * For power-based fields, EF = normalized power (or avg power) / avg heart rate.
 * For pace fields (min/km), the pace is converted to speed in m/min first:
 *   speed = 1000 / pace_min  →  EF = speed / avgHR.
 * For speed fields (km/h), converted to m/min:
 *   speed = kmh × 1000 / 60  →  EF = speed / avgHR.
 *
 * Returns the EF value rounded to 2 decimal places, or null if insufficient data.
 */
export function calcEfficiencyFactor(
	records: DataPoint[],
	outputKey: string,
	hrKey: string,
	startIndex: number = 0,
	endIndex: number = records.length,
	isPaceField: boolean = false
): number | null {
	const avgHr = calcFieldAverage(records, hrKey, startIndex, endIndex);
	if (avgHr == null || avgHr <= 0) return null;

	let avgOut: number | null;
	if (isPaceField) {
		// Output is pace in min/km → convert to speed in m/min: speed = 1000 / pace
		avgOut = calcFieldAverage(records, outputKey, startIndex, endIndex);
		if (avgOut == null || avgOut <= 0) return null;
		avgOut = 1000 / avgOut; // now m/min
	} else {
		// Power or speed: try normalized power first, fall back to average
		const np = calcNormalizedPower(records, outputKey, startIndex, endIndex);
		if (np != null && np > 0) {
			avgOut = np;
		} else {
			avgOut = calcFieldAverage(records, outputKey, startIndex, endIndex);
			if (avgOut == null || avgOut <= 0) return null;
		}
	}

	return Math.round((avgOut / avgHr) * 100) / 100;
}

/**
 * Calculate aerobic decoupling percentage.
 * Splits the data range into two halves by elapsed time, computes EF for each half,
 * then: Decoupling % = ((EF_first - EF_second) / EF_first) × 100
 *
 * A positive value means efficiency dropped in the second half (aerobic decoupling / HR drift).
 * A negative value means efficiency improved. <5% is considered good aerobic endurance.
 * Returns the percentage rounded to 1 decimal place.
 */
export function calcDecoupling(
	records: DataPoint[],
	outputKey: string,
	hrKey: string,
	startIndex: number = 0,
	endIndex: number = records.length,
	isPaceField: boolean = false
): number | null {
	if (endIndex - startIndex < 6) return null;

	const startElapsed = records[startIndex]?.elapsed ?? 0;
	const endElapsed = records[Math.min(endIndex - 1, records.length - 1)]?.elapsed ?? 0;
	const midpoint = (startElapsed + endElapsed) / 2;

	// Find first record at or past the midpoint
	let splitIdx = startIndex;
	for (let i = startIndex; i < endIndex; i++) {
		if (records[i].elapsed >= midpoint) {
			splitIdx = i;
			break;
		}
	}
	if (splitIdx === startIndex || splitIdx >= endIndex - 1) return null;

	const efFirst = calcEfficiencyFactor(records, outputKey, hrKey, startIndex, splitIdx, isPaceField);
	const efSecond = calcEfficiencyFactor(records, outputKey, hrKey, splitIdx, endIndex, isPaceField);

	if (efFirst == null || efSecond == null || efFirst === 0) return null;

	return Math.round(((efFirst - efSecond) / efFirst) * 100 * 10) / 10;
}

/**
 * Find the best available heart-rate field that has data in the given range.
 * Preference order: heart_rate → external_heart_rate → wrist_heart_rate.
 */
export function findHrField(
	records: DataPoint[],
	startIndex: number = 0,
	endIndex: number = records.length
): string | null {
	const candidates = ['heart_rate', 'external_heart_rate', 'wrist_heart_rate'];
	for (const key of candidates) {
		const avg = calcFieldAverage(records, key, startIndex, endIndex);
		if (avg != null && avg > 0) return key;
	}
	return null;
}

// ─── Field Stats (MIN/AVG/MAX) ────────────────────────────────────────

/**
 * Calculate MIN/AVG/MAX for a specific field within a range of data points.
 */
export function calcFieldStats(
	records: DataPoint[],
	fieldKey: string,
	startIndex: number = 0,
	endIndex: number = records.length
): FieldStats | null {
	let min = Infinity;
	let max = -Infinity;
	let sum = 0;
	let count = 0;

	for (let i = startIndex; i < endIndex; i++) {
		const val = records[i][fieldKey];
		if (val != null && !isNaN(val)) {
			if (val < min) min = val;
			if (val > max) max = val;
			sum += val;
			count++;
		}
	}

	if (count === 0) return null;

	return {
		min: Math.round(min * 100) / 100,
		avg: Math.round((sum / count) * 100) / 100,
		max: Math.round(max * 100) / 100,
	};
}

/**
 * Format elapsed seconds to HH:MM:SS or MM:SS
 */
export function formatElapsed(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	if (h > 0) {
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
	return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format a date nicely
 */
export function formatDate(date: Date): string {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

/**
 * Format distance from meters
 */
export function formatDistance(meters: number): string {
	if (meters >= 1000) {
		return `${(meters / 1000).toFixed(2)} km`;
	}
	return `${meters.toFixed(0)} m`;
}

/**
 * Format speed from m/s to km/h
 */
export function formatSpeed(mps: number): string {
	return `${(mps * 3.6).toFixed(1)} km/h`;
}

/**
 * Format pace from m/s to min/km
 */
export function formatPace(mps: number): string {
	if (mps <= 0) return '--:--';
	const secPerKm = 1000 / mps;
	const min = Math.floor(secPerKm / 60);
	const sec = Math.floor(secPerKm % 60);
	return `${min}:${String(sec).padStart(2, '0')} /km`;
}

/**
 * Format a pace value stored as decimal min/km (e.g. 5.25 → "5:15")
 */
export function formatPaceDecimal(decimalMinPerKm: number): string {
	if (!isFinite(decimalMinPerKm) || decimalMinPerKm <= 0) return '--:--';
	const totalSeconds = decimalMinPerKm * 60;
	const min = Math.floor(totalSeconds / 60);
	const sec = Math.round(totalSeconds % 60);
	if (sec === 60) return `${min + 1}:00`;
	return `${min}:${String(sec).padStart(2, '0')}`;
}

/**
 * Build a summary string
 */
export function formatSummary(summary: WorkoutSummary): string {
	const parts: string[] = [];
	if (summary.sport) parts.push(summary.sport);
	parts.push(formatElapsed(summary.totalDuration));
	if (summary.totalDistance > 0) parts.push(formatDistance(summary.totalDistance));
	return parts.join(' • ');
}

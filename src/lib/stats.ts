import type { DataPoint, FieldStats, WorkoutSummary } from './types';

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

import FitParser from 'fit-file-parser';
import type { DataPoint, WorkoutData, WorkoutSummary, FieldInfo, LapInfo } from './types';
import { buildFieldInfo, EXCLUDED_FIELDS } from './fieldConfig';

const fitParser = new FitParser({
	force: true,
	speedUnits: 'm/s',
	lengthUnit: 'm',
	temperatureUnit: 'celsius',
	elapsedRecordField: true,
	mode: 'both',
});

/**
 * Parse a FIT file ArrayBuffer into WorkoutData.
 */
export async function parseFitFile(buffer: ArrayBuffer): Promise<WorkoutData> {
	const raw = await fitParser.parseAsync(buffer);

	const records = raw.records ?? [];
	const sessions = raw.sessions ?? [];

	if (records.length === 0) {
		throw new Error('No record data found in this file');
	}

	// Sort records by timestamp
	records.sort((a: any, b: any) => {
		const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
		const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
		return ta - tb;
	});

	// Find start timestamp
	const firstTimestamp = records[0].timestamp ? new Date(records[0].timestamp).getTime() : 0;

	// Discover all numeric fields across all records
	const fieldSet = new Set<string>();
	for (const rec of records) {
		for (const key of Object.keys(rec)) {
			if (EXCLUDED_FIELDS.has(key)) continue;
			const val = rec[key];
			if (typeof val === 'number' && !isNaN(val)) {
				fieldSet.add(key);
			}
		}
	}

	// Build FieldInfo list
	const availableFields: FieldInfo[] = [];
	let colorIdx = 0;
	for (const key of fieldSet) {
		const info = buildFieldInfo(key, colorIdx);
		availableFields.push(info);
		colorIdx++;
	}

	// Sort: default-enabled first, then alphabetical
	availableFields.sort((a, b) => {
		if (a.defaultEnabled !== b.defaultEnabled) return a.defaultEnabled ? -1 : 1;
		return a.label.localeCompare(b.label);
	});

	// Reassign colors after sort
	for (let i = 0; i < availableFields.length; i++) {
		availableFields[i] = { ...availableFields[i], color: buildFieldInfo(availableFields[i].key, i).color };
	}

	// Build summary from session message (need session early for sport detection)
	const session = sessions[0] ?? ({} as any);

	// Detect if this is a running workout
	const sportRaw = (session.sport ?? '').toLowerCase();
	const isRunning = sportRaw.includes('running');

	// Speed field keys that should be converted to pace for running
	const speedKeys = new Set(['enhanced_speed', 'speed']);
	// GAP (grade-adjusted pace) fields: speed in m/s, converted differently
	const gapKeys = new Set(['grade_adjusted_speed']);

	// If running, update field config for speed fields → pace
	if (isRunning) {
		for (const field of availableFields) {
			if (speedKeys.has(field.key)) {
				field.label = 'Pace';
				field.unit = 'min/km';
				field.inverted = true;
			} else if (gapKeys.has(field.key)) {
				field.label = 'GAP';
				field.unit = 'min/km';
				field.inverted = true;
			}
		}
	}

	// Build DataPoint array
	const dataPoints: DataPoint[] = [];
	for (const rec of records) {
		const ts = rec.timestamp ? new Date(rec.timestamp).getTime() : 0;
		// Use elapsed_time if available, otherwise compute from timestamp
		const elapsed = typeof rec.elapsed_time === 'number'
			? rec.elapsed_time
			: (firstTimestamp > 0 ? (ts - firstTimestamp) / 1000 : 0);

		const dp: DataPoint = {
			elapsed,
			timestamp: ts,
		};

		for (const field of availableFields) {
			const rawVal = rec[field.key];
			if (typeof rawVal === 'number' && !isNaN(rawVal)) {
				let val = rawVal * field.scale;
				// Convert speed (km/h) to pace (min/km) for running workouts
				if (isRunning && speedKeys.has(field.key)) {
					val = val > 0.5 ? 60 / val : NaN; // guard against zero/very low speed
				} else if (isRunning && gapKeys.has(field.key)) {
					val = val > 0.5 ? 60 / val : NaN; // grade-adjusted speed → pace
				}
				if (!isNaN(val)) {
					dp[field.key] = val;
				}
			}
		}

		// Always include cumulative distance for distance-based x-axis (even though it's excluded from chart metrics)
		if (typeof rec.distance === 'number' && !isNaN(rec.distance)) {
			dp.distance = rec.distance;
		}

		dataPoints.push(dp);
	}

	// Extract GPS track
	const gpsTrack: [number, number][] = [];
	for (const rec of records) {
		if (
			rec.position_lat != null &&
			rec.position_long != null &&
			typeof rec.position_lat === 'number' &&
			typeof rec.position_long === 'number'
		) {
			gpsTrack.push([rec.position_lat, rec.position_long]);
		}
	}

	// Build summary from session message
	const summary: WorkoutSummary = {
		sport: capitalize(session.sport ?? 'Unknown'),
		subSport: capitalize(session.sub_sport ?? ''),
		startTime: session.start_time ? new Date(session.start_time) : (firstTimestamp > 0 ? new Date(firstTimestamp) : new Date()),
		totalDistance: session.total_distance ?? 0,
		totalDuration: session.total_timer_time ?? (dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].elapsed : 0),
		totalElapsed: session.total_elapsed_time ?? (dataPoints.length > 0 ? dataPoints[dataPoints.length - 1].elapsed : 0),
		totalAscent: session.total_ascent ?? 0,
		totalDescent: session.total_descent ?? 0,
		avgHeartRate: session.avg_heart_rate ?? session.enhanced_avg_heart_rate ?? null,
		maxHeartRate: session.max_heart_rate ?? session.enhanced_max_heart_rate ?? null,
		avgSpeed: session.enhanced_avg_speed ?? session.avg_speed ?? null,
		maxSpeed: session.enhanced_max_speed ?? session.max_speed ?? null,
		avgPower: session.avg_power ?? null,
		maxPower: session.max_power ?? null,
		avgCadence: session.avg_cadence ?? null,
		maxCadence: session.max_cadence ?? null,
		totalCalories: session.total_calories ?? null,
	};

	// If no session, compute some summary from records
	if (!sessions.length && dataPoints.length > 0) {
		summary.totalDuration = dataPoints[dataPoints.length - 1].elapsed;
		summary.totalElapsed = dataPoints[dataPoints.length - 1].elapsed;
	}

	// Convert summary speed values to pace (min/km) for running workouts
	if (isRunning) {
		if (summary.avgSpeed != null && summary.avgSpeed > 0) {
			summary.avgSpeed = 60 / (summary.avgSpeed * 3.6); // m/s → km/h → min/km
		}
		if (summary.maxSpeed != null && summary.maxSpeed > 0) {
			summary.maxSpeed = 60 / (summary.maxSpeed * 3.6); // m/s → km/h → min/km
		}
	} else {
		if (summary.avgSpeed != null) summary.avgSpeed *= 3.6; // m/s → km/h
		if (summary.maxSpeed != null) summary.maxSpeed *= 3.6;
	}

	// Extract lap data
	const laps: LapInfo[] = [];
	const fitLaps: any[] = raw.laps ?? [];
	for (let i = 0; i < fitLaps.length; i++) {
		const lap = fitLaps[i];
		const startTs = lap.start_time ? new Date(lap.start_time).getTime() : null;
		const endTs = lap.timestamp ? new Date(lap.timestamp).getTime() : null;

		const startElapsed = startTs != null ? (startTs - firstTimestamp) / 1000 : (i > 0 && fitLaps[i - 1].timestamp ? (new Date(fitLaps[i - 1].timestamp).getTime() - firstTimestamp) / 1000 : 0);
		const duration = lap.total_elapsed_time ?? lap.total_timer_time ?? null;

		// Compute endElapsed: prefer startElapsed + duration (reliable), fall back to
		// timestamp-based calculation. Some devices set lap.timestamp == lap.start_time,
		// making the timestamp-based endElapsed identical to startElapsed.
		let endElapsed: number;
		const tsEndElapsed = endTs != null ? (endTs - firstTimestamp) / 1000 : null;
		if (duration != null && (tsEndElapsed == null || tsEndElapsed <= startElapsed)) {
			endElapsed = startElapsed + duration;
		} else if (tsEndElapsed != null) {
			endElapsed = tsEndElapsed;
		} else {
			endElapsed = i < fitLaps.length - 1 && fitLaps[i + 1].start_time ? (new Date(fitLaps[i + 1].start_time).getTime() - firstTimestamp) / 1000 : dataPoints[dataPoints.length - 1].elapsed;
		}

		laps.push({
			number: i + 1,
			startElapsed: Math.max(0, startElapsed),
			endElapsed: Math.max(startElapsed, endElapsed),
			duration: duration ?? (endElapsed - startElapsed),
			distance: lap.total_distance ?? null,
			trigger: (lap.lap_trigger ?? '').toLowerCase().replace(/_/g, ' '),
		});
	}

	return {
		records: dataPoints,
		summary,
		availableFields,
		gpsTrack,
		laps,
	};
}

function capitalize(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

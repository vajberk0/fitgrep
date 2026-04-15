import type { FieldInfo } from './types';

/**
 * Configuration for known FIT record fields.
 * Maps raw field keys (snake_case as output by fit-file-parser) to human-readable labels, units, scale factors, and default visibility.
 */
export const FIELD_CONFIG: Record<string, Partial<FieldInfo>> = {
	heart_rate: { label: 'Heart Rate', unit: 'bpm', scale: 1, defaultEnabled: true, color: '#e74c3c' },
	enhanced_speed: { label: 'Speed', unit: 'km/h', scale: 3.6, defaultEnabled: true, color: '#3498db' },
	speed: { label: 'Speed', unit: 'km/h', scale: 3.6, defaultEnabled: true, color: '#3498db' },
	cadence: { label: 'Cadence', unit: 'rpm', scale: 1, defaultEnabled: true },
	enhanced_altitude: { label: 'Altitude', unit: 'm', scale: 1, defaultEnabled: true, color: '#7f8c8d' },
	altitude: { label: 'Altitude', unit: 'm', scale: 1, defaultEnabled: true, color: '#7f8c8d' },
	power: { label: 'Power', unit: 'W', scale: 1, defaultEnabled: true },
	temperature: { label: 'Temperature', unit: '°C', scale: 1, defaultEnabled: false },
	accumulated_power: { label: 'Accumulated Power', unit: 'J', scale: 1, defaultEnabled: false },
	vertical_oscillation: { label: 'Vertical Oscillation', unit: 'mm', scale: 10, defaultEnabled: false },
	vertical_speed: { label: 'Vertical Speed', unit: 'm/s', scale: 1, defaultEnabled: false },
	stance_time: { label: 'Ground Contact Time', unit: 'ms', scale: 1, defaultEnabled: false },
	stance_time_percent: { label: 'Ground Contact %', unit: '%', scale: 1, defaultEnabled: false },
	stance_time_balance: { label: 'GCT Balance', unit: '%', scale: 1, defaultEnabled: false },
	vertical_ratio: { label: 'Vertical Ratio', unit: '%', scale: 1, defaultEnabled: false },
	step_length: { label: 'Step Length', unit: 'mm', scale: 1, defaultEnabled: false },
	left_right_balance: { label: 'L/R Balance', unit: '%', scale: 1, defaultEnabled: false },
	fractional_cadence: { label: 'Fractional Cadence', unit: '', scale: 1, defaultEnabled: false },
	grade: { label: 'Grade', unit: '%', scale: 1, defaultEnabled: false },
	resistance: { label: 'Resistance', unit: '', scale: 1, defaultEnabled: false },
};

/** Color palette for chart series */
export const SERIES_COLORS = [
	'#e74c3c', // red - heart rate
	'#3498db', // blue - speed
	'#2ecc71', // green - cadence
	'#f39c12', // orange - altitude
	'#9b59b6', // purple - power
	'#1abc9c', // teal - temperature
	'#e67e22', // dark orange
	'#34495e', // dark blue-grey
	'#16a085', // dark teal
	'#c0392b', // dark red
	'#2980b9', // dark blue
	'#8e44ad', // dark purple
	'#27ae60', // dark green
	'#d35400', // pumpkin
	'#7f8c8d', // grey
];

/** Fields to exclude from chart display (non-numeric, metadata, or redundant) */
export const EXCLUDED_FIELDS = new Set([
	'timestamp',
	'position_lat',
	'position_long',
	'distance', // shown in summary
	'elapsed_time', // used internally
	'timer_time', // metadata
	'activity_type', // string field
]);

/**
 * Humanize a field key: snake_case → "Snake Case" with proper casing
 */
export function humanizeKey(key: string): string {
	return key
		.split('_')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/**
 * Build a FieldInfo object for a discovered field
 */
export function buildFieldInfo(key: string, index: number): FieldInfo {
	const config = FIELD_CONFIG[key];
	return {
		key,
		label: config?.label ?? humanizeKey(key),
		unit: config?.unit ?? '',
		scale: config?.scale ?? 1,
		defaultEnabled: config?.defaultEnabled ?? false,
		color: config?.color ?? SERIES_COLORS[index % SERIES_COLORS.length],
	};
}

// Core data types for fitgrep

export interface FieldInfo {
	/** Field key as found in FIT record messages */
	key: string;
	/** Human-readable label */
	label: string;
	/** Unit string (e.g. "bpm", "km/h", "m") */
	unit: string;
	/** Scale factor to convert from FIT raw value (e.g. speed: m/s → km/h = 3.6) */
	scale: number;
	/** Whether this field is enabled by default */
	defaultEnabled: boolean;
	/** Color for chart line */
	color: string;
	/** Whether the y-axis should be inverted (e.g. pace: lower value = faster = better) */
	inverted?: boolean;
}

export interface DataPoint {
	/** Elapsed seconds since workout start */
	elapsed: number;
	/** Timestamp as ms since epoch */
	timestamp: number;
	/** Field values keyed by field name */
	[key: string]: number;
}

export interface WorkoutSummary {
	sport: string;
	subSport: string;
	startTime: Date;
	totalDistance: number; // meters
	totalDuration: number; // seconds
	totalElapsed: number; // seconds
	totalAscent: number; // meters
	totalDescent: number; // meters
	avgHeartRate: number | null;
	maxHeartRate: number | null;
	avgSpeed: number | null;
	maxSpeed: number | null;
	avgPower: number | null;
	maxPower: number | null;
	avgCadence: number | null;
	maxCadence: number | null;
	totalCalories: number | null;
}

export interface SelectionRange {
	startIndex: number;
	endIndex: number;
	startElapsed: number;
	endElapsed: number;
	startDistance?: number;
	endDistance?: number;
}

export interface LapInfo {
	/** Lap number (1-based) */
	number: number;
	/** Elapsed seconds at lap start (relative to workout start) */
	startElapsed: number;
	/** Elapsed seconds at lap end (relative to workout start) */
	endElapsed: number;
	/** Duration in seconds */
	duration: number;
	/** Distance in meters, if available */
	distance: number | null;
	/** Cumulative distance (m) at lap start, from the record stream — use this to plot lap boundaries on a distance x-axis */
	startDistance?: number;
	/** Trigger type (e.g. 'manual', 'distance', 'time') */
	trigger: string;
}

export interface WorkoutData {
	records: DataPoint[];
	summary: WorkoutSummary;
	availableFields: FieldInfo[];
	gpsTrack: [number, number][]; // [lat, lng] pairs
	laps: LapInfo[];
}

export interface FieldStats {
	min: number;
	avg: number;
	max: number;
}

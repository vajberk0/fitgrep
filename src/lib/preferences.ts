// User preferences persisted via cookies and localStorage

const FIELDS_COOKIE = 'fitgrep_fields';
const LAST_FILE_KEY = 'fitgrep_last_file';

// ─── Field preferences (cookie) ───────────────────────────────────────────

export function saveFieldPreferences(enabledFields: string[]): void {
	const value = enabledFields.join(',');
	// 365 days expiry, SameSite=Lax for security
	document.cookie = `${FIELDS_COOKIE}=${encodeURIComponent(value)};max-age=${365 * 86400};path=/;SameSite=Lax`;
}

export function loadFieldPreferences(): string[] | null {
	try {
		const match = document.cookie
			.split('; ')
			.find((c) => c.startsWith(FIELDS_COOKIE + '='));
		if (!match) return null;
		const value = decodeURIComponent(match.split('=').slice(1).join('='));
		if (!value) return null;
		return value.split(',').filter(Boolean);
	} catch {
		return null;
	}
}

// ─── Last viewed file (localStorage) ──────────────────────────────────────

export function saveLastFile(filename: string): void {
	try {
		localStorage.setItem(LAST_FILE_KEY, filename);
	} catch {
		// localStorage full or unavailable — non-critical
	}
}

export function loadLastFile(): string | null {
	try {
		return localStorage.getItem(LAST_FILE_KEY);
	} catch {
		return null;
	}
}

export function clearLastFile(): void {
	try {
		localStorage.removeItem(LAST_FILE_KEY);
	} catch {
		// non-critical
	}
}

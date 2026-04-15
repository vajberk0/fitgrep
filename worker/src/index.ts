/**
 * Cloudflare Worker for fitgrep share links.
 *
 * Stores workout payloads in R2 and returns short share IDs.
 * The payload is an opaque JSON blob created by the frontend
 * (contains filename, enabled fields, and base64-encoded FIT file).
 *
 * Endpoints:
 *   POST /share        → store a payload, returns { id }
 *   GET  /share/:id    → retrieve a payload
 *   OPTIONS *          → CORS preflight
 */

export interface Env {
	BUCKET: R2Bucket;
	CORS_ORIGIN: string; // e.g. "https://fitgrep.app"
}

const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_TOTAL_STORAGE = 9 * 1024 * 1024 * 1024; // 9 GB (1 GB buffer under 10 GB free tier)
const SHARE_ID_LENGTH = 8;
const CHARSET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateId(): string {
	const bytes = new Uint8Array(SHARE_ID_LENGTH);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) => CHARSET[b % CHARSET.length]).join('');
}

function corsHeaders(env: Env): Record<string, string> {
	return {
		'Access-Control-Allow-Origin': env.CORS_ORIGIN || '*',
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		'Access-Control-Max-Age': '86400',
	};
}

function jsonResponse(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', ...extra },
	});
}

/**
 * Sum the sizes of all objects in the R2 bucket.
 * Paginates through all keys (max 1000 per page).
 */
async function getTotalStorage(bucket: R2Bucket): Promise<number> {
	let total = 0;
	let cursor: string | undefined;
	do {
		const listed = await bucket.list({ limit: 1000, cursor });
		for (const obj of listed.objects) {
			total += obj.size;
		}
		cursor = listed.truncated ? listed.cursor : undefined;
	} while (cursor);
	return total;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const cors = corsHeaders(env);

		// ── CORS preflight ────────────────────────────────────────────
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: cors });
		}

		// ── POST /share – upload ─────────────────────────────────────
		if (request.method === 'POST' && url.pathname === '/share') {
			const contentLength = Number(request.headers.get('content-length') || 0);
			if (contentLength > MAX_PAYLOAD_SIZE) {
				return jsonResponse({ error: 'Payload too large (max 5 MB)' }, 413, cors);
			}

			const body = await request.arrayBuffer();
			if (body.byteLength > MAX_PAYLOAD_SIZE) {
				return jsonResponse({ error: 'Payload too large (max 5 MB)' }, 413, cors);
			}

			// Quick validation: must be valid JSON with required fields
			let parsed: any;
			try {
				parsed = JSON.parse(new TextDecoder().decode(body));
				if (!parsed.v || !parsed.file || !parsed.filename) {
					return jsonResponse({ error: 'Invalid payload format' }, 400, cors);
				}
			} catch {
				return jsonResponse({ error: 'Invalid JSON' }, 400, cors);
			}

			// Reject uploads that would exceed the storage cap
			const currentStorage = await getTotalStorage(env.BUCKET);
			if (currentStorage + body.byteLength > MAX_TOTAL_STORAGE) {
				return jsonResponse({ error: 'Storage limit reached' }, 507, cors);
			}

			const id = generateId();

			await env.BUCKET.put(id, body, {
				httpMetadata: { contentType: 'application/json' },
				customMetadata: {
					filename: String(parsed.filename).slice(0, 255),
					uploadedAt: new Date().toISOString(),
				},
			});

			return jsonResponse({ id }, 201, cors);
		}

		// ── GET /share/:id – retrieve ─────────────────────────────────
		const shareMatch = url.pathname.match(/^\/share\/([a-z0-9]+)$/);
		if (request.method === 'GET' && shareMatch) {
			const id = shareMatch[1];

			const obj = await env.BUCKET.get(id);
			if (!obj) {
				return jsonResponse({ error: 'Not found' }, 404, cors);
			}

			const data = await obj.arrayBuffer();

			// Auto-delete shares older than 90 days
			const uploadedAt = obj.customMetadata?.uploadedAt;
			if (uploadedAt) {
				const age = Date.now() - new Date(uploadedAt).getTime();
				if (age > 90 * 24 * 60 * 60 * 1000) {
					await env.BUCKET.delete(id);
					return jsonResponse({ error: 'Share link has expired' }, 410, cors);
				}
			}

			return new Response(data, {
				headers: {
					'Content-Type': 'application/json',
					'Cache-Control': 'public, max-age=2592000', // cache 30 days
					...cors,
				},
			});
		}

		// ── Fallback ─────────────────────────────────────────────────
		return jsonResponse({ error: 'Not found' }, 404, cors);
	},
};
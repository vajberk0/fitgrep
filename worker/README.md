# fitgrep Share Worker

Cloudflare Worker + R2 bucket that powers fitgrep's share-by-link feature.

## Setup

1. **Create the R2 bucket** (one-time):
   ```bash
   cd worker
   npm install
   npx wrangler r2 bucket create fitgrep-shares
   ```

2. **Configure CORS** — edit `wrangler.toml` and set `CORS_ORIGIN` to your domain:
   ```toml
   [vars]
   CORS_ORIGIN = "https://fitgrep.app"
   ```

3. **Set the frontend env var** — in your Vite config or `.env`:
   ```
   VITE_SHARE_API=https://share.fitgrep.app
   ```
   For local dev the default is `http://localhost:8787`.

## Local Development

```bash
cd worker
npm install
npx wrangler dev
```

This starts the worker at `http://localhost:8787`.

## Deploy

```bash
npx wrangler deploy
```

Then add a custom domain or route in the Cloudflare dashboard (e.g. `share.fitgrep.dev` → this worker).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CORS_ORIGIN` | No | Allowed origin for CORS. Defaults to `*` (all origins). Lock to your domain in production. |
| `BUCKET` | Yes | R2 bucket binding (configured in `wrangler.toml`). |

## API

### `POST /share`

Upload a workout payload. Body must be JSON:

```json
{
  "v": 1,
  "filename": "morning_run.fit",
  "fields": ["heart_rate", "enhanced_speed"],
  "file": "<base64-encoded FIT file>"
}
```

Returns:

```json
{ "id": "abc12345" }
```

### `GET /share/:id`

Retrieve a previously shared workout. Returns the same JSON payload.

Shares auto-expire after 90 days.

## Limits

- Maximum payload size: **5 MB**
- Share IDs: 8-character alphanumeric (`a-z0-9`)
- Auto-cleanup: shares older than 90 days are deleted on read
# fitgrep — Agent Guide

## Project Overview

Single-page web app that lets athletes upload Garmin .FIT workout files and explore performance data through interactive charts with timeline-based selection for MIN/AVG/MAX statistics. Frontend-only app with an optional Cloudflare Worker backend for share-by-link functionality.

## Tech Stack

- **Framework**: Svelte 5 + TypeScript (runes-based reactivity with `$state`)
- **Build**: Vite
- **FIT Parsing**: `fit-file-parser` (NOT `@garmin/fitsdk` — that one has a stream-based API unsuitable for browser use). **Patched** with `patch-package` to add undocumented Garmin record fields (see below).
- **Charts**: Apache ECharts v5 (lazy-loaded)
- **Maps**: Leaflet + OpenStreetMap (lazy-loaded)
- **Styling**: CSS variables + Svelte scoped styles

## Architecture

```
src/
├── main.ts                      # App entry point
├── app.css                      # Global CSS variables & base styles
├── App.svelte                   # Root layout: upload ↔ data view
├── lib/
│   ├── types.ts                 # Core types: DataPoint, FieldInfo, WorkoutSummary, SelectionRange
│   ├── fieldConfig.ts           # FIT field → label/unit/scale/color mapping (snake_case keys!)
│   ├── parser.ts                # FIT file → WorkoutData (async, returns Promise)
│   ├── stats.ts                 # MIN/AVG/MAX calc, formatting utilities
│   ├── store.svelte.ts          # Svelte 5 reactive store (module-level $state + getter fns)
│   ├── storage.ts               # LocalStorage persistence for uploaded FIT files
│   ├── share.ts                 # Share-by-link: upload/load shared workouts via Cloudflare Worker
│   └── preferences.ts           # Cookie/localStorage for field preferences & last viewed file
└── components/
    ├── UploadZone.svelte        # Drag & drop + file input, calls parser via dynamic import
    ├── StoredFiles.svelte       # Lists previously uploaded workouts from local storage
    ├── ErrorBar.svelte          # Dismissable error notifications
    ├── FieldSelector.svelte     # Toggleable chips for discovered metrics
    ├── WorkoutChart.svelte      # ECharts multi-series chart with Time/Distance axis toggle + dataZoom slider
    ├── StatsPanel.svelte        # MIN/AVG/MAX table, selection-aware (shows distance range when chart is in distance mode)
    ├── GpsMap.svelte            # Leaflet map with track + selection highlight
    ├── WorkoutSummary.svelte    # Date, sport, duration, distance, elevation bar
    └── ShareModal.svelte        # Share-by-link modal: upload workout, get copyable URL
```

## Key Design Decisions

1. **Field names are snake_case** — `fit-file-parser` outputs `heart_rate`, `enhanced_speed`, etc. NOT camelCase. All field lookups in `fieldConfig.ts` use snake_case keys.

2. **Store pattern** — `store.svelte.ts` uses Svelte 5 `$state` runes at module level, exported as an object with getters. This gives fine-grained reactivity without a context provider.

3. **Lazy loading** — ECharts, Leaflet, and the parser are all dynamically imported to keep the initial bundle small (~62KB main chunk).

4. **Data-agnostic** — Fields are discovered at parse time from FIT record messages. Unknown fields get humanized labels and are disabled by default.

5. **Scale conversion** happens at parse time in `parser.ts` (e.g., speed ×3.6 for km/h). Chart and stats work with already-converted values.

## Important Gotchas

- **fit-file-parser patch**: The library silently drops Garmin record fields it doesn't recognize (undocumented in the FIT SDK). We use `patch-package` (`patches/fit-file-parser+2.3.3.patch`) to add field definitions for these undocumented record message fields:
  - field 90 (performance_condition, sint8)
  - field 99 (respiration_rate, uint8)
  - field 108 (enhanced_respiration_rate, uint16, scale 100)
  - field 116 (current_stress, uint16, scale 100)
  - field 136 (wrist_heart_rate, uint8)
  - field 137 (stamina_potential, uint16, scale 10)
  - field 138 (stamina, uint16, scale 10)
  - field 139 (core_temperature, uint16, scale 100)
  - field 140 (grade_adjusted_speed, uint32, scale 1000)
  - field 143 (body_battery, uint8)
  - field 144 (external_heart_rate, uint8)
  
  Sources: [fit-parser PR #45](https://github.com/jimmykane/fit-parser/pull/45) and [Gadgetbridge GlobalFITMessage.java](https://codeberg.org/Freeyourgadget/Gadgetbridge/src/tag/0.88.0/app/src/main/java/nodomain/freeyourgadget/gadgetbridge/service/devices/garmin/fit/GlobalFITMessage.java). The patch runs on `npm install` via the `postinstall` script. If you ever update `fit-file-parser`, check the patch still applies.

- `parseFitFile()` is **async** (returns Promise) — always `await` it
- `bind:this` variables (like chart/map containers) trigger Svelte warnings about `$state` — these are false positives, don't add `$state` to them
- ECharts `dataZoom` event fires frequently; store updates are synchronous so no throttling needed
- `store.chartAxis` controls whether the chart X-axis shows elapsed time or cumulative distance; switching axis doesn't change the underlying selection indices, only the x-axis representation
- GPS track ↔ record index mapping is approximate (fractional), not 1:1
- FIT files store position as degrees (parser handles conversion from semicircles)
- Sample files in repo root: `externalHR.fit`

## Sharing — Cloudflare Worker + R2

The share-by-link feature uses a Cloudflare Worker deployed separately from the main app.

```
worker/
├── src/index.ts       # Worker: POST /share, GET /share/:id
├── wrangler.toml      # R2 binding + CORS config
├── package.json
└── README.md           # Deployment instructions
```

**How it works:**
1. User clicks "Share" → frontend uploads FIT file (base64) + enabled fields to the worker
2. Worker stores the payload in R2 and returns a short ID (8 alphanumeric chars)
3. Recipient opens `fitgrep.app?s=<id>` → frontend detects the param, fetches the payload, parses and displays
4. The shared workout is also saved to the recipient's localStorage for easy re-access
5. Shares auto-expire after 90 days

**Configuration:**
- `VITE_SHARE_API` env var (defaults to `http://localhost:8787` for dev)
- Worker `CORS_ORIGIN` var (set to production domain in `wrangler.toml`)

**Worker commands:**
```bash
cd worker
npm install
npx wrangler r2 bucket create fitgrep-shares  # one-time bucket creation
npx wrangler dev                                 # local dev
cd .. && VITE_SHARE_API=http://localhost:8787 npm run dev  # frontend + worker together
```

**Deploy worker:**
```bash
cd worker && npx wrangler deploy
```
Then set `VITE_SHARE_API` to the worker URL (custom domain or `*.workers.dev`) for production builds.

## Commands

```bash
npm run dev      # Vite dev server on :5173
npm run build    # Production build to dist/
npm run preview  # Preview production build
npx svelte-check # Type checking
```

**Always commit and push after making changes** — the site is deployed via GitHub Pages from the repo, so changes only go live once pushed.

## GitHub Pages

Deploy workflow at `.github/workflows/deploy.yml` — builds and deploys via GitHub Actions. Source must be set to "GitHub Actions" in repo Settings → Pages.

## Testing

### Automated UI Testing (Playwright)

Run the Playwright test script at **`test-fitgrep.cjs`** for headless browser testing. It uploads a sample `.FIT` file and captures before/after screenshots while inspecting DOM changes.

```bash
cd /home/shipadmin/fitgrep
node test-fitgrep.cjs
```

See `test-fitgrep-instructions.md` for the full setup, element selectors, and workflow.

#### Lap Line Positioning Regression Test

**`test-lap-lines.cjs`** — verifies that vertical lap boundary lines are correctly positioned on the chart when the x-axis is set to Distance mode. In distance mode, lap lines should be spread across the chart at cumulative distances, not clustered at each lap's individual distance.

```bash
cd /home/shipadmin/fitgrep
node test-lap-lines.cjs
```

### Manual Verification

- `npx svelte-check` — type checking
- `npm run build` — full production build
- `node test-fitgrep.cjs` — automated UI tests (see above)
- `node test-lap-lines.cjs` — lap line positioning regression test
- Manual testing in browser: upload a .FIT file, verify chart renders, check stats table, verify GPS map, test Time/Distance axis toggle

## Future Enhancements (from PLAN.md)

- Multiple file comparison
- Export selection as CSV
- Lap-by-lap analysis
- Pace zones / HR zones overlay
- Dark/light theme toggle
- Direct brush selection on chart area (not just slider)

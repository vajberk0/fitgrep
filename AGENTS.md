# fitgrep — Agent Guide

Single-page web app for exploring Garmin `.FIT` workout files. Charts + GPS map + MIN/AVG/MAX stats with timeline selection. Frontend-only; optional Cloudflare Worker (`worker/`) powers share-by-link.

## Stack

- **Svelte 5 + TypeScript** — runes-based reactivity (`$state`, `$derived`, `$effect`)
- **Vite** build
- **`fit-file-parser`** — NOT `@garmin/fitsdk` (stream-based, unsuitable for browser). Patched via `patch-package` to recover undocumented Garmin record fields; see `patches/fit-file-parser+2.3.3.patch`. Postinstall script applies it.
- **Apache ECharts v5** (lazy-loaded)
- **Leaflet + OSM** (lazy-loaded)

## Source layout

```
src/
├── App.svelte                # root: upload ↔ data view
├── lib/
│   ├── types.ts              # DataPoint, FieldInfo, WorkoutSummary, SelectionRange, LapInfo
│   ├── fieldConfig.ts        # FIT field → label/unit/scale/color (snake_case keys!)
│   ├── parser.ts             # async parseFitFile() → WorkoutData
│   ├── stats.ts              # MIN/AVG/MAX + formatters
│   ├── store.svelte.ts       # module-level $state + getters (no context provider)
│   ├── storage.ts            # localStorage for uploaded FIT blobs
│   ├── preferences.ts        # cookie (field prefs) + localStorage (last file)
│   └── share.ts              # upload/load shared workouts via Worker
└── components/               # UploadZone, WorkoutChart, StatsPanel, GpsMap, etc.
```

## Design decisions

1. **snake_case fields.** `fit-file-parser` outputs `heart_rate`, `enhanced_speed`, etc. All lookups in `fieldConfig.ts` use snake_case.
2. **Module-level reactive store.** `store.svelte.ts` uses `$state` runes at module scope, exports an object of getters. Fine-grained reactivity, no provider.
3. **Lazy load** ECharts, Leaflet, and the parser to keep the main chunk small (~62 KB).
4. **Data-agnostic.** Fields discovered at parse time; unknown ones get humanized labels and are off by default.
5. **Scale conversion at parse time** (e.g. speed ×3.6 → km/h). Downstream code uses converted values.

## Gotchas

- `parseFitFile()` is **async** — always `await`.
- `bind:this` refs (chart/map containers) trigger spurious `$state` warnings — ignore them; don't wrap in `$state`.
- ECharts `dataZoom` fires frequently; store writes are sync so no throttling needed.
- `store.chartAxis` (`'time' | 'distance'`) changes only the x-axis representation, not the selection indices.
- GPS track ↔ record index mapping is fractional, not 1:1.
- FIT positions are semicircles; parser converts to degrees.
- Sample file: `externalHR.fit` in repo root.

## Sharing

Share-by-link uses a Cloudflare Worker + R2 bucket in `worker/`. See **`worker/README.md`** for deployment, endpoints, and local dev. Frontend points at `VITE_SHARE_API` (defaults to `http://localhost:8787`).

## Commands

```bash
npm run dev        # Vite on :5173
npm run build      # production → dist/
npx svelte-check   # types
node test-fitgrep.cjs      # Playwright UI test (upload + screenshots)
node test-lap-lines.cjs    # regression: lap mark line positioning on distance axis
```

See `test-fitgrep-instructions.md` for selectors and workflow.

## Bug-fix workflow

1. **Reproduce first.** If the user provides or references a `.fit` file, run the app with it (`npm run dev` + upload, or a Playwright test script) to confirm the bug before touching code.
2. **Fix, then re-test.** Run the same reproduction steps after the change to verify the fix. Use `test-fitgrep.cjs` / `test-lap-lines.cjs` for regression checks.
3. **Push automatically.** If tests pass, `git commit` and `git push` immediately — GitHub Pages deploys on push.

## Roadmap

See `PLAN.md`.

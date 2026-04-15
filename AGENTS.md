# fitgrep — Agent Guide

## Project Overview

Single-page web app that lets athletes upload Garmin .FIT workout files and explore performance data through interactive charts with timeline-based selection for MIN/AVG/MAX statistics. Built entirely frontend — no backend required.

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
│   └── preferences.ts           # Cookie/localStorage for field preferences & last viewed file
└── components/
    ├── UploadZone.svelte        # Drag & drop + file input, calls parser via dynamic import
    ├── StoredFiles.svelte       # Lists previously uploaded workouts from local storage
    ├── ErrorBar.svelte          # Dismissable error notifications
    ├── FieldSelector.svelte     # Toggleable chips for discovered metrics
    ├── WorkoutChart.svelte      # ECharts multi-series chart with dataZoom slider
    ├── StatsPanel.svelte        # MIN/AVG/MAX table, selection-aware
    ├── GpsMap.svelte            # Leaflet map with track + selection highlight
    └── WorkoutSummary.svelte    # Date, sport, duration, distance, elevation bar
```

## Key Design Decisions

1. **Field names are snake_case** — `fit-file-parser` outputs `heart_rate`, `enhanced_speed`, etc. NOT camelCase. All field lookups in `fieldConfig.ts` use snake_case keys.

2. **Store pattern** — `store.svelte.ts` uses Svelte 5 `$state` runes at module level, exported as an object with getters. This gives fine-grained reactivity without a context provider.

3. **Lazy loading** — ECharts, Leaflet, and the parser are all dynamically imported to keep the initial bundle small (~62KB main chunk).

4. **Data-agnostic** — Fields are discovered at parse time from FIT record messages. Unknown fields get humanized labels and are disabled by default.

5. **Scale conversion** happens at parse time in `parser.ts` (e.g., speed ×3.6 for km/h). Chart and stats work with already-converted values.

## Important Gotchas

- **fit-file-parser patch**: The library silently drops Garmin record fields it doesn't recognize (undocumented in the FIT SDK). We use `patch-package` (`patches/fit-file-parser+2.3.3.patch`) to add field definitions for: field 108 (respiration_rate, uint16, scale 100), field 136 (wrist_heart_rate, uint16), field 144 (external_heart_rate, uint8). The patch runs on `npm install` via the `postinstall` script. If you ever update `fit-file-parser`, check the patch still applies.

- `parseFitFile()` is **async** (returns Promise) — always `await` it
- `bind:this` variables (like chart/map containers) trigger Svelte warnings about `$state` — these are false positives, don't add `$state` to them
- ECharts `dataZoom` event fires frequently; store updates are synchronous so no throttling needed
- GPS track ↔ record index mapping is approximate (fractional), not 1:1
- FIT files store position as degrees (parser handles conversion from semicircles)
- Sample files in repo root: `externalHR.fit`

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

## Future Enhancements (from PLAN.md)

- Multiple file comparison
- Export selection as CSV
- Lap-by-lap analysis
- Pace zones / HR zones overlay
- Dark/light theme toggle
- Direct brush selection on chart area (not just slider)

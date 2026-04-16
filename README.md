# fitgrep

Upload your Garmin `.FIT` workout files and explore every metric — heart rate, pace, power, cadence, elevation, GPS track — through interactive charts with timeline-based selection for MIN/AVG/MAX statistics.

**Try it live:** [fitgrep on GitHub Pages](https://vajberk0.github.io/fitgrep/)

No account, no backend, no data leaves your browser.

---

## Features

- **Drag & drop upload** — drop any Garmin `.FIT` file and start exploring instantly
- **Auto-discovered metrics** — all record fields in the file are detected and shown as toggleable chips (heart rate, speed, pace, power, cadence, elevation, temperature, and more)
- **Interactive multi-series charts** — Apache ECharts with a data-zoom slider for scrubbing through your workout, with a **Time/Distance toggle** to switch the X-axis between elapsed time and cumulative distance
- **Selection-aware stats** — select any time or distance range on the chart and get live MIN / AVG / MAX for every active metric
- **GPS map** — Leaflet + OpenStreetMap track overlay with highlighted selection segment
- **Workout summary** — date, sport, duration, distance, and elevation gain/loss at a glance
- **Fully client-side** — zero server dependency, all parsing and rendering happens in-browser

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Svelte 5 + TypeScript (runes) |
| Build | Vite |
| FIT Parsing | [fit-file-parser](https://www.npmjs.com/package/fit-file-parser) with `patch-package` for undocumented Garmin fields |
| Charts | Apache ECharts v5 (lazy-loaded) |
| Maps | Leaflet + OpenStreetMap (lazy-loaded) |
| Styling | CSS variables + Svelte scoped styles |

## Getting Started

```bash
# Clone the repo
git clone https://github.com/vajberk0/fitgrep.git
cd fitgrep

# Install dependencies (this also applies the fit-file-parser patch)
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and drop a `.FIT` file onto the upload zone.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server on `:5173` |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run check` | Run `svelte-check` + TypeScript type checking |

## How It Works

1. **Upload** — you drop a `.FIT` file (or pick one via the file input)
2. **Parse** — `fit-file-parser` reads binary FIT records into structured JavaScript objects. Scale conversions (e.g. speed → km/h) happen here
3. **Discover** — all detected metrics are presented as toggleable field chips; unknown fields get auto-generated labels and are off by default
4. **Explore** — multi-series ECharts chart with a Time/Distance toggle and a data-zoom slider for scrubbing through your workout. Drag to select any sub-range.
5. **Stats** — the stats panel and GPS map update in real time as you adjust the selection

## fit-file-parser Patch

The `fit-file-parser` library silently drops Garmin record fields it doesn't recognize. We maintain a `patch-package` patch (`patches/fit-file-parser+2.3.3.patch`) that adds definitions for:

- **Field 108** — `respiration_rate` (uint16, scale 100)
- **Field 136** — `wrist_heart_rate` (uint16)
- **Field 144** — `external_heart_rate` (uint8)

The patch is applied automatically on `npm install` via the `postinstall` script. If you upgrade `fit-file-parser`, verify the patch still applies.

## Deployment

The site deploys to GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`). Pushes to the main branch trigger a build and deploy. Make sure the repo's Pages source is set to **GitHub Actions** in Settings → Pages.

## License

MIT

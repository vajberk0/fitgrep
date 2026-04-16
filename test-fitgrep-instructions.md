# Testing fitgrep (Workout Analyzer) with Playwright

## Prerequisites

- Node.js 24+ installed
- Playwright Chromium browser installed

Playwright is already included as a dev dependency. Install the browser should be installed also, if not:

```bash
cd /home/shipadmin/fitgrep
npx playwright install chromium
```

## Running the Test

The test script at `test-fitgrep.cjs` is the canonical end-to-end test. It uploads the sample `externalHR.fit` file and verifies the full rendering pipeline.

```bash
cd /home/shipadmin/fitgrep
node test-fitgrep.cjs
```

### What the test does

1. Launches headless Chromium and navigates to `https://fitgrep.je.mk/`
2. Takes a **before screenshot** (`fitgrep-before.png`) of the upload screen
3. Dumps all clickable elements to the console for debugging
4. Uploads `externalHR.fit` via the hidden `<input type="file">`
5. Waits 5 seconds for parsing + lazy-loaded ECharts + Leaflet rendering
6. Takes an **after screenshot** (`fitgrep-after.png`) of the full data view
7. Inspects and logs:
   - Total DOM element count
   - Canvas count (ECharts chart)
   - Map presence (Leaflet)
   - Stats panel and summary bar presence
   - Upload zone visibility (should be `false` after upload)
   - Workout summary details (date, sport, duration, laps, distance, elevation)
   - Stats table content (MIN/AVG/MAX for each metric)
   - Chart canvas dimensions

### Output files

| File | Description |
|---|---|
| `fitgrep-before.png` | Upload screen before file upload |
| `fitgrep-after.png` | Full data view after file upload |

## Inspecting Results

After running, check the console output for:

- **`[PAGE ERROR]`** lines — any JavaScript errors from the app
- **`[CONSOLE error]`** lines — unhandled console errors
- **DOM element count** — upload screen ≈ 30 elements, post-upload ≈ 240+
- **State flags** — `hasCharts: true`, `hasMap: true`, `hasStats: true`, `hasSummary: true`, `hasUploadZone: false`

Then compare the two screenshots visually to verify the expected rendering.

## Extending the Test

To add new test scenarios, edit `test-fitgrep.cjs`. Key patterns:

### Uploading a different file

```javascript
const FIT_FILE = path.join(__dirname, 'your-file.fit');
```

### Testing a specific UI interaction

```javascript
// Click a metric chip to toggle it
const chip = await page.$('.chip.enabled');
if (chip) await chip.click();
await page.waitForTimeout(1000);

// Click "New File" to reset
const newFileBtn = await page.$('text="New File"');
if (newFileBtn) await newFileBtn.click();
await page.waitForTimeout(3000);
```

### Dumping all clickable elements (for debugging)

```javascript
const clickable = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button, [role="button"], input, a'))
    .map(el => ({
      tag: el.tagName,
      text: (el.textContent || '').trim().substring(0, 100),
      class: el.className?.substring(0, 80),
      type: el.type || null,
    }));
});
console.log(clickable);
```

## Common UI Elements & Selectors

| Area | Selector / Class | Purpose |
|---|---|---|
| Upload zone | `input[type="file"]` | Hidden file input (use `setInputFiles()`) |
| Upload zone (visual) | `.upload-zone` | Drop zone / browse button (disappears after upload) |
| Summary bar | `.summary-bar` | Date, sport, duration, laps, distance, elevation |
| Summary items | `.summary-item`, `.summary-label`, `.summary-value` | Individual summary fields |
| Metrics toggles | `.chip`, `.chip.enabled` | Toggle metrics on/off (colored pill buttons) |
| Chip color | `--chip-color` CSS variable | Per-metric color on `.chip` |
| Chart canvas | `canvas` | ECharts multi-series chart |
| Stats panel | `.stats-panel` | MIN/AVG/MAX statistics table |
| Stats header | `.stats-header`, `.stats-title`, `.stats-range` | Stats panel header with time range |
| Stats table | `.stats-table` | Stats data table (metric + MIN/AVG/MAX columns) |
| GPS map | `.leaflet-container` | Leaflet map with workout track |
| Share button | `text="Share"` | Share-by-link modal |
| New File button | `text="New File"` | Reset to upload screen |

## Typical Workflow After Code Changes

1. **Run the test** — `node test-fitgrep.cjs`
2. **Check console** — look for `[PAGE ERROR]` or unexpected warnings
3. **Verify DOM** — check `totalElements` (≈248 post-upload) and state flags
4. **Check screenshots** — `fitgrep-before.png` and `fitgrep-after.png`
5. **If something broke**, narrow the test to just the affected feature

## Tips

- **File upload**: Use `fileInput.setInputFiles()` — the upload zone is a styled div, the real input is hidden
- **Wait times**: `waitForTimeout(5000)` gives the parser + ECharts + Leaflet time to render. Increase if needed for large files.
- The app uses **Svelte 5** with `$state` runes — state changes are reactive
- The app uses **ECharts** for charts and **Leaflet** for maps — both lazy-loaded (loaded on first use)
- DOM element count is a good quick sanity check (upload screen ≈ 30 elements, post-upload ≈ 240+)
- The upload zone disappears after a file is loaded — `hasUploadZone: false` confirms full render
- The summary bar shows: Date, Sport, Duration, Laps, Distance, Elevation Gain
- The stats table shows MIN/AVG/MAX for each enabled metric
- Lap markers appear as vertical dashed lines on the chart and as pill buttons below it
- The GPS map shows the track with a colored line (red = high heart rate)

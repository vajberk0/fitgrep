# fitgrep Workout Analyzer - Implementation Plan

## 1. Concept & Vision

A sleek, single-page web application that lets athletes upload their Garmin .FIT workout files and instantly explore their performance data through interactive charts. The core differentiator: **intuitive timeline selection** that lets users brush across any portion of their workout to instantly see MIN/AVG/MAX statistics for that specific period. Built entirely frontend—no backend required—while still feeling responsive even with large workout files.

The app is **data-agnostic**: it doesn't assume which metrics are present. Instead, it dynamically discovers all numeric fields in the FIT file's record messages and presents them as togglable series on a single unified chart with time on the X-axis.

**Personality**: Clean, data-focused, athletic. Think Garmin Connect meets modern web analytics tools.

---

## 2. Technical Stack

| Component | Technology | Justification |
|-----------|------------|---------------|
| **Framework** | **Svelte 5 + TypeScript** | Reactive UI, compiled output, minimal boilerplate |
| **Build Tool** | **Vite** | Fast dev server, optimized builds, native ESM |
| **FIT Parsing** | `@garmin/fitsdk` | Official Garmin SDK, browser-compatible |
| **Alternative Parser** | `fit-file-parser` | More browser-friendly, easier API |
| **Charting** | Apache ECharts | Best brush/selection support, performant, MIT license |
| **Styling** | CSS Variables + Svelte scoped styles | Component-scoped CSS with global variables |
| **Map Visualization** | Leaflet + OpenStreetMap | Free, lightweight map tiles for GPS track display |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        fitgrep                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Upload Zone (collapses after file load)    │   │
│  │              "Drop your .FIT file here"                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Data Field Selector                        │   │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │   │
│  │  │ ✓ HR│ │ ✓ SPD│ │ ✓ CAD│ │ ○ ALT│ │ ○ PWR│ │ ... │      │   │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │   │
│  │  (auto-discovered from FIT file, toggleable chips)      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Interactive Chart                     │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │   Y-axis 1 (left) │   Y-axis 2 (right, optional)   │ │   │
│  │  │   ───────────────────────────────────────────────  │ │   │
│  │  │   Heart Rate  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓               │ │   │
│  │  │   Speed       ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓                │ │   │
│  │  │   Cadence     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │ │   │
│  │  │   Altitude    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓              │ │   │
│  │  │                                                       │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  │  X-axis: Time or Distance (user toggle)                 │   │
│  │  ┌─────────────────────────────────────────────────────┐ │   │
│  │  │          Distance/Time Selection Brush / Scrubber    │ │   │
│  │  │  |←━━━━━━━━━━━━━━━━━━━━━━━━━━━→|  (draggable)        │ │   │
│  │  └─────────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Selection Stats Panel                       │   │
│  │  ┌───────────┬───────────┬───────────┬──────────────┐  │   │
│  │  │  FIELD    │   MIN     │   AVG     │   MAX        │  │   │
│  │  ├───────────┼───────────┼───────────┼──────────────┤  │   │
│  │  │ Heart Rate│   128     │   155     │   172        │  │   │
│  │  │ Speed     │   8.2     │   16.8    │   24.5 km/h  │  │   │
│  │  │ Cadence   │   78      │   87      │   96 rpm     │  │   │
│  │  │ Altitude  │   245     │   278     │   312 m      │  │   │
│  │  └───────────┴───────────┴───────────┴──────────────┘  │   │
│  │  Selection: 10:00 - 25:00 (15:00 duration)              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Workout Summary (read-only)                  │   │
│  │  Date: Nov 25, 2024  •  Sport: Running  •  Duration: 1h  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Core Features

### 4.1 File Upload
- **Drag & drop zone** with visual feedback
- **File input fallback** for traditional selection
- **Validation**: Check for valid .fit files before parsing
- **Error handling**: Display user-friendly messages for corrupted/invalid files

### 4.2 FIT File Parsing
- **Library**: `@garmin/fitsdk` or `fit-file-parser`
- **Process**:
  1. Read file as ArrayBuffer via FileReader
  2. Decode FIT binary data
  3. Extract Record messages (time series data) — these contain all sensor readings
  4. Extract Session/Lap messages (summary data)
  5. **Dynamically discover all numeric fields** present in Record messages
  6. Transform into chart-ready format
- **Field Discovery**: Iterate through all Record messages to build a list of unique field names that contain numeric data. Not all FIT files have the same fields — a run might have heart rate, cadence, and altitude, while a bike ride might have power and left-right balance.
- **Performance**: Use Web Worker for files > 5MB

### 4.3 Data Field Selector
- **Dynamic Discovery**: After parsing, scan all Record fields to find numeric columns (e.g., `heartRate`, `speed`, `cadence`, `altitude`, `power`, `temperature`, `leftRightBalance`, `verticalOscillation`, etc.)
- **Toggle Chips**: Each discovered field appears as a toggleable chip/tag
  - **Enabled by default**: Fields with known significance (heartRate, speed, cadence, altitude)
  - **User can enable/disable any field**
  - Visual indicator: enabled (solid/filled), disabled (outlined/greyed)
- **Field Labeling**: Use FIT Profile field names, humanized (e.g., `leftPedalStroke` → "Left Pedal Stroke")
- **Unit Display**: Show units from FIT Profile in chip labels

### 4.4 Unified Chart
- **Primary Library**: Apache ECharts v5
- **Single chart, multiple series**: All enabled fields rendered as separate line series on the same chart
- **X-axis**: Time (elapsed seconds) or Distance (cumulative meters) — user toggle. Distance mode is only available when the FIT file contains distance data.
- **Y-axis**: 
  - **Left Y-axis**: Primary metrics (first enabled field or user-selected)
  - **Right Y-axis**: If fields have very different scales, offer dual Y-axis option
  - **Alternative**: Auto-scale each series independently using `yAxis.type: 'value'` with individual `min`/`max` per series
- **Line rendering**: Each series gets a distinct color from a curated palette; hover tooltip shows all values at that timestamp
- **Performance**: Use ECharts `sampling: 'lttb'` (Largest-Triangle-Three-Buckets) for decimation on large datasets
- **Interactivity**:
  - Zoom (mouse wheel / pinch)
  - Pan (click + drag)
  - Tooltip on hover showing all series values at that time point

### 4.5 Timeline Selection (Critical Feature)
- **Brush Component**: ECharts dataZoom with slider type (bottom of chart)
- **Behavior**:
  1. User drags handles on timeline scrubber
  2. Selection range updates in real-time
  3. Stats panel recalculates MIN/AVG/MAX for the selected time window only
  4. Chart shows the full dataset, with the selected window highlighted
- **Range Display**: Show start time, end time, and duration of selection in stats panel
- **Full dataset always visible**: The chart always shows the entire workout; selection just defines the analysis window

### 4.6 Statistics Panel
- **Display**: Grid showing MIN / AVG / MAX for each **currently enabled** field
- **Dynamic columns**: Panel columns update based on which fields are toggled on/off
- **Metrics**: All numeric fields from the FIT file (auto-discovered)
- **Selection-aware**: Stats are recalculated for the selected time range whenever the user adjusts the brush
- **Total Stats**: Displayed above or below the stats grid: Distance, Duration, Avg Speed, Max Speed, Elevation Gain

### 4.7 GPS Track Visualization
- **Library**: Leaflet.js with OpenStreetMap tiles
- **Display**: Polyline showing workout path
- **Sync**: Highlight corresponding section when selection is made on chart
- **Performance**: Use Canvas renderer for large tracks

### 4.8 Field Labeling + Units
- FIT files store fields by their profile numeric IDs
- Use a lookup table (`FIELD_CONFIG`) to map field names to human-readable labels with units
- Apply scale conversions: Speed (m/s → km/h), Distance (m → km), etc.
- Unknown fields are auto-added with humanized names, disabled by default

---

## 5. Performance Considerations

| Concern | Solution |
|---------|----------|
| Large files (>10MB) | Web Worker for parsing |
| Many data points (>50k) | ECharts data sampling/decimation |
| Smooth brush interaction | Throttle updates to 60fps |
| Memory usage | Process in chunks, garbage collect parsed data |

### Performance Targets
- File load + parse < 2 seconds for typical workout (1MB file)
- Brush interaction: < 16ms response time (60fps)
- Initial render: < 500ms

---

## 6. User Experience Details

### 6.1 Empty State
- Centered upload zone with dashed border
- Icon + "Drop your .FIT file here or click to browse"
- Supported formats listed

### 6.2 Loading State
- Progress indicator during parse
- "Analyzing workout data..." message

### 6.3 Error States
- Invalid file: "This doesn't look like a valid FIT file"
- Parse error: "Could not read this workout file"
- No data: "No record data found in this file"

### 6.4 Responsive Design
- Desktop: Full layout with side-by-side stats
- Tablet: Stacked layout
- Mobile: Simplified single-chart view with collapsible stats

---

## 7. Future Enhancements (Post-MVP)

- [ ] Multiple file comparison view
- [ ] Export selection as CSV
- [ ] Lap-by-lap analysis
- [ ] Pace zones visualization
- [ ] Heart rate zones overlay
- [ ] Workout difficulty score
- [ ] Dark/light theme toggle
- [ ] Local storage for recent workouts
- [ ] Drag selection directly on chart (brush on chart area)

---

## 8. Implementation Phases

### Phase 1: Project Setup
- [ ] Initialize Vite + Svelte + TypeScript project
- [ ] Install dependencies: echarts, @garmin/fitsdk
- [ ] Configure TypeScript paths
- [ ] Set up global CSS variables and base styles
- [ ] Create type definitions (FitRecord, WorkoutData, FieldInfo)

### Phase 2: Data Layer
- [ ] Implement FIT parser 
- [ ] Field discovery: scan Record messages, build field list
- [ ] Create field config with labels, units, scales
- [ ] Implement stats calculation utility
- [ ] Set up Svelte 5 state store with `$state` runes

### Phase 3: Upload + Field Selector
- [ ] Build `UploadZone.svelte` component
- [ ] Drag & drop handling with FileReader
- [ ] Build `FieldSelector.svelte` with toggleable chips
- [ ] Connect to store: update `availableFields` and `enabledFields`

### Phase 4: Chart Component
- [x] Build `WorkoutChart.svelte` with ECharts
- [x] Dynamic series generation from `enabledFields`
- [x] Time (elapsed) X-axis formatting
- [x] Multi-series line chart with shared time axis
- [x] Tooltip showing all series values at cursor
- [x] ECharts `sampling: 'lttb'` for large datasets
- [x] Time/Distance axis toggle for X-axis (switches between elapsed time and cumulative distance)

### Phase 5: Selection + Stats
- [ ] ECharts dataZoom slider (bottom of chart)
- [ ] Selection range tracking via `dataZoom` event
- [ ] Build `StatsPanel.svelte` component
- [ ] Stats recalculation for selected time window
- [ ] Selection duration display

### Phase 6: Polish
- [ ] Loading states (parsing in progress indicator)
- [ ] Error handling (invalid file, empty data, parse errors)
- [ ] Empty state / no-data states
- [ ] Responsive design (desktop/tablet/mobile)
- [ ] Build `WorkoutSummary.svelte` (date, sport, duration)
- [ ] GPS map visualization (Leaflet)

### Phase 7: Enhancements
- [ ] Performance optimization (Web Worker for >5MB files)
- [ ] Export stats as CSV
- [ ] Dark/light theme toggle
- [x] Time/Distance axis toggle on X-axis (implemented in Phase 4)

---

## 9. References

- [Svelte 5 Docs](https://svelte.dev/docs/svelte/)
- [Svelte 5 Runes](https://svelte.dev/docs/svelte/Svelte/)
- [Vite](https://vitejs.dev/)
- [Garmin FIT JavaScript SDK](https://github.com/garmin/fit-javascript-sdk)
- [@garmin/fitsdk npm](https://www.npmjs.com/package/@garmin/fitsdk)
- [Apache ECharts](https://echarts.apache.org/)
- [ECharts DataZoom](https://echarts.apache.org/en/option.html#dataZoom)
- [Leaflet.js](https://leafletjs.com/)
- [MDN: Reading files](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)

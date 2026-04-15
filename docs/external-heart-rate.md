# External Heart Rate Support

## Background

When using a Garmin watch with an external heart rate monitor (chest strap like HRM-Pro, HRM-Dual, etc.), the watch can record **multiple HR streams** simultaneously in the same FIT file:

| Field | Source | When present |
|---|---|---|
| `heart_rate` (field 3) | The "active" HR used by the watch | Always (if any HR source is available) |
| `external_heart_rate` (field 144) | Chest strap / ANT+ HR sensor | Whenever an external HRM is connected |
| `wrist_heart_rate` (field 136) | Optical sensor on the watch | When source switching is enabled |

With **dynamic source switching** enabled, all three are recorded — the watch picks the best source for `heart_rate` on a per-second basis (usually the chest strap, but it can fall back to optical if the strap reports poor signal quality).

## The Problem

Fields 108, 136, and 144 are **undocumented** in the official Garmin FIT SDK (`Profile.xlsx`). The `fit-file-parser` library only decodes fields it has definitions for — unknown fields are silently dropped during parsing. This means `external_heart_rate` and `wrist_heart_rate` were completely invisible in the app.

## The Fix

### Patching `fit-file-parser`

We add the missing field definitions directly into the parser's internal message table (`FIT.messages[20]`, the record message). This is done via `patch-package` so it persists across reinstalls:

```
patches/fit-file-parser+2.3.3.patch
```

Three fields are added to the record message definition:

| Field # | Name | Type | Scale | Units | Description |
|---|---|---|---|---|---|
| 108 | `respiration_rate` | uint16 | 100 | brpm | Breaths per minute (from HRM-Pro/600) |
| 136 | `wrist_heart_rate` | uint16 | — | bpm | Optical HR from watch sensor |
| 144 | `external_heart_rate` | uint8 | — | bpm | HR from chest strap / ANT+ sensor |

The patch modifies both `dist/fit.js` (ESM, used in production builds) and `dist/cjs/fit.js` (CJS, used in Node/dev).

### Field configuration

In `src/lib/fieldConfig.ts`, the new metrics are registered:

```ts
external_heart_rate: { label: 'External HR', unit: 'bpm', scale: 1, defaultEnabled: true, color: '#ff6b6b' },
wrist_heart_rate:   { label: 'Wrist HR',     unit: 'bpm', scale: 1, defaultEnabled: true, color: '#ffa07a' },
respiration_rate:   { label: 'Respiration Rate', unit: 'brpm', scale: 1, defaultEnabled: false },
```

- **External HR** and **Wrist HR** are enabled by default since they're directly comparable to the main Heart Rate metric.
- **Respiration Rate** is off by default (opt-in via the field selector chips).

No changes were needed in the parser logic — the existing field discovery system (`parser.ts`) automatically picks up new fields from parsed records, builds `FieldInfo` entries, and includes them in charts and stats.

## How it appears in the app

When a FIT file contains external HR data:

1. **Field Selector** shows "External HR" and "Respiration Rate" chips (and "Wrist HR" if present)
2. **Chart** renders them as additional colored lines alongside the main Heart Rate
3. **Stats Panel** shows MIN/AVG/MAX for each metric, selection-aware
4. **GPS Map** is unaffected

If the file doesn't contain these fields (e.g., no chest strap paired, or older watch), they simply don't appear — the app remains data-agnostic.

## Source references

The field number mappings were identified from:

- **GoldenCheetah** (`FitRideFile.cpp`): `case 136: // Wrist HR`, `case 144: // External HR`, `case 108: // RespirationRate`
- **Garmin Forums**: User reports confirming field behavior with source switching on/off, and that field 144 = external HR, field 136 = wrist HR
- **FIT File Viewer** (fitfileviewer.com): Displays these as "external heart rate" and "wrist heart rate" in chart view
- **Binary analysis**: Parsing `externalHR.fit` at the byte level confirmed the record mesg definition includes fields 108, 136, and 144

## Testing

Sample file: `externalHR.fit` — a 5.6 km run recorded with Garmin Forerunner 255 + HRM-Pro chest strap. Contains:
- `heart_rate` (active HR)
- `external_heart_rate` (from HRM-Pro)
- `respiration_rate` (from HRM-Pro)
- No `wrist_heart_rate` (source switching was off for this activity)

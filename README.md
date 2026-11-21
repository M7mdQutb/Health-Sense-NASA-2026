# HealthSense — Astronaut Digital Twin (all 6 tasks, integrated)
Plain HTML + CSS + JS (no build, no backend, works offline). Palette: Rich Cyan `#2E5268`, Light Jade `#92C1AD`, Pale Jade `#C7E8DF`, Icy Teal `#EBFDFD`, navy `#263B57`, page `#171B24` — all in `css/tokens.css` (the only file with raw colours).

## Run
    python serve.py --fetch     # once: saves three.js r128 into vendor/ (needed for the 3D body; works offline afterwards)
    python serve.py             # open http://localhost:8000
Without three.js/WebGL the app automatically shows a 2D schematic body (same clicks, colours, markers).

## Where things live (00 §3, one task per folder)
| Folder | Task | Exports |
|---|---|---|
| `js/core` | 1 | `Core = { C, store, bus, actions, helpers, sim, loaders }` (12 slices, contract events) |
| `js/twin` | 2 | `Twin.create()` (3D), `TwinFallback.create()` (2D) — `setRegionColors / setMarkers / focusRegion / resetView / setAutonomous …` |
| `js/layers` | 3 | `Layers.compute(system) / paint(twin) / reasonFor / start / finish` — colours, reasons, countermeasure catalogue |
| `js/logging` | 4 | `Logging.log / undo / triage / triageAll / framing / handoff` — `js/logging/rules.js` = triage rules as data |
| `js/gamification` | 5 | `Gamification.syncRestCycle / completeCheckin / logNutrition` — XP, levels, skill tree, badges, crew goal |
| `js/ui`, `css/` | 6 | tokens, HUD shell, region card, cabin rings, alerts, provenance |
| `js/app.js` | — | the only file that wires everything |

`tools/build_models.py` rebuilds `data/body_data.js` from the three OBJ files (not included here, 57 MB): put them in `models/` and run it.

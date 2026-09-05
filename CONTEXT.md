# CONTEXT.md — Matsubara Town

Fast orientation for a new session. **Read this first**, then:

| Document | What it is for |
| --- | --- |
| `CONTEXT.md` (this file) | where the project stands, how to run and verify it, what is open |
| `PROJECT_DESIGN.md` | the design rules the game must obey — the *why* |
| `CURRENT_STATE.md` | feature-by-feature implementation state — the *what is built* |
| `README.md` | player- and teacher-facing manual |

---

## What this is

A 3D browser game for Japanese elementary English classes, Three.js + Vite,
no backend, no login, no downloaded assets. Target hardware is a school
Chromebook at 1366×768. Three phases, each driven by the child's own English:

| Phase | The child says | Their English causes |
| --- | --- | --- |
| 1 · Build | *We have a stadium in Matsubara.* | the building appears |
| 2 · Script | *We can watch soccer in the stadium.* | sentence + voice are recorded |
| 3 · Guide | — | their avatar tours visitors, speaking in their own voice |

`BUILD_TARGET = 10` (`src/config/lessons.js`) out of a pool of 33 active places.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # -> dist/
npm run preview
```

**Chrome or Edge only.** The Web Speech API does not exist in Firefox or
Safari at all — the game detects this, says so, and falls back to typing.
Recognition also needs an internet connection (Chrome uploads audio).

### URL flags

| Flag | Effect |
| --- | --- |
| `?dev=1` | exposes `window.game` and enables the debug keys below |
| `?skipIntro=1` | bypasses the ~16s Osaka-ben opening scene |
| `?target=N` | overrides `BUILD_TARGET` for a short test run |
| `?city=NAME` | renames the town |
| `?owner=NAME` | pre-fills the player name field |

Typical QA URL: `http://localhost:5173/?dev=1&skipIntro=1`

### Debug keys (require `?dev=1`)

| Key | Effect |
| --- | --- |
| **shift+B** | skip speaking — picks the first card, or accepts the sentence (works while the mic is listening too) |
| **shift+U** | unlock every place, then re-deal so the full pool is visible immediately |
| **shift+R** | reset progression back to the starting 20 |

They are keyed off `event.code` + `shiftKey`, so they do not depend on case or
keyboard layout, and they are ignored while typing in a text field.

---

## Where things live

```
src/
  main.js       phase state machine, DEV flags, wiring
  config/       lessons (BUILD_TARGET, phrases) · town (ALL layout data) ·
                landmarks (35-entry registry) · activities · progression
  core/         tween · rng (seeded) · materials (shared PALETTE)
  world/        terrain · roads · graph · scenery (Occupancy) · sky · props ·
                characters
  buildings/    index (asset priority + lot selection) · procedural (original 8)
                · extras
  systems/      cameraRig · speech · recorder · construction · openingScene ·
                pedestrians · vehicles · particles · audio · choices · tour ·
                tourRecords · guidedTour · portrait · activities · finale ·
                explore · progression · unlockReveal
  ui/           hud
.ai/            delegation briefs, results, backups, QA scripts (not shipped)
qa-evidence/    screenshots and audit output per round
```

### The two files that decide the town's shape

- **`src/config/town.js`** — every coordinate: `WORLD`, `LANDMARK_SIZE_CLASSES`,
  `ROAD_SEGMENTS`, `LANDMARK_LOTS`, `PADDY_FIELDS`, `CHANNELS`, `RAILWAY`,
  `CAMERA`. Designers can reshape the town here without touching game logic.
- **`src/config/landmarks.js`** — 35 entries, 33 active (`cityHall` and `post`
  are `retired: true` and excluded from `ALL_TYPES`). Asset priority per
  landmark is **`factory` → `model` (GLB) → `fallback`**, which is what makes
  every building drop-in replaceable by a real GLB later.

### Build order matters (`src/world/index.js`)

```js
const graph = buildRoadGraph();
const occ = new Occupancy(graph);   // rail corridor reserved first
createTerrain(scene);
createLotDressings(scene, rng, occ);
createPaddies(scene, rng, occ);     // reserves its committed plots
createChannels(scene);
createRoads(scene, graph);
createScenery(scene, rng, graph, occ);
createTreeScatter(scene, rng, occ, 620);
```

Each pass reserves what it commits in the shared `Occupancy` map, so later
passes cannot drop trees or houses into paddies or lots. Reordering these
calls silently changes what gets placed — it is not cosmetic.

### Size classes

Four classes, centralized in `town.js`. `envelope` is the usable local area a
landmark builder gets; `plot` is the envelope plus a 2 m perimeter band for the
sidewalk that appears when the lot is developed.

| Class | envelope | plot |
| --- | --- | --- |
| small | 16 × 14 | 20 × 18 |
| medium | 22 × 18 | 26 × 22 |
| large | 28 × 24 | 32 × 28 |
| xl | 38 × 28 | 42 × 32 |

Only `station` and `stadium` keep fixed parcels. There is **no**
`LOT_EXCLUSIONS`, `excludedTypes`, or `minLotSize` any more — placement checks
`sizeClass`, semantic zone, reservations and occupancy independently. Do not
reintroduce per-type exclusion lists.

---

## Current measured state

Live figures, taken from the running game (`.ai/audit-round8-live.mjs`), not
from a static harness:

| Metric | Value |
| --- | ---: |
| `WORLD` size / flatRadius / hillRadius | 290 / 136 / 150 |
| Landmark parcels | 17 |
| Buildings flush with the pavement | 15 of 17 (gap 0.00) |
| Off-parallel to their street | 0 degrees, all 17 |
| Buildings intruding on a carriageway | 0 |
| Pedestrian jumps per 30 s at full load | 0 |
| Road segments | 41 |
| Houses + shops placed | 37 |
| Paddy fields placed | 9 / 9 authored |
| Paddy plots committed / child meshes | 25 / 126 |
| Active landmark types | 33 (of 35 registry entries) |
| `npm run build` | PASS |
| Console errors, full playthrough | 0 |

`WORLD` has moved several times: `230/88/124` originally → `250/100/136`
(round 6) → `310/132/151` (round 7, undisclosed) → `290/136/150` (round 8).
If it changes again, it should be stated and justified, not drifted.

---

## How this project gets verified

The habit that has caught the most bugs here is **measuring the live game
rather than trusting a report or eyeballing a screenshot.** Two of the worst
regressions (three-buildings-left, and an 11-second traffic deadlock) were
reported as passing by their own harnesses.

- Instrument the **actual game**, not a parallel scene built by the test.
  `?dev=1` exposes `window.game`; walk `game.scene`, `game.world.graph`,
  `game.world.sceneryStats` from Playwright.
- Track agents **by object identity** over time, not by sampling counts.
- Attribute stalls **by cause** (`userData.yielding`, `motionState`), so a fix
  can be shown to address the real one.
- Use `rig.beginCinematic()` before moving a QA camera — otherwise the
  `OrbitControls` polar/distance clamps fight the placement and the capture
  lies about what the scene looks like.

Existing scripts in `.ai/` (`audit-round8-live.mjs`, `verify-*.mjs`,
`capture-*.mjs`) run against a dev server on an explicit port, e.g.

```bash
npx vite --port 4191 --strictPort &
node .ai/audit-round8-live.mjs 4191
```

### Traps that have produced false alarms

- **Clamped delta time.** The loop uses `Math.min(0.05, clock.getDelta())`, so
  under software rendering simulated time runs several times slower than the
  wall clock. Any timeout measured in `dt` stretches accordingly — this was the
  actual cause of the traffic deadlock. Safety watchdogs must use wall-clock
  time.
- **Capturing during a fade.** Panels fade in over ~0.3 s; a screenshot taken
  immediately looks washed out and is not a bug.
- **The GLB probe console error.** Landmarks whose asset priority ends at
  `fallback` deliberately probe for a missing GLB. That one error is by design.

---

## Open items

**Known gaps** (unchanged, and acceptable):

- Real-voice lip sync is unverified — capture and playback were only tested
  with Chromium's synthetic microphone.
- Chromebook performance is unmeasured. The budget work is done (four draw
  calls for all roads, instanced trees, pooled agents, capped pixel ratio, one
  automatic quality drop) but nobody has run it on the real hardware.
- Speech needs Chrome/Edge plus an internet connection; everything else types.

**Deliberately held back:**

- Landmark activity animations exist (`systems/activities.js`, 13
  parameterised handlers) and are **not** triggered in phase 2 or 3. This is a
  design decision, not an omission — see `PROJECT_DESIGN.md` §6. The registry
  data and the trigger call site are already in place for a later pass.

**Not yet done:**

- Round 8 changed `src/config/town.js` only and fixed the paddy regression, but
  the wider round-8 verification set (landmark bounds, parcel overlap,
  randomized dead-end runs, railway corridor) has not been re-run since the
  paddies and country lanes moved. Build and a clean playthrough do pass.
- Everything since `d5c4e48` is **uncommitted** — roughly two dozen modified
  files plus `src/systems/openingScene.js` as a new file. There is no
  checkpoint between the baseline and now.

---

## Working agreements

- **Codex implements, Claude plans and reviews.** Briefs are written to
  `.ai/codex-task-N.md`, results land in `.ai/codex-result-N.md`. Before
  sending a round, snapshot the tree to `.ai/pre-roundN-backup/`. Two rounds
  have died mid-edit on credit exhaustion and left the tree unbuildable; the
  backup is what made those recoverable.
- **Diagnose before editing.** A speculative fix to the paddy road-clearance
  cost a round and had to be reverted. Reconstructing the placement test per
  plot found the real cause (parcel-rect overlap) in one pass.
- **Never `git checkout <file>` to undo recent work** — the only commit is the
  pre-everything baseline, so it reverts far further back than intended.
  Restore from `.ai/pre-roundN-backup/` instead.
- **Bash here has an ~8 KB command limit.** Write large files in chunks.
- Leave `CURRENT_STATE.md` for Claude to maintain; briefs tell Codex not to
  touch it.
- Don't let scale creep: the town must stay semi-rural Matsubara — irregular
  streets, country lanes, rice fields, low-density edges — not a regular
  American grid. Round 6 produced exactly that grid and had to be undone.

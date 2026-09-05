# Round 6 — standardize landmark footprints and land parcels into four size classes

Structural cleanup of an existing, working game. Read `PROJECT_DESIGN.md` and
`CURRENT_STATE.md` at the repo root first (they encode the design rules and the
current implementation state; `DESIGN_MO.md` / `PROGRAM_UX_DESIGN.md` /
`VISUAL_DESIGN.md` live in the design-profile folder those files reference).

This is **not** a gameplay redesign. Do not touch: name entry, the opening
Osaka-ben NPC scene, Phase 1/2/3 grammar, STT, recorded student audio, the
guide avatar, the talking portrait, mystery-building progression, or unlock
behavior — except where a small compatibility change is genuinely forced.

Split across subagents if useful (measurement/recomposition of landmark scenes
is fairly separable from the town-layout/parcel work), but the primary agent
owns integration and the final verification.

**Work in a way that survives interruption.** A previous attempt at this task
died partway through, having edited `config/landmarks.js` to import
`LANDMARK_SIZE_CLASSES` from `config/town.js` *before* adding that export to
`town.js` — leaving the repo unbuildable. Sequence edits so the tree stays
buildable at reasonable checkpoints (define new exports before the code that
consumes them), and run `npm run build` at intervals rather than only at the
end.

---

## The problem

Landmarks each declare their own ad-hoc `footprint` in `config/landmarks.js`
(36×26, 26×22, 26×20, 22×18, 22×12, 16×12, 14×12 …), and each lot in
`config/town.js` carries its own hand-tuned `size`. As interchangeable
landmarks were added, some completed landmark *scenes* now exceed their
assigned parcel — props crossing into streets, the airplane reaching toward the
road, fences crossing lot boundaries, large attractions cramped.

Replace this with four standard size classes, and make the town's parcels and
road spacing follow from them.

## Target size classes

| Class | Usable landmark envelope | Reserved plot |
|---|---:|---:|
| small | 16 × 14 | 20 × 18 |
| medium | 22 × 18 | 26 × 22 |
| large | 28 × 24 | 32 × 28 |
| xl | 38 × 28 | 42 × 32 |

Define once, centrally (e.g. `LANDMARK_SIZE_CLASSES` in `config/town.js` or a
dedicated module) and derive everything from it. These raw numbers must not be
scattered around the codebase.

## Class assignments

- **small**: bank, bakery, bookstore, cafe, convenience, restaurant, house
- **medium**: aquarium, cinema, museum, fire, hospital, library, police, gym,
  playground, pool, supermarket, hotel, busStation, gasStation
- **large**: amusementPark, beach, castle, farm, temple, zoo, school, park,
  mall, airport, station
- **xl**: stadium

Note `mall` moves up to **large** deliberately — at ~16×12 it reads far too
small for a major commercial destination. Preserve its existing architecture,
just give it room.

---

## Findings from my own inspection — read these before planning

**1. `zones` currently conflates semantic zone with physical size.** Today a
lot's `zones` array mixes `civic`/`recreation`/`transport`/`edge` (semantic)
with `large`/`medium`/`small` (size), and `landmarks.js` entries do the same
(e.g. school has `zones: ['civic','large']`, mall has `zones:
['medium','large']`). The brief requires these be separated: a lot gets a
`plotClass` (small|medium|large|xl) **and** a semantic `zones` list; a landmark
gets a `sizeClass` **and** a semantic `zones` list. Placement must satisfy both
independently. Untangling this is part of the task — don't leave size words
inside `zones`.

**2. `LOT_EXCLUSIONS` in `buildings/index.js` is a workaround.** It hard-codes
7 mutual-exclusion pairs (`lot-school`↔`lot-west-big`,
`lot-stadium`↔`lot-southeast`, `lot-northeast`↔`lot-northeast-big`, …) because
those parcels physically overlap or crowd each other. With properly spaced
standardized parcels these should become unnecessary. **Treat "can I delete
LOT_EXCLUSIONS entirely?" as a health check on the new layout** — if you still
need them, parcels are still too close. Report what remains and why.

**3. `excludedTypes` on `lot-northeast` and `lot-northeast-big`** exist purely
to keep tall rooflines away from the railway so the line could stay low and
level. Re-derive these from the new layout rather than preserving them blindly;
if the restructure moves those parcels clear of the corridor, drop them.

**4. `minLotSize` on `hospital`** becomes redundant under a class system —
remove it and any similar one-off overrides.

**5. Eight landmarks currently pin a fixed `def.lot`**: school, library,
hospital, station, stadium, park, museum, mall. Per the brief, only genuinely
justified fixed locations should survive (station, because the railway corridor
is authored against its pad; stadium, if it holds the sole XL parcel). The
other six should become generic class+zone matches. Prefer generic parcel ids
(`small-1`, `medium-north`, `large-west`, …) over building-named ones.

**6. Things that read `footprint` / `lot.size` and will be affected:**
- `systems/unlockReveal.js` builds its preview via
  `build({ size: def.footprint, … })` — the reveal model will change with the
  new footprints. Confirm it still frames correctly.
- `systems/tour.js` and `systems/guidedTour.js` derive camera framing distance
  from `Math.max(lot.size[0], lot.size[1])`. Larger parcels mean the Phase 2
  speaking-tour stops and Phase 3 presentation shots will pull back further —
  re-check that framing still looks right, and adjust the multipliers if stops
  now feel too distant.
- `world/index.js` / `world/scenery.js` reserve lot rects in the `Occupancy`
  map; bigger parcels reserve more ground, which will push houses/trees/paddies
  outward. Make sure the town doesn't end up sparse in the middle as a result.

**7. Railway corridor.** `lot-station` is `reservedFor: 'station'` and the track
is authored straight and level along a fixed X, spanning the map end-to-end
(currently deck Y 11.2, X ≈ 45.8, Z −115→115). If you move the station parcel
or the roads, the corridor moves with it — re-verify it still clears every
`ALL_TYPES` landmark on every parcel it passes, and **do not solve conflicts by
raising the deck** (a previous attempt at 24.5 cleared everything but visually
swallowed the town and had to be reverted). Prefer routing the corridor between
parcels.

---

## Layout work

You may move lot centers, move roads, and expand the playable area. Current
grid: streets at `z = 0, 28, −26` and avenues at `x = −30, 2, 26`; `WORLD` is
`size 230, flatRadius 88, hillRadius 124`.

- Prefer **modest systematic changes** (push parallel avenues apart, move the
  north/south streets outward) over one-off irregular parcels.
- Roads are hard no-overlap zones. The hierarchy
  `landmark geometry < usable envelope < reserved plot < road clearance`
  must always hold — the reserved plot itself must not touch a road.
- Expanding `flatRadius` from 88 toward ~95-100 is fine if testing shows it
  produces a cleaner layout; move `hillRadius`/`WORLD.size` to match. Choose
  the **smallest** expansion that actually works — don't inflate the map.
- **Preserve Matsubara's semi-rural character.** More room must not turn this
  into a dense grid. Keep the rice fields, open ground, irregular development
  and low-density surroundings. Undeveloped parcels should still read as
  grass/dirt/field, not obvious rectangular construction pads (that's already
  how `createLotDressings` behaves — keep it).

## Parcel inventory

Keep roughly 17 candidate parcels unless there's a good reason to differ. Work
out the right per-class split yourself from the landmark pool (7 small, 14
medium, 11 large, 1 xl) and the fact that only ~10 are built per run. Smaller
landmarks *may* use larger parcels, but prefer the smallest suitable parcel so
a bakery doesn't consume a large plot. Whatever split you choose must survive
the dead-end testing below.

## Measure, don't trust declared sizes

Instantiate **every** buildable landmark (`ALL_TYPES` only — `cityHall` and
`post` are `retired: true` and can never be built; measuring them previously
produced a bad clearance figure) and compute real world-space X/Z extents via
`THREE.Box3().setFromObject(...)`, including all children.

Produce a table: landmark | class | actual X×Z | allowed X×Z | PASS/FAIL.

For anything over its envelope, **recompose the scene internally first** — move
props inward, tighten gaps, reposition trees/vehicles/fences, rotate long
components. Only scale the whole landmark when it is genuinely oversized;
blanket scaling breaks the relative scale of doors, people and vehicles against
the rest of the town.

Pay particular attention to the **airport** (terminal, plane, hangar, taxiway,
windsock, fences — the plane has previously intersected the terminal and
drifted toward the road) and to **zoo / amusementPark / farm / beach**, whose
scenes are wide and prop-heavy. The **stadium** keeps its custom design; give
it the XL parcel and move that parcel somewhere with real space rather than
shrinking the building.

For the **station**, distinguish station-local geometry (must fit the parcel)
from the railway network (intentional infrastructure that crosses town).

## Selection integrity

`systems/choices.js` → `availableChoices()` already filters through
`canPlace()`, so keep that contract intact as you change the matching rules: a
landmark must never be offered if no compatible free parcel remains. This has
to keep working with random choices, mystery locked silhouettes, unlocks, and a
full 10-building run.

Then test for dead ends: run many randomized playthroughs to the build target
and confirm no early sequence can strand the player. Fix by rebalancing the
per-class parcel counts, **not** by adding special-case placement exceptions.

## Verification (all of it, before declaring done)

1. Measured bounds table for every buildable landmark vs its envelope.
2. Every reserved parcel clears every road (report worst-case margin).
3. No two reserved parcels overlap (report worst-case gap).
4. Randomized 10-building runs: no dead ends.
5. Railway clears all `ALL_TYPES` landmarks on parcels along its corridor.
6. Visual inspection of representatives from each class — small (bakery,
   house), medium (library, hospital, aquarium, pool), large (mall, zoo,
   airport, school, station, amusementPark), xl (stadium) — from the normal
   builder camera and a closer view. Confirm: scene inside parcel, perimeter
   sidewalk visible, nothing crossing into streets, plane nowhere near a road,
   town still looks natural and not sparse.
7. `npm run build` passes; full playthrough with zero console errors. (A
   `requestfailed` on `assets/buildings/*.glb` is expected — that's the
   designed GLB probe for `fallback`-type landmarks.)

## Report

Final classes and assignments; final parcel count per class; which lot centers
moved; which roads moved; whether `flatRadius` changed and to what; measured
bounds for every landmark you had to adjust; which scenes needed internal
recomposition; whether `LOT_EXCLUSIONS` could be deleted; and explicit
confirmation for mall→large, airport fitting with no road spill, stadium
fitting XL, and randomized runs working.

Leave `CURRENT_STATE.md` alone — I'll update it after reviewing the diff.

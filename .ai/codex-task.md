# Task: mixed visual fixes + pedestrian/sidewalk overhaul + two new features

This is a substantial, multi-part change across an already-built game. Read
`PROJECT_DESIGN.md` and `CURRENT_STATE.md` at the repo root first for the
established look/behavior rules (town-is-the-reward framing, which landmarks
are hand-built and must be preserved, camera constraints that are intentional
and must not be loosened). The working tree already has uncommitted changes
from a prior visual-QA pass (collision/placement fixes) — build on top of them,
don't revert or redo that work.

Treat this as several related workstreams. If it's useful, split across
subagents along the natural boundaries below (visual/geometry fixes; the
sidewalk + pedestrian/vehicle system; the two new features) — the primary
agent should coordinate integration and do the final combined verification.

---

## A. Small, independent visual/geometry fixes

1. **Remove the bank's columns.** `src/buildings/extras.js`, `buildBank`
   (~line 381): the `dressing` callback adds five cylinder columns in a loop
   (`for (let i = -2; i <= 2; i++) { ... cylinder(0.42, 0.46, 6.6, 10) ... }`,
   ~line 386-388). Remove that loop; keep the rest of the dressing (the round
   door surround and the vault-dial detail).

2. **Fix z-fighting tan/brown patches on undeveloped lots.** `src/world/
   scenery.js`, `createLotDressings` (~line 295): each empty lot gets 2-3
   "patch" boxes (`box(pw, 0.12, pd)`) all placed at the *same* `y: 0.07` with
   random rotation, so where two patches overlap their top faces are
   essentially coplanar and flicker (classic z-fighting) — this is what's
   being described as "tan and brown rectangles that overlap... they flicker."
   Fix by giving each patch a distinct Y (small stacked offset, e.g. each
   successive patch a few mm higher) and/or reducing/eliminating overlap
   between patches, and/or increasing the depth-buffer separation. Verify by
   screenshotting an unbuilt lot from a few angles at different camera
   distances — z-fighting can be subtle in a single static screenshot, so if
   practical also render two frames a few units apart to confirm no flicker
   remains at typical camera distances.

3. **Investigate the red circle on the school grounds.** `src/buildings/
   procedural.js`, `buildSchool` (~line 114): there's a `RingGeometry(4.6,
   6.2, 32)` running track colored `0xc06a4e` (a reddish terracotta) sitting
   flat on the schoolyard. The user is reporting this as an unwanted "red
   circle" visible after the school is built — at this low-poly art scale a
   flat single-color ring apparently doesn't read as a running track, it just
   looks like a stray red circle / rendering defect. Fix so it doesn't look
   like an error: either remove it, or make it clearly legible as a running
   track (e.g. a lane-marking texture/color scheme consistent with the rest of
   the game's palette, thinner ring, or lane-line detailing) — use your
   judgment on which reads better in this art style. Screenshot the built
   school to confirm the result looks intentional, not like a bug.

4. **Playground swings look wrong.** `src/buildings/extras.js`,
   `buildPlayground` (~line 905-935): each swing seat is a group containing
   *both* the rigid chain beams (`box(0.08, 1.6, 0.08)`) *and* the seat plank
   (`box(0.85, 0.12, 0.4)`), and the animation rotates that whole group
   (`s.rotation.x = Math.sin(...) * 0.3`) around its pivot at the top bar. That
   makes the seat plank tilt rigidly with the chain angle as it swings, which
   does not read as a real swing (a real seat stays roughly level while
   arcing, because it hangs freely from the chain rather than rotating rigidly
   with it). Decouple the seat's orientation from the chain's swing angle —
   e.g. counter-rotate the seat plank relative to the group, or move the
   swinging motion to translate the seat along an arc without tilting it.
   Screenshot mid-swing to confirm it reads correctly.

5. **Station benches should face the tracks, not away from them.**
   `src/buildings/procedural.js`, `buildStation` (~line 461-463): benches on
   the platform are placed at `z: 3.4` with `rotation.y = 0`. The platform is
   at local `z: 2.4` and the track centerline is at `TRACK_Z = -1.8` (more
   negative Z, i.e. on the opposite side from where these benches currently
   face by default) — the park's benches use `rotation.y = Math.PI` to face
   their subject (see line 215), which is the convention to match here so the
   station benches face toward the track instead of away from it. Verify the
   seat-back ends up on the far side from the track.

## B. Buildings must not intersect each other; the station track needs to run
the full width of the map

1. **No building-to-building intersections after construction.** Do a pass
   checking landmark bounding boxes (`THREE.Box3` per built model, in a
   throwaway verification script — no permanent collision system needed)
   against each other for a town built with a representative mix of
   landmarks, and fix any that overlap. This is likely to matter most for the
   next item:

2. **Extend the train station's elevated track so it runs end-to-end across
   the whole map, not just locally around the station** (`buildStation`,
   ~line 423-424: `DECK_Y = 6.2`, `HALF = 34` — currently the viaduct only
   spans ±34 units from the station's own origin). This is a real request,
   not optional: the elevated line should visually read as a railway crossing
   the entire town, the way a real train line would. Extending it will bring
   it near/over other landmarks that weren't a concern before — **you will
   likely need to raise `DECK_Y`** (and adjust the pier/support positions
   along the new full span) so the deck clears the tallest buildings it now
   passes near (city hall's tower, the castle's keep, the museum's dome, the
   mall's roof, hotel storeys, amusement-park rides, etc. — check actual
   heights via `Box3` rather than guessing). The existing train
   arrival/departure animation (`g.userData.callTrain`, and the activity
   system's `train`/`plane` handlers that reference station geometry) must
   keep working — don't break the animate() timeline or the
   `userData.deckY`/`userData.train` contract other systems read.
   Verify with `Box3` checks along the new track's full path against every
   landmark lot, plus a few screenshots (overview, and a couple of close
   passes where the track crosses near a tall building) to confirm no
   clipping.

## C. Sidewalks and pedestrian/vehicle behavior

Currently: roads have sidewalks generated in `src/world/roads.js`
(`SIDEWALK_BY_CLASS`, ~line 17, widths 1.6-2.6 depending on road class,
merged into one mesh per material). Landmark lots (`src/config/town.js`,
`LANDMARK_LOTS`) have **no sidewalk of their own** — when empty they're just
gravel/dirt dressing (`scenery.js` `createLotDressings`), and when built the
building sits in the lot with no dedicated walking path around it. Pedestrians
(`src/systems/pedestrians.js`) walk the road graph with a lateral offset
roughly onto the road's sidewalk strip, but the "visiting a landmark" behavior
(`toEntrance` state) walks a straight line from wherever the pedestrian is
toward a point near the lot's `entrance` coordinate — cutting across the lot's
open interior rather than following any actual path, which is why people can
currently be seen walking through/into buildings.

Desired end state:

1. **Every developed (or developable) lot gets a sidewalk that runs
   completely and contiguously around its perimeter**, meeting up naturally
   with the road-adjacent sidewalk strip where the lot faces a road. This
   likely means adding sidewalk geometry generation for lot perimeters
   (similar technique to what `roads.js` already does for road edges — reuse
   that visual language/material, don't invent a new one) as part of world
   assembly (`src/world/index.js` orchestrates `createTerrain`,
   `createRoads`, `createScenery`, etc. — this is probably where a new
   `createLotSidewalks`-type step belongs, called with the lot list and the
   road graph so it can align to the road sidewalk at the entrance side).

2. **Lots must be sized to fit both the building and this perimeter
   sidewalk.** Check `LANDMARK_LOTS` sizes in `src/config/town.js` against
   each landmark's `footprint` in `src/config/landmarks.js` — if a lot's
   margin around its footprint isn't enough to fit a sidewalk strip without
   the sidewalk overlapping the building or spilling into the road, enlarge
   that lot's `size` (small, targeted adjustments; don't restructure the road
   layout to do this — there's room to grow lots outward on their non-road
   sides in most cases). Do this after step 1 so you're sizing against the
   sidewalk width you actually implement.

3. **Pedestrians must stay on sidewalks — never walk through a building's
   footprint.** Fix the `toEntrance`/visiting behavior in `pedestrians.js` to
   path along the new lot-perimeter sidewalk (and the road sidewalk it
   connects to) rather than walking a straight line across the lot interior.
   The general road-walking and idle-wander behavior should also never send a
   pedestrian's position inside a *built* landmark's footprint — check against
   the same occupancy/footprint data the placement system already uses
   (`src/world/scenery.js` has an `Occupancy` class with `blocked()` checks;
   reuse that pattern rather than inventing a parallel one) so once a lot is
   built, nobody can wander into where the building now stands.

4. **Pedestrians and vehicles must not pass through each other.** There's
   currently no interaction between the two systems at all
   (`src/systems/pedestrians.js` and `src/systems/vehicles.js` are fully
   independent). Add basic mutual avoidance — this does not need to be a full
   traffic simulation: pedestrians already stay laterally clear of the
   carriageway most of the time via their road-edge offset, so focus on the
   cases where they actually cross a vehicle's path (crossing at a junction,
   or walking to/from a lot across a road) — a simple proximity check that
   makes a pedestrian pause/yield if a car is about to pass through the same
   point, and vice versa, is sufficient. Keep it cheap (this runs every frame
   for up to ~70 pedestrians and ~26 vehicles on a Chromebook target) — a
   distance/time-to-collision check against nearby agents only, not an
   all-pairs check every frame if you can avoid it (e.g. only check agents
   near a crossing point).

Verify B and C together with a normal playthrough (`?dev=1&target=~8`),
watching pedestrian and vehicle movement for a while after several landmarks
are built, and screenshot a couple of representative moments (a pedestrian
walking to a landmark entrance, a junction with both a pedestrian and a car
nearby).

## D. Two new features

1. **Ask for the player's name at the start of the game; it replaces "Ken" in
   "Ken's house."** Currently `src/config/lessons.js` defines
   `export const HOUSE_OWNER = 'Ken';` as a module-load-time constant, and
   `src/config/landmarks.js` computes `const HOUSE_LABEL =
   \`${HOUSE_OWNER}'s house\`;` (~line 38) once at import time, baking it into
   the `house` landmark's `displayName`/`spokenName`/`sign`/`keywords`
   (~line 329). That bake-in has to become a runtime update: after the name is
   captured, update those fields on the already-constructed `LANDMARKS.house`
   entry (and anywhere else `HOUSE_OWNER`/`HOUSE_LABEL` leaked into, e.g. the
   activities/hints data if it references the owner name) before the game
   proper starts (`src/main.js`'s `Game.init()` / the module-level `TARGET`
   setup runs after `DOMContentLoaded`-equivalent, so there's room to gate
   game start on a name being entered first).

   UI: a simple name-entry screen shown before the loading/game screen,
   matching the existing minimal panel style (see `#loading`,
   `#choice-panel` etc. in `index.html`/`src/style.css` for the visual
   language — reuse it, don't invent a new UI system). A text input plus
   "Start" affordance; **pressing Enter with the input blank must default to
   "Ken" (i.e. leave `HOUSE_OWNER` as-is, "Ken's house")**; pressing Enter or
   Start with a name typed uses that name in its place everywhere "Ken's
   house" currently appears (build sentence, tour speaking sentence, activity
   hints, the choice card, the guided-tour presentation). Keep the input
   reasonably sane for a child typing on a Chromebook (trim whitespace, cap
   length, don't let HTML injection through — it's only ever inserted as
   `textContent`/template data already, not innerHTML, so just make sure
   whatever you add follows that same pattern).

2. **WASD / arrow-key camera navigation.** `src/systems/cameraRig.js` runs
   `THREE.OrbitControls` for mouse drag-to-rotate/zoom, with real constraints
   that must be preserved (`CAMERA.panLimit`, `minDistance`/`maxDistance`,
   `minPolar`/`maxPolar` in `src/config/town.js` — `clampTarget()` in
   `cameraRig.js` ~line 52 already enforces the pan limit and runs every frame
   via `update(dt)`). Add keyboard panning: WASD or arrow keys shift
   `controls.target` (and therefore the camera, since `controls.update()`
   recomputes position from target) along the camera's current forward/right
   vectors projected onto the ground plane, at a reasonable speed, while a key
   is held. It must go through the same `clampTarget()` constraint the mouse
   pan already respects (don't let keyboard input bypass the pan limit), and
   must not fight or override the camera during any scripted cinematic
   (construction fly-in, phase-1 finale, phase-2 tour stops, phase-3 guided
   tour, the unlock reveal) — gate it on the rig not currently being in
   cinematic mode (`rig.isCinematic`) the same way player mouse control
   already is. Should feel similar in speed/responsiveness to the existing
   mouse pan.

---

## Constraints (apply to all of the above)

- Do not modify the hand-built landmarks' core designs
  (`src/buildings/procedural.js`: school, library, hospital, park, station,
  museum, mall, stadium) beyond the specific, narrow fixes requested above
  (school track, station benches, station track extension/height). Don't
  redesign their architecture.
- Do not loosen `CAMERA` distance/polar constraints in `src/config/town.js` —
  the new WASD panning must respect the existing pan limit, not replace it.
- Keep the game's minimal-UI visual language (see `PROJECT_DESIGN.md`) — the
  name-entry screen should look like it belongs, not like a separate app.
- `npm run build` must pass with no errors, and a normal playthrough via
  `?dev=1&target=N` (choose → speak/fast-forward → construction → repeat →
  finale) must run with zero console errors.
- This is a big change set — prioritize getting all of it working correctly
  over polishing any single piece excessively. If something in section C
  (sidewalks/pedestrians) turns out to need a genuinely large rewrite to do
  properly, do the rewrite — this was explicitly flagged as possibly
  significant — but keep it scoped to sidewalks/pedestrian movement, don't
  touch the road layout or lot positions beyond the targeted size increases
  in step B/C.2.

## Deliverable

In your result, give me:
1. A concise list of what was implemented/fixed per section (A/B/C/D), one or
   two lines each.
2. Any judgment calls you made where the request was ambiguous (e.g. exactly
   how the school track was resolved, exact new station deck height, keyboard
   pan speed chosen) so I can sanity-check them.
3. Confirmation of the acceptance criteria (build status, console errors,
   Box3 checks for building/track intersections).
4. A small number of screenshots as evidence for the harder items (z-fighting
   fix, school track, swings mid-motion, extended track clearing a tall
   building, a pedestrian correctly walking a lot's sidewalk to an entrance,
   the name-entry screen).

Do not update `CURRENT_STATE.md` yourself — I'll do that after reviewing the
diff.

# Round 9 — street frontage: buildings on the road, paving only where it belongs

Four changes to how landmark plots meet the street, one placement bug, and one
movement bug that has already been diagnosed (section 3). Read section 3 before
starting section 1 — the two are coupled, and doing section 1 alone would break
pedestrian routing.

The current state is good and must survive: Round 6's four size classes and
33/33 landmark envelope fit, Round 7's 41 irregular road segments and restored
density, Round 8's nine placed rice-field sites. Do not undo any of it.

## 1 + 5. Sidewalks belong between the building and the road — nowhere else

**Today:** when construction completes, `createLotSidewalk`
(`src/world/roads.js:137`) draws a **continuous walk around all four sides** of
the plot, plus a spur out to `lot.entrance`. `world/index.js:63` calls it from
`addLotSidewalk`.

**Wanted:** no perimeter ring at all on player-built landmarks. The only paving
a built plot gets is the **frontage** — the strip between the building's
road-facing side and the road's own sidewalk, filling that gap so the two read
as one continuous paved surface rather than two slabs with grass between them.

- The other three sides of the building get nothing. They stay open ground.
- Undeveloped plots keep behaving as they do now: no paving, unclaimed ground.
- `clearLotSidewalks()` must still restore everything to open ground on Play
  Again.
- Keep the existing material, `WALK_TOP` height, and the merged-geometry
  approach — this must not add draw calls per building.
- Watch the coplanar-face problem the current code is careful about: the
  frontage strip meets the road sidewalk, and overlapping top faces at the same
  height z-fight. Butt them, don't overlap them.

## 2. Buildings sit far too far back from the road

Measured across all 17 lots — gap from the **plot** edge to the outer edge of
the adjacent road sidewalk:

| | min | median | max |
|---|---:|---:|---:|
| plot edge → road sidewalk outer edge | 2.22 | 3.75 | 9.28 |

and the **building** is further back still, because every plot is its envelope
plus a 2 m perimeter band. Real building-to-pavement gaps therefore run about
**4.2 to 11.3 metres of empty ground**. From the normal camera the landmarks
read as set back in their own fields rather than as buildings on a street.

Wanted: landmarks address the street. The building's road-facing frontage
should sit **close to the pavement** — a consistent, modest setback across all
plots, with the whole of that setback paved by item 1 rather than left as grass.
Pick the value that looks right in the normal camera and state it; the intent is
"a building on a street", not "a building in a paddock". The current spread of
4.2–11.3 is both too large and too inconsistent.

On facing: I have already checked the **plot** data and all 17 lots orient
correctly — for every lot, the front implied by `rot` points exactly at its
`entrance` (dot product 1.000 in all 17 cases). So do not go looking for wrong
`rot` values; they are right. If a specific landmark still *looks* like it is
facing the wrong way, the mismatch is inside that building's own builder — its
front is modelled on the wrong local axis within the envelope — so check the
builders, not the layout data.

The hard part is that closing the gap moves geometry toward roads that the last
three rounds carefully separated. You may move plots, adjust the 2 m band,
change how the frontage is derived, or reshape roads — whatever is cleanest —
but the Round 6/7/8 guarantees below must all still hold afterwards.

## 4. A rice paddy is lying in the road

Confirmed by measurement:

| paddy plot | size | conflict |
|---|---|---|
| `(-72, -96)` | 16 × 14 | **overlaps the carriageway by 2.13 m** |
| `(-47.5, 105.5)` | 11 × 9 | intrudes 0.35 m into the sidewalk band |
| `(-48.5, -105.5)` | 11 × 9 | intrudes 0.58 m into the sidewalk band |

The worst one sits on the diagonal country lane `(-93.5,-87.5) → (-64,-111)`.

Likely mechanism, offered as a lead rather than direction: `createPaddies`
(`src/world/terrain.js:122`) tests each plot as a **circle** of radius
`Math.max(pw, pd) * 0.45`. For that 16 × 14 plot the radius is 7.2, but its true
half-diagonal is 10.63 — the corners are never tested, and on a diagonal lane
they land in the road. The clearance argument of `3` is also measured against
that under-sized circle. Verify before fixing; a rectangle-vs-road test would
address the whole class of error rather than the three instances.

Paddies must end up with **zero** carriageway overlap and no intrusion into a
road's sidewalk band. Do not fix this by deleting fields — Round 8 restored all
nine sites and they should stay placed.

## 3. Pedestrians stutter, and vanish in Phase 2

Already diagnosed — a read-only investigation ran, and I then verified its
claims in the live browser and rejected two of them. **Use these conclusions;
do not re-derive them, and do not implement the parts I rejected.**

### 3a. The stutter: junctions are not traversed (this is the main one)

`continueFrom()` (`src/systems/pedestrians.js:375`) swaps edge, direction and
lateral offset in one step without ever walking through the junction;
`graph.pointOn()` then writes the agent to its new sidewalk position on the next
frame. Dead-end reversal also flips the lateral basis without negating it,
throwing the agent across the road.

Confirmed live, 30 s at full load, 26 pedestrians, 3247 frames:

| | |
|---|---:|
| max *legitimate* single-frame movement (2.5 m/s × 0.05 clamp) | 0.125 m |
| impossible jumps observed | 35 |
| median / max jump | 1.47 m / 19.46 m |
| **`walking → walking`** | **34 of 35** |

Fix the geometry: give the agent an explicit short connector between the
incoming and outgoing sidewalk across the junction, and preserve the *signed*
lateral side through reversals so a turn-back stays on its own side of the road.
Position must stay continuous — no frame may move an agent further than its
speed allows.

### 3b. The disappearance: population shrink hides agents where they stand

`setPopulation()` (`pedestrians.js:513`) shrinks with
`active.pop()` → `p.group.visible = false` — instantly, on arbitrary agents,
wherever they are on screen.

`updateLiveliness()` (`main.js:466`) multiplies population by **1.35** while
`phase` is `finale` or `explore`. `tour` and `guided` are **not** in that list.
So the first accepted Phase 2 answer calls `updateLiveliness()` at
`main.js:596`, the target drops back to the unboosted number, and the surplus
pedestrians pop out of existence in full view. Measured live: population went
13 → 27 entering the finale, so the drop is roughly nine agents at once.

Fix so agents are never hidden mid-scene while visible. Retire them
gracefully — let a surplus agent walk out of the network, or off-camera, and
only then return it to the pool. Do not fix this by simply removing the 1.35
boost, and do not raise the maximum population.

### 3c. Visit routes omit their origin (secondary, real)

`makeVisitRoute()` (`pedestrians.js:173`) builds its first waypoint from the
first edge of the path rather than from the pedestrian's actual current
position, so the reversed return route stops short and `returning` then resumes
from `homeNode` as if the agent were already there. One live event at 13.36 m
(`toEntrance → toEntrance`). Store the exact origin — edge, `t`, direction,
signed lateral — and reverse back to it.

### 3d. What I rejected — do not implement these

- The diagnosis called the 1.8 s "relocate to a random edge" recovery path *"the
  strongest single explanation"*, citing an 89 m jump. **It did not reproduce
  live**: zero jumps over 20 m in 30 s at max load. The mechanism does exist, so
  make the narrow change — never relocate an agent that is currently visible —
  but do **not** redesign deadlock recovery around it.
- Do not rewrite the whole movement model. Sections 3a–3c are the scope.

### 3e. Do not regress the earlier deadlock fix

Traffic was fixed once already, painfully. Watchdogs must stay on **wall-clock**
time (`performance.now()`), never the clamped `dt`; vehicle wait history must
persist until the vehicle physically moves; wedged walkers must still re-route.
Agents must still yield at crossings without wedging.

### 3f. Why section 1 is coupled to this

`lotWalkPoints()` (`pedestrians.js:135`) derives `ring` and `visit` waypoints
from `lot.size` and `LOT_SIDEWALK_WIDTH`, and `makeVisitRoute` pushes
`attraction.ring` then `attraction.visit` as its final two waypoints — so
visiting pedestrians deliberately walk onto the perimeter ring and spread
±2.5 m along it.

Delete the ring geometry in section 1 without changing this and pedestrians will
walk on **invisible pavement** around all four sides of every built landmark.
Re-derive these waypoints against the new frontage: road sidewalk → frontage
paving → a door/entrance point, and the exact reverse on the way out.

### 3g. The QA harness is blind to this class of bug

`.ai/measure-live-traffic.mjs:69` treats any displacement over 0.08 m as
successful movement — so a teleport *resets* the stall counter and reads as
healthy. That is why an earlier round reported traffic fixed. Fix the harness
too, or it cannot verify this work. A useful check tracks each agent by
identity every frame and flags any single-frame displacement above what that
agent's speed permits.

## Constraints

- Keep: four size classes, 33/33 landmark envelope fit, no `LOT_EXCLUSIONS` /
  `excludedTypes` / `minLotSize`, class/zone separation.
- Keep: 41 road segments' irregular character, ~37 houses and shops, nine
  placed paddy fields.
- Re-run the full verification set — landmark bounds, road/sidewalk overlap,
  parcel overlap, randomized dead-end runs, railway corridor — because moving
  plots toward roads disturbs all of them.
- Verify the movement fixes **in the live browser**, not only in a module-level
  harness. The read-only diagnosis could not run a browser, and two of its
  conclusions did not survive contact with the real game. Track agents by
  identity per frame and report the max single-frame displacement against each
  agent's permitted maximum.
- Semi-rural Matsubara stays semi-rural. Tightening frontage on the town blocks
  should not turn the country lanes into a suburban street wall.
- If `WORLD` changes, say so and justify it. It has drifted silently before.
- `npm run build` passes; full playthrough with zero console errors.
- Keep the tree buildable at checkpoints — a previous round died mid-edit and
  left it broken.
- Leave `CURRENT_STATE.md` and `CONTEXT.md` alone.

## Report

The chosen setback value and why; confirmation that no perimeter rings remain
and frontage paving meets the road walk cleanly; any plot whose facing you
corrected; paddy conflict count (must be zero) and how you tested it; live
houses+shops, road-segment and paddy-field counts; final `WORLD`; and the
re-run verification set.

For the movement work: max single-frame displacement per agent from a **live
browser** run at full load (target: nothing above the agent's speed limit),
the count of visible-agent hide events during the Phase 2 transition (target:
zero), and confirmation that the deadlock guarantees in 3e still hold.

# Round 4 — traffic deadlock, straight track, construction camera, manual dialogue advance

Four items. #1 is a real bug I've already diagnosed precisely — please fix the
specific causes below rather than re-deriving them.

---

## 1. Pedestrians and vehicles deadlock into permanent pileups (priority)

Reported symptom: "pedestrians and cars are grouped together stuck, there must
be some kind of pileup that prevents them from moving." I traced this to a
mutual-yield deadlock introduced by the round-1 avoidance work. Three distinct
defects combine:

**(a) `hasAgentNear` in `systems/pedestrians.js` has no yielding exemption and
no state filter.**

```js
hasAgentNear(x, z, radius) {
  return active.some((p) => { /* pure distance test over ALL pedestrians */ });
}
```

Compare `hasCrossingNear` directly above it, which correctly does
`if (p.yielding) continue;` and filters to pedestrians actually crossing or at
a junction. `hasAgentNear` does neither. `advance()` in `systems/vehicles.js`
calls it every frame with `clearance = 2` (cars) and, on a hit, **rolls the
vehicle back to its previous position and forces `v.yielding = true`**.

Because sidewalks sit only ~1.6-2.6 units from the carriageway, an ordinary
pedestrian simply *standing or walking on the sidewalk* — not crossing at all —
falls within that 2-unit clearance and permanently freezes the car. This alone
is likely the main cause of the pileups.

**(b) `hasApproachingAgent` in `systems/vehicles.js` treats a stopped vehicle
as "approaching."** When both agents have ~zero velocity, `rvx`/`rvz` collapse
and `speedSq > 0.01` is false, so `time = 0` and the closest-approach test
degenerates into a plain proximity check against the *current* distance. A car
that has already stopped therefore still reads as a threat, so the pedestrian
keeps yielding.

**(c) There is no deadlock breaker anywhere** — no timeout, no priority
tie-break. Once (a) and (b) latch, both agents are stuck forever, and further
agents queue up behind them, producing the visible clump.

Fix all three:
- `hasAgentNear` should ignore pedestrians that are themselves yielding, and
  should only consider pedestrians actually in/entering the carriageway (reuse
  the same state/`distanceToRoad` filtering `hasCrossingNear` already uses) —
  a pedestrian safely on the sidewalk must never block a car.
- `hasApproachingAgent` must only return true for a vehicle genuinely closing
  on the pedestrian (require meaningful relative approach velocity, not mere
  proximity). A stationary or receding vehicle should not cause a yield.
- Add a deadlock breaker regardless: if an agent has been yielding for more
  than a short interval (~1.5-2s), force it to proceed (or give one side
  deterministic priority) so no pair can ever mutually block indefinitely.

**Verify by measurement, not just by eye.** Run a long simulation (the max-load
70 pedestrians / 26 vehicles case) for a few simulated minutes and assert that
no agent stays effectively stationary for more than a few seconds while not
legitimately parked/idling — report the worst-case continuous stall time
observed before and after your fix. Also confirm the original intent still
holds: pedestrians and cars must still not pass through each other.

## 2. Train tracks must be completely straight

They currently bend horizontally and ramp vertically (the 6.2 / 11 / 17.2
profile from last round). The requirement now is a **completely straight
line: no horizontal bends, no vertical slopes — one constant deck height for
the entire span, end to end across the map.**

Treat straightness as the hard constraint. Your free variables are:
- **where** the straight corridor runs (its fixed X, since it runs along Z —
  the station lot sits on it and can move with it if needed), and
- the single constant deck height.

So: choose a corridor that avoids passing directly over the tallest landmark
lots, then pick the lowest constant height that clears everything actually
beneath that corridor. Prefer a lower deck over a higher one — an earlier flat
24.5 build cleared everything but visually dominated the town and had to be
reverted, so don't simply raise it until the numbers pass. If a specific tall
lot is unavoidably under the line, it's acceptable to shift that lot, or to
constrain which landmarks that lot can host, rather than lifting the entire
railway.

Clearance must be checked against `ALL_TYPES` only (not the whole `LANDMARKS`
registry — `cityHall` and `post` are `retired: true` and can never be built;
measuring them is what produced the bad 21.15 figure previously).

Preserve the existing train animation and the `userData.train` / `deckY` /
`callTrain` contracts other systems read. Screenshot the overview afterward.

## 3. Move the camera to the front of a finished building

In `systems/construction.js`, after the building settles the sequence
currently does:

```js
await rig.focusOn(centre.clone().setY(height * 0.42), {
  distance: ..., polar: 0.9, duration: 1.1, ease: Ease.sineInOut,
});
```

`rig.focusOn` → `viewpointFor` keeps the camera's *current azimuth*, so the
final hold lands at whatever angle the camera happened to be at — often the
back or side of the new building.

Change it so the hold framing is from the **front** of the building. Each lot
already carries the information needed: `lot.rot` (the building's front faces
local +Z, rotated by this) and `lot.entrance` (the street-side point
pedestrians walk to). Compute the front-facing direction from those and pass
an explicit azimuth so the camera ends up looking at the entrance side — the
signage and doors should be readable in the final hold. Keep the existing
easing and the smooth `returnHome` afterward; this should still feel like one
continuous move, not a cut.

Verify on a few landmarks with different `lot.rot` values (e.g. `lot-school`
at `Math.PI/2`, `lot-library` at `0`, `lot-hospital` at `Math.PI`) that the
final frame really is the front, and screenshot two of them.

## 4. Intro dialogue should advance on click or space, not automatically

In `systems/openingScene.js`, `line(text, seconds, ...)` currently shows a
subtitle then `await wait(seconds)`. Replace the auto-advance with manual
advance: each beat stays on screen until the player clicks (pointerdown
anywhere) or presses Space, then moves to the next.

Requirements:
- Advance on either input; don't let a held key auto-repeat skip several beats
  at once (require discrete presses).
- Add a small persistent affordance in the dialogue panel so the child knows
  input is expected (e.g. a subtle "▼" / "click or space" hint matching the
  existing panel's visual language — keep it quiet, it shouldn't compete with
  the text).
- The camera push-in currently runs concurrently with beat 2
  (`rig.flyTo` awaited while that line shows) — keep that working; the fly
  should still complete smoothly regardless of when the player advances. If
  the player advances early, don't leave the camera stranded mid-move.
- Space must not also trigger anything else (make sure it doesn't fall through
  to a button that happens to have focus, and doesn't interfere with the WASD
  camera panning added earlier).
- `?skipIntro=1` must still bypass the whole scene.

Verify by stepping through all seven beats with space, and again with clicks,
confirming each beat waits for input and none are skipped.

## 5. Houses and trees are being placed inside rice paddies

Rice paddies must contain nothing but the paddy itself — no houses, shops,
trees, or other scenery.

I've already traced the cause. In `world/index.js` the build order is:

```js
const dressings = createLotDressings(scene, rng, occ);          // writes to occ
createPaddies(scene, rng, (x, z, r) => occ.blocked(x, z, r, 3)); // READ-ONLY
createRoads(scene, graph);
const scenery = createScenery(scene, rng, graph, occ);           // reads occ
createTreeScatter(scene, rng, occ, 620);                         // reads occ
```

`createPaddies` (in `world/terrain.js`) only receives an `isBlocked`
predicate. It correctly *queries* occupancy to avoid roads and lots, but it
never **registers** the plots it places. So when `createScenery` and
`createTreeScatter` run afterward, the paddies are invisible to them and they
happily drop houses and trees on top.

Fix by having the paddy pass reserve each plot it actually places (e.g. pass
the `Occupancy` instance through and `addRect` each plot's footprint as it's
committed, rather than only reading a predicate), so all later placement
passes treat paddies as occupied ground. Take care to register the *plot*
footprints actually created, not the whole nominal field rect — the generator
already skips individual plots that collide with roads/lots, and those skipped
areas should remain available for scenery.

Verify by scanning every placed house/shop/tree against the paddy rects and
reporting a count of intrusions (should be zero), plus a screenshot of a
paddy area.

---

## Constraints

- Don't regress anything from rounds 1-3: the sidewalk scope (roads + built
  lots only), the opening scene's content/ordering, the name entry, WASD
  panning, or the visual-QA placement fixes.
- Note: I made one small fix directly in `systems/openingScene.js` since your
  last round — the NPC's `poseLook` turn rate is now 7 (was 2.8) and his
  `rotation.y` is wrapped each frame, so lines aimed at the player actually
  face the camera within a beat. Keep that behavior when you rework `line()`
  for manual advance.
- `npm run build` must pass; a full playthrough must run with zero console
  errors. (A 404 on `assets/buildings/*.glb` is expected and fine — that's the
  designed GLB-probe fallback for `fallback`-type landmarks.)

## Deliverable

Report per item: what you changed, judgment calls, and for #1 specifically the
before/after worst-case stall measurement. Build status, console-error status,
and screenshots for #2 (overview) and #3 (two landmarks). Leave
`CURRENT_STATE.md` alone — I'll update it.

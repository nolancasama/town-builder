# CURRENT_STATE.md — Matsubara Town

Implementation state. See `PROJECT_DESIGN.md` for the rules this follows and
`CONTEXT.md` for how to run, measure and verify the project.

---

## Built and working

**Phase 1 — build the town.** Three building cards per round from a pool of 33
places across six categories, chosen to differ in category. The child taps one,
says *"We have a ___ in Matsubara."*, and it is built with a camera fly-in,
dust, foundation drop, rise and settle. 10 landmarks completes the town
(`BUILD_TARGET`). Town liveliness — pedestrians, cars, cyclists — grows with
each build.

**Phase 2 — the speaking tour.** The camera visits each built place and asks
what people can do there. Semi-free production: ~335 accepted phrases across the
pool, matched on content words with fuzzy spelling. `visited` and
`spokenSuccessfully` are tracked separately; Skip always available; the summary
offers Continue (revisits only unspoken places) or the guided tour.

**Phase 3 — the guided tour.** The child's avatar guides 5–7 varied visitors
round the town on foot, following the road graph on the sidewalk side. At each
stop it presents the place using the child's own recordings, with a large
speaking portrait cut-in lip-synced to the audio. Places skipped in phase 2 get
only their build sentence — nothing is invented. Ends with applause, an aerial,
and Explore Town / Play Again.

**Voice capture.** `MediaRecorder` runs alongside recognition; only the accepted
take is kept, per place and per sentence type. Verified end to end: capture →
store → decode → amplitude-driven playback.

**World.** Hand-placed road network with sidewalks and crossings, 17 zone-tagged
landmark lots, procedural houses/shops/trees/paddies, 8 original hand-built
landmarks plus 26 procedural ones, GLB drop-in replacement per landmark.
Building footprints and parcels are standardized into four size classes
(small/medium/large/xl) centralized in `config/town.js`; all 33 active
landmarks measure inside their envelopes, and `LOT_EXCLUSIONS`,
`excludedTypes` and `minLotSize` were deleted in favour of independent
class/zone/occupancy checks. Live: 41 road segments, 37 houses and shops,
9 of 9 rice-field sites placed, `WORLD` at 290 / 136 / 150.

**NPC character assets.** Ambient pedestrians and guided-tour visitors use
eight rigged Quaternius glTF characters with per-instance skin, hair and
clothing variation, driven by one shared Idle/Idle_Neutral/Walk/Run/Wave
animation asset.
`npm run build:characters` regenerates the compact Draco-compressed GLBs
directly from the two external source ZIPs. Loading is cached and asynchronous;
the existing procedural people are retained as the offline/404 fallback. The
guide and opening town local remain procedural for their voice-driven mouth and
distinct lesson silhouettes. The ambient cap is 24; off-screen mixers are
skipped and distant visible mixers are throttled to 10 Hz, including the tour
cast. A worst-case headless SwiftShader reference run with 24 ambient people
and five tourists rendered 167,198 triangles in 592 calls at 3.14 FPS (350.0 ms
p95), versus 3.47 FPS, 110,906 triangles and 476 calls with character rendering
and updates disabled. These software-rendered numbers are recorded for relative
comparison, not as a Chromebook estimate.

**Building progression.** 20 of the 33 active places are unlocked from the
first playthrough; 13 start locked and are discovered through play, not
purchased with any score. 2–3 rounds per game show a locked silhouette card
(the real building's icon, darkened) as a non-selectable teaser; it never
drops the round below two real choices. Finishing all three phases unlocks
exactly one new place — preferring one the child saw as a mystery that run —
shown in a brief, skippable reveal (the real 3D model, darkened then lit) before
the closing menu. Unlocks persist in `localStorage`; a teacher-only reset
control sits behind the gear icon. Verified end to end: mystery pacing and
non-selectability, unlock-on-completion, persistence across reload, NEW badge
lifecycle, reset.

**Visual QA pass.** The scene received a placement/collision cleanup pass:
fixed the airport plane intersecting the terminal (repositioned, reoriented to
the apron's actual axis, and modestly rescaled — its wingspan didn't fit the
lot at full size), plus narrower fixes elsewhere — vehicles and props pulled
back inside their lots (fire engine, police car, supermarket van/trolleys,
hotel taxi canopy), zoo pens and farm props separated, aquarium pool and gym
court resized to fit, junction vending machines no longer able to spawn in a
perpendicular road, drainage channels rerouted around landmark lots, guided-tour
character grounding and stop/camera framing corrected. All hand-built landmarks
(`buildings/procedural.js`) and camera distance/polar constraints were left
untouched. Verified independently (not just via the implementer's own report):
airport clearance confirmed from three angles including top-down, bus-stand
orientation confirmed, zoo/farm/gym/aquarium rebuilt with zero console errors.

**The town local stays.** The opening-scene character is no longer deleted when
he finishes speaking - `pedestrians.adopt()` takes him into the crowd as a
`permanent` walker, so he keeps his own body and carries on living in the town.
Adoption walks him to the nearest pavement from where he stands rather than
snapping him onto the network, and `permanent` agents are never chosen when the
population shrinks. This also clears him off the buildable field he was
standing on, which was the original reason for removing him.

**Opening scene.** After name entry, a ~16s scripted intro plays before the
first choice cards: a wide establishing shot of the sparse town with a local
already standing in an empty eastern field, seven Osaka-ben dialogue beats
(player name interpolated) delivered through the existing subtitle panel, a
smooth push-in to a medium shot, then a return home straight into Phase 1.
He gives one `We have a stadium in Matsubara.` example but **no building is
constructed** during the scene. He is removed before any lot can be claimed,
and never drives gameplay again. `?skipIntro=1` bypasses it for testing.

**Sidewalks and traffic.** Each road's walk retreats from a junction by however
far it takes to actually clear the crossing carriageway, measured rather than
derived from a width formula - at an acute junction the laterally-offset strip
stays near the crossing road far along the edge, which had left two walks lying
across a street. A stub swallowed by its own junctions gets no walk at all.
Sidewalks exist along roads, plus a paved
**frontage** between a built landmark and the road — the perimeter ring that
used to surround developed plots is gone, and the other three sides stay open
ground. Undeveloped lots keep plain gravel/dirt dressing; the frontage is added
when construction settles and removed on Play Again. Landmarks address the
street directly: each lot's `rot` is the bearing of the road it faces rather
than a right angle, so buildings sit **parallel** to their street (0 degrees off
across all 17, previously up to 17 out on the diagonal country lanes), and
their front face is **flush** with the pavement - zero gap on 15 of 17.

Two lots keep a setback for stated reasons. `large-station` is the only plot
whose position also places infrastructure (`railwayWorldX()` derives the
viaduct from it), and pulling it to the kerb drags the elevated line three
metres west over its neighbour, so it keeps a 3-unit forecourt.
`medium-northeast` is boxed in by a diagonal lane, a second road and the
viaduct; 4 units is the smallest setback that clears all three.
Pedestrians route along roads/entrance spurs/lot perimeters instead of
cutting across building footprints, and pedestrians and vehicles now yield to
each other near crossings.

**Railway.** The elevated line runs the full width of the map on a varying
height profile (6.2 at the map edges, ~11 through town, 17.2 only over the
northeastern lots that need the clearance) rather than one uniform deck —
an earlier flat 24.5 build cleared everything but visually dominated the
town. Clearance is verified against `ALL_TYPES` only, since retired entries
(`cityHall`, `post`) can never actually be built.

**Camera.** WASD/arrow keys pan the camera, routed through the same
`clampTarget()` pan limit as mouse panning and disabled during cinematics.
After a building finishes, the construction hold now frames its **front**
(azimuth derived from `lot.entrance`, falling back to `lot.rot`) so the signage
and entrance are readable before the camera returns home.

**Traffic.** Pedestrians and vehicles yield to each other without deadlocking.
Four causes were fixed after the first attempt still hung for ~11s in the live
game: the vehicle rollback path bypassed the yield timeout; momentary predicate
gaps reset the wait history; blocked landmark routes returned failure forever
instead of re-routing; and — the subtle one — **yield timers ran on the clamped
simulation `dt`**, so on a slow machine a 1.8s timeout stretched to 8-12s of
wall-clock. Safety watchdogs now run on wall-clock time, vehicle wait history
persists until the vehicle physically moves, and wedged walkers re-route.
Verified in the live game (not just a harness) at max load: worst
`car:YIELDING` stall 11.0s → 1.5s, `ped:toEntrance` 7.0s → gone, with
169,260 sampled pedestrian/vehicle pairs showing zero interpenetration.

**Rice paddies** contain only rice. `createPaddies` previously received a
read-only `isBlocked` predicate and never registered its plots, so the later
scenery and tree passes dropped houses and trees on top of them; committed
plots are now reserved in the shared occupancy map. Plots are tested as
rectangles rather than as an undersized circle, which had let corners of the
larger fields lie in diagonal country lanes. A later round then pushed
the parcels outward into the same ring as the fields, which rejected 21 of 22
plots and left one visible paddy; the fields and country lanes were moved out
to the open land beyond the parcels, restoring all nine sites (25 committed
plots, 126 meshes).

**Pedestrian continuity.** Two long-standing faults were fixed. Junctions are
now traversed with an explicit connector that preserves the signed lateral side
through reversals — previously `continueFrom()` swapped edge, direction and
offset in one step, teleporting walkers up to 19.5 units when the legitimate
per-frame maximum is 0.125. Landmark visit routes store their exact origin, so
the return leg no longer stops short and resume from `homeNode`. Surplus
pedestrians are now marked `retiring` and walk out of the network before being
pooled; previously a population drop set `visible = false` on arbitrary agents
where they stood, which made roughly nine people vanish in view at the Phase 2
transition (the finale's 1.35x boost is not applied to `tour`). Verified live at
full load: **zero** impossible jumps in 30s, and a 40% population drop produced
zero instant hides.

Note the QA cost of this class of bug: `.ai/measure-live-traffic.mjs` treated
any displacement over 0.08 as successful movement, so a teleport *reset* its
stall counter. A harness cannot verify continuity unless it compares each
agent's per-frame displacement against that agent's own speed.

---

## Deliberately held back

- **Landmark activity animations** exist (`systems/activities.js`, 13
  parameterised handlers) but are **not triggered** in phase 2 or phase 3.
  The registry data and the trigger call site are in place for a later pass.

---

## Known gaps

- **Real-voice lip sync is unverified.** Capture and playback were tested with
  Chromium's synthetic microphone; how the mouth reads against actual child
  speech has not been observed.
- **Chromebook performance is unmeasured on real hardware.** The budget work is
  in place (four draw calls for all roads, instanced trees, pooled/capped
  skinned agents, mixer distance throttling, capped pixel ratio, one automatic
  quality drop), with only synthetic headless timing available so far.
- **Speech recognition needs Chrome/Edge and an internet connection.** Firefox
  and Safari fall back to typing.

---

## Layout

```
src/
  config/     lessons · town · landmarks · activities · progression
  core/       tween · rng · materials
  world/      terrain · roads · graph · scenery · sky · props · characters · characterModels
  buildings/  index (asset priority) · procedural (original 8) · extras
  systems/    cameraRig · speech · recorder · construction · pedestrians ·
              vehicles · particles · audio · choices · tour · tourRecords ·
              guidedTour · portrait · activities · finale · explore ·
              progression · unlockReveal
  ui/         hud
```

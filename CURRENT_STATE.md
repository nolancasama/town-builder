# CURRENT_STATE.md — Matsubara Town

Implementation state. See `PROJECT_DESIGN.md` for the rules this follows.

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
- **Chromebook performance is unmeasured.** The budget work is done (four draw
  calls for all roads, instanced trees, pooled agents, capped pixel ratio, one
  automatic quality drop) but no run on real hardware.
- **Speech recognition needs Chrome/Edge and an internet connection.** Firefox
  and Safari fall back to typing.

---

## Layout

```
src/
  config/     lessons · town · landmarks · activities · progression
  core/       tween · rng · materials
  world/      terrain · roads · graph · scenery · sky · props · characters
  buildings/  index (asset priority) · procedural (original 8) · extras
  systems/    cameraRig · speech · recorder · construction · pedestrians ·
              vehicles · particles · audio · choices · tour · tourRecords ·
              guidedTour · portrait · activities · finale · explore ·
              progression · unlockReveal
  ui/         hud
```

Implemented the full change set while preserving the prior QA work and leaving `CURRENT_STATE.md` untouched.

### A — Visual fixes

- Removed bank columns, fixed lot-patch depth separation, removed the ambiguous school track ring, leveled swing seats during motion, and rotated station benches toward the tracks.

### B — Railway and intersections

- Extended the elevated railway across the full 230-unit map and raised it to `DECK_Y = 24.5` with repositioned, collision-aware supports.
- Added static lot-conflict safeguards where neighboring pads cannot safely be occupied together.
- Preserved train animation and `userData.train`, `deckY`, and `callTrain` contracts.

### C — Sidewalks and traffic

- Added merged 1.6-unit perimeter sidewalks and entrance spurs to every lot, preserving original building dimensions through separate build-pad sizes.
- Pedestrians now route along roads, entrance spurs, and lot perimeters; shared occupancy checks prevent building entry.
- Added predictive pedestrian/vehicle yielding and proximity checks, including junction rollback for vehicles.

### D — New features

- Added a pre-game name screen. Blank input defaults to Ken; names are trimmed, normalized, capped at 20 characters, and safely propagated through house cards, signs, sentences, tours, hints, and keywords.
- Added camera-relative WASD/arrow panning at 24 units/second, using the existing pan clamp and disabling itself during cinematics.

### Judgment calls

- Removed the school ring entirely because its available yard was too small for a legible running track.
- Railway underside is at `y = 23.4`, giving 2.25 units of clearance above the measured 21.15-unit tallest non-station landmark.
- Replaced the now-impractical station staircase with a compact enclosed lift/stair core.
- Empty-lot patches use 0.018-unit successive height offsets.

### Verification

- `npm run build`: passed, 48 modules transformed.
- Real eight-landmark choice → fast-forward speech → construction → finale playthrough: passed, zero browser errors.
- Four representative 10-building towns/40 models: zero Box3 overlaps.
- Railway checked against 382 landmark/lot placements and 16 track components: zero intersections.
- Maximum-load 70-pedestrian/26-vehicle simulation: zero footprint intrusions or unsafe proximity samples.
- Camera pan, clamp, cinematic lockout, and custom-name propagation: passed.

### Visual evidence

- Undeveloped lot: [angle A](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/undeveloped-lot-angle-a.png>) · [angle B](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/undeveloped-lot-angle-b.png>)
- [School yard](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/school-yard.png>)
- [Swings mid-motion](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/playground-swings-mid-motion.png>)
- Railway: [castle clearance](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/railway-castle-clearance.png>) · [map overview](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/railway-map-overview.png>)
- [Pedestrian on school sidewalk](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/pedestrian-school-sidewalk.png>)
- [Name-entry screen](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/name-entry.png>)

One non-code artifact remains: `.ai/chrome-root`, an untracked Chrome QA profile. Sandbox policy blocked its recursive cleanup; it is not referenced by the game.
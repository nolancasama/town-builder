Implemented both Round 3 workstreams.

### Part 1 — Sidewalk scope

- Undeveloped lots now retain only gravel/dirt dressing; no perimeter sidewalk is created at world initialization.
- A 1.6-unit perimeter sidewalk is added when landmark construction settles and removed during “Play Again.”
- Added targeted minimum lot sizes for the hospital, bus station, and gas station to prevent undersized placements.
- No map expansion was needed: all reserved lots remain within the flat terrain, and the clearance audit found zero structural building/sidewalk intersections across 348 eligible placements.
- Exhaustive testing of 46,080 valid occupancy states leaves at least 20 placeable landmark types before build 10, so a normal target-10 game cannot dead-end.

Judgment call: kept the existing world dimensions because larger dynamic sidewalk envelopes would intrude into roads. Remaining sidewalk contacts are intentional low paving, steps, or narrow decorative poles—not building walls.

### Part 2 — Opening scene

- Added a roughly 16-second scripted intro after name entry and before the first choice cards.
- Uses the existing cinematic camera, subtitle panel, and character pose system.
- Added a distinct orange-jacketed town local in `lot-east-big`; he is visible in the establishing shot, gestures through all seven dialogue beats, and is removed before gameplay.
- The entered name is interpolated into the dialogue; the intro builds no landmarks.
- Added `?skipIntro=1` for development iteration.

Judgment call: the medium camera looks west across the undeveloped field so the NPC remains readable with the sparse town behind him.

### Verification

- `npm run build`: passed, 49 modules transformed.
- Fresh `?dev=1&target=1` flow: name entry → full intro → three choices → construction → finale.
- Result: one real landmark and one matching developed-lot sidewalk; opening NPC removed.
- Console/page errors: zero.
- `CURRENT_STATE.md` was not changed during this round.

Screenshots:

- [Undeveloped lot without sidewalk](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/undeveloped-lot-no-sidewalk.png>)
- [Developed lot with sidewalk](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/developed-lot-sidewalk.png>)
- [Opening wide establishing shot](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/opening-wide-establishing.png>)
- [Opening medium dialogue shot](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/opening-medium-dialogue.png>)
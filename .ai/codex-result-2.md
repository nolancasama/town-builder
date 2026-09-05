Implemented all four corrections.

1. Railway

- Replaced the flat 24.5-unit deck with a localized profile: 6.2 at map ends, 11.0 over the southern clearance area, 11.2 at the station, and 17.2 only over the northeastern lots.
- `userData.deckY` is now 11.2; trains follow the slopes. Piers are slimmer at 2.2 × 1.8.
- Verification now uses only `ALL_TYPES` and mesh-level world `Box3`s, avoiding false collisions caused by whole-building empty space. Result: 0 overlaps across 336 eligible landmark/lot placements.

Evidence: [overview](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/railway-map-overview.png>), [actual castle clearance](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/railway-castle-clearance.png>).

2. Playground swings

- Corrected the support-leg angles so the static frame forms stable A-shapes.
- Only chains and seats animate; seats counter-rotate to remain level.

Evidence: [rest](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/playground-swings-rest.png>), [mid-motion](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/playground-swings-mid-motion.png>).

3. Undeveloped-lot wedge

- The junction asphalt disc extended 0.5 units beyond the carriageway. Its radius now ends exactly at the road edge, preventing intrusion inside the lot sidewalk.

Evidence: [corrected lot angle](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/undeveloped-lot-angle-a.png>).

4. Placement reachability

- Exhaustively checked 49,844 reachable target-10 placement states; none can get stuck before the tenth build.
- All 33 types are initially placeable. A literal 33-build single town remains intentionally impossible because there are only 17 one-use lots; a “full sweep” must build types across fresh towns.

Verification:

- `npm run build`: passed.
- Representative geometry: 40 models across four towns, 0 building overlaps.
- Railway: 336 `ALL_TYPES` placements, 0 intersections.
- Fresh `?dev=1&target=8` playthrough reached the finale in 146.4 seconds with 0 console errors. [Report](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/playthrough-verification.json>).
- `CURRENT_STATE.md` was left untouched during this correction round.
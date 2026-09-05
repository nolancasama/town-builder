Implemented all five Round 4 items.

1. Traffic deadlock

- Sidewalk pedestrians no longer block cars; only walkers entering the carriageway are considered.
- Stopped, tangential, and receding vehicles no longer trigger pedestrian yielding.
- Added deterministic 1.8-second deadlock breakers for both systems.

300-second fixed-step test at 70 pedestrians and 26 vehicles:

- Before: 299.97-second worst continuous stall.
- After: 2.27 seconds.
- Minimum pedestrian/vehicle separation: 1.459 units.
- Penetrations below 0.65 units: zero.

2. Straight railway

- Railway is completely level and straight at world `X = 45.8`, spanning `Z = -115…115`.
- Constant `DECK_Y = 11.2`; train roll and track slope are zero.
- Reserved the station lot and constrained tall landmarks on two northeastern lots instead of raising the entire railway.
- `ALL_TYPES` audit: deck underside `10.4`, tallest permitted underlying geometry `9.755`, clearance `0.645`.
- Train animation and `train`/`deckY`/`callTrain` contracts remain intact.

[Railway overview](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/railway-straight-overview.png>)

3. Construction camera

- Final construction framing now derives an explicit azimuth from `lot.entrance`, with `lot.rot` as fallback.
- School, library, and hospital all measured an exact entrance-facing dot product of `1.0`.

[School front](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/construction-front-school.png>)  
[Hospital front](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/construction-front-hospital.png>)

4. Manual intro dialogue

- All seven beats now wait for click or Space.
- Added a quiet `▼ click or space` affordance.
- Held-key repeats are ignored, Space is captured before reaching focused controls, and beat two waits for both input and the camera push.
- Verified all seven beats separately using Space and pointer input, including an injected repeat-key event.
- `?skipIntro=1` remains unchanged.

5. Paddy clearance

- Each paddy plot is registered in shared occupancy only when actually committed.
- Later houses, shops, trees, bicycles, and other scenery therefore avoid those exact plots.
- Audit: 149 scenery/tree objects against seven committed paddy plots, zero intrusions.

[Paddy clearance](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/paddy-clearance.png>)

Verification:

- `npm run build`: passed, 49 modules.
- Complete Phase 1 → Phase 2 → Phase 3 browser playthrough reached `guided-end`.
- Console/page errors: zero.
- 50,000 randomized target-10 placement runs: zero dead ends.
- `CURRENT_STATE.md` was left untouched.
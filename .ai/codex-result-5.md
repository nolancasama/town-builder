The live-game deadlock is now fixed. I reproduced the failure before editing, including 12.5-second car stalls and 15-second `toEntrance` stalls.

### Root causes fixed

- The vehicle rollback path bypassed the timeout, while momentary predicate gaps reset its history.
- Yield timers used capped simulation `dt`, making 1.8 seconds stretch to 8–12 wall-clock seconds under low FPS.
- Blocked landmark routes returned `false` indefinitely without re-routing.
- Idle and vehicle-stop timers could similarly dilate under low FPS.

Vehicle wait history now persists until physical movement occurs. After 1.8 wall-clock seconds, deterministic priority remains active until the vehicle travels 3.2 units. Pedestrians remain at their safe sidewalk position during that clearance.

Blocked visitors rejoin the nearest sidewalk, while a 1.25-second watchdog relocates any other wedged walking pedestrian.

### Live before/after measurement

Four built landmarks, 70 pedestrians, 16 cars, 10 bikes; 500 ms samples for 45 seconds, tracked by object UUID:

| Cause | Before | After |
|---|---:|---:|
| ped:visiting | 7.0s | 7.0s — legitimate |
| ped:idle | 3.5s | 3.5s |
| ped:walking | 7.5s | 2.0s |
| car:YIELDING | 12.5s | 2.0s |
| bike:YIELDING | 13.5s | 2.5s |
| ped:YIELDING | 1.5s | 1.5s |
| car:driving-or-stopTimer | 1.5s | 1.5s |
| bike:driving-or-stopTimer | 1.0s | 1.5s |
| ped:returning | 1.0s | 0.5s |
| ped:toEntrance | 15.0s | 0.5s |

Collision safety:

- Before minimum separation: 1.470 units.
- After minimum separation: 1.534 units.
- Samples below the 0.65 penetration threshold: zero.

Evidence: [before measurement](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/traffic-live-before-round5.json>) and [after measurement](</C:/Users/nolan/recipe-tester/town-builder/qa-evidence/traffic-live-after-round5.json>).

Verification:

- `npm run build`: passed, 49 modules.
- Complete Phase 1 → Phase 2 → Phase 3 playthrough reached `guided-end`.
- Console/page errors: zero.
- Production changes were limited to [pedestrians.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js>) and [vehicles.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/vehicles.js>).
- Items 2–5 and `CURRENT_STATE.md` were left untouched.
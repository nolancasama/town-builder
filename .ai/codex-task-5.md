# Round 5 — the traffic deadlock is NOT fixed in the live game

Items 2-5 from last round verified good on my side: the railway is straight and
level and terminates exactly at the terrain edge (measured: track Z −115→115,
terrain Z −115→115), the construction camera lands on the building front, the
paddies are clear, and the intro dialogue correctly waits for click/Space with
no auto-advance. Leave all of that alone.

Item 1 is still broken. Your harness reported a 2.27s worst-case stall, but the
**live running game still deadlocks for over 11 seconds**.

## My measurement

I instrumented the actual game (not a separate harness): built 4 landmarks,
forced max load via `pedestrians.setPopulation(70)` /
`vehicles.setTraffic(16, 10)`, then sampled every agent's world position every
500ms for 45s, tracking per-object identity (not array index), and attributed
each continuous stationary run to a cause using the `userData.yielding` /
`userData.motionState` flags the systems already publish.

Worst continuous stationary time, by cause:

```
  11.5s  ped:idle                    <- idle state is rng.range(1.2, 4)
  11.0s  car:YIELDING                <- THE BUG. breaker claims 1.8s
   7.0s  ped:toEntrance              <- a *walking* state, should not be still
   5.5s  car:driving-or-stopTimer    <- stopTimer maxes at 2.4s
   2.5s  ped:YIELDING                <- fine (1.8s breaker + 0.5s sampling)
```

`ped:YIELDING` at 2.5s shows the pedestrian-side breaker works. Every other row
exceeds what its own state's designed duration allows:

- **`car:YIELDING` 11.0s is the headline failure.** Cars sit in the yielding
  state roughly 6x longer than the 1.8s breaker should ever permit. This is the
  pileup the user is seeing. Either the car-side breaker isn't firing, it's
  being reset every frame before it can accumulate (e.g. the timer is cleared
  on any frame the yield condition momentarily clears, or it's stored on a
  variable that gets reinitialised), or the rollback path in `advance()` sets
  `v.yielding = true` on a path that bypasses the breaker entirely.
- **`ped:toEntrance` 7.0s**: `toEntrance` is a *walking* state — a pedestrian in
  it should be moving toward the entrance. Standing still for 7s means
  something is blocking that path without any state transition (possibly the
  new built-lot occupancy check rejecting every step, leaving it wedged).
- **`car:driving-or-stopTimer` 5.5s** and **`ped:idle` 11.5s** both exceed their
  designed maxima (2.4s and 4s). These may be repeated re-entry into the same
  state rather than one long hang — worth confirming rather than assuming.

## What to do

1. **Reproduce it in your harness first.** Your fixed-step harness reported
   2.27s while the live game shows 11s, so the harness is not modelling real
   conditions — most likely it omits the pedestrian `toEntrance`/`visiting`
   attraction behaviour (which parks pedestrians near lot entrances beside the
   carriageway) or doesn't run with landmarks built. Make the harness reproduce
   the 11s figure before changing any logic; otherwise you're tuning blind
   again.
2. Fix the car-side breaker so no vehicle can remain in `yielding` beyond its
   timeout under any code path, including the position-rollback path.
3. Investigate the `toEntrance` stall — a pedestrian in a walking state must
   never be stationary for multiple seconds; if its path is blocked it should
   re-path or transition state rather than wedge.
4. Confirm whether the `ped:idle` and `car:driving-or-stopTimer` overruns are
   repeated legitimate re-entry or genuine hangs, and fix if genuine.

## How to verify

Re-run **my** measurement methodology against the live game, not only your
harness, and report the same attributed table before and after. Target: no
cause exceeds a few seconds except states that are legitimately long by design
(`ped:visiting` is `rng.range(3, 8)` and is expected to be still — it did not
appear in my sample as a top offender, but if it shows up in yours, label it
rather than counting it as a stall).

Do not weaken the actual collision avoidance to make the numbers pass:
pedestrians and cars must still never pass through each other. Report the
minimum pedestrian/vehicle separation alongside the stall numbers so I can see
both together.

## Constraints

Don't regress items 2-5, the sidewalk scope, the opening scene, name entry, or
WASD panning. `npm run build` must pass and a full playthrough must have zero
console errors. Leave `CURRENT_STATE.md` alone.

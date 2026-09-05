## 1. Observed evidence

The symptoms are not exclusively one fault:

- Recurring stutter exists with no vehicles, attractions, pooling, or rerouting. Running the production movement modules with 70 walkers produced 348 impossible single-frame jumps over 0.2 m; median 2.16 m, maximum 11.17 m. The maximum legitimate clamped-frame movement is 0.125 m.
- Landmark routing produced 201 return jumps, median 16.37 m and maximum 28.76 m.
- A max-load traffic run tracked one UUID snapping backward 2.79 m, waiting exactly 1.8 wall-clock seconds, then jumping 89 m to a random road. Visually, that is precisely “stutter, then disappear.”
- The deadlock timing has not regressed: pedestrian and vehicle files are byte-identical to the accepted post-fix backup. Watchdogs still use `performance.now()`; only movement uses clamped `dt`.
- Pool objects are never reissued while active. Pool shrink can hide an agent, but it is a separate, phase-dependent path.

The existing traffic harness missed this because any displacement over 0.08 m—including an 89 m teleport—is treated as successful movement and resets the stall counter ([measure-live-traffic.mjs](</C:/Users/nolan/recipe-tester/town-builder/.ai/measure-live-traffic.mjs:69>)).

## 2. Ranked probable causes

1. **Ordinary junction traversal is discontinuous — very high confidence.**  
   [`continueFrom()`](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:375>) swaps edge, direction and lateral offset without traversing the junction; [`pointOn()`](</C:/Users/nolan/recipe-tester/town-builder/src/world/graph.js:58>) writes the new sidewalk position next frame. Dead-end reversal flips the lateral basis, producing 6.5–11.8 m cross-road jumps. This predates the deadlock work. It explains general stutter but not an actual visibility change. Confirm live by observing `walking → walking` displacement spikes at nodes.

2. **Visit routes omit their origin — very high confidence.**  
   [`makeVisitRoute()`](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:173>) starts beyond the home sidewalk. The reversed route therefore stops short, then [`returning`](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:651>) resumes from `homeNode` as if physically there, causing 10–29 m jumps. This is absent from the committed baseline and belongs to the newer landmark-routing work. It only applies after visits; a disappearance without prior `returning` would disprove it for that event.

3. **Deadlock recovery deliberately teleports visible walkers — high confidence, frequency traffic-dependent.**  
   [`yieldToTraffic()`](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:313>) snaps to a potentially stale safe point; after 1.8 seconds a visitor calls `placeOnRandomEdge()`. Walking reversals also fail to negate lateral, jumping across the road. The 1.25-second motion watchdog has similar relocation paths ([pedestrians.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:484>)). This is the strongest single explanation for the reported sequence. Repeated rerouting is not supported: reroute clears the route and stall history in one pass.

4. **Population downscaling hides arbitrary pooled agents — low-to-medium confidence.**  
   [`setPopulation()`](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:513>) immediately sets `visible=false` on excess agents. Phase 1 only grows, so this cannot explain recurring build-phase disappearances. However, finale population is boosted and the first accepted Phase 2 answer recomputes the smaller target ([main.js](</C:/Users/nolan/recipe-tester/town-builder/src/main.js:466>)), potentially popping several walkers.

## 3. Possible solutions

- **Junctions:** add a short connector waypoint/state between incoming and outgoing sidewalks, preserving signed lateral side on reversals. This fixes the geometry rather than masking the jump. Blast radius: pedestrians and possibly a small graph helper. Cost remains O(1) per transition and O(agents) per frame. Main risk is ensuring connectors participate in existing crossing/yield checks.

- **Visits and recovery:** store the exact starting edge/t/direction/lateral as route origin, reverse back to it, and only then resume ordinary walking. Replace random relocation with a visible turn-back or connector to the last safe sidewalk. Keep every watchdog on wall-clock time and retain vehicle distance-priority. Cost is a few waypoints per visitor; no additional all-pairs work.

- **Population shrink:** mark excess walkers as retiring and route them to authored network exits before pooling. This temporarily keeps some agents rendered longer but requires no new allocations or higher maximum population.

The upcoming perimeter-ring removal matters. Current routes explicitly use `ring` and `visit` points ([pedestrians.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:135>)). Replace that with a shared road-sidewalk → surviving entrance spur/frontage → door point → exact reverse calculation. Removing geometry alone leaves stale route coordinates.

## 4. Recommended solution

Implement one continuous pedestrian path model:

1. Explicit junction connectors with signed-side continuity.
2. Exact reversible origins for landmark visits.
3. Watchdog recovery through those connectors—never random relocation while visible.
4. Graceful egress before population pooling.

This fixes the root causes while preserving wall-clock watchdogs, yielding, collision separation, pooling, and Chromebook-scale O(agent) cost.

## 5. Relevant files/systems

- Primary: [pedestrians.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/pedestrians.js:173>)
- Graph coordinates/transitions: [graph.js](</C:/Users/nolan/recipe-tester/town-builder/src/world/graph.js:58>)
- Frontage geometry: [roads.js](</C:/Users/nolan/recipe-tester/town-builder/src/world/roads.js:131>), [town.js](</C:/Users/nolan/recipe-tester/town-builder/src/config/town.js:169>)
- Population scaling: [main.js](</C:/Users/nolan/recipe-tester/town-builder/src/main.js:466>)
- Preserve/verify: [vehicles.js](</C:/Users/nolan/recipe-tester/town-builder/src/systems/vehicles.js:110>)
- `world/characters.js` is the separate guided-tour character rig and is not implicated in pooled ambient pedestrians.

## 6. Remaining uncertainties

A rendered browser run was blocked because the read-only sandbox prevents Playwright temporary-profile creation and local port binding. Live confirmation should track each UUID every animation frame, recording displacement, state, yielding, visibility and camera-frustum membership. It should separately test roads-only, ten attractions with max traffic, and the first accepted Phase 2 answer.

No files were changed. No build was run; diagnostics directly executed the current production movement modules.
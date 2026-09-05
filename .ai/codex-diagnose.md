# Diagnose — pedestrians stutter, then suddenly disappear

**READ-ONLY DIAGNOSIS.** Do not edit application source, implement fixes,
refactor, change dependencies, commit, push, or merge. You may read files,
search code, inspect git history and diffs, read logs, screenshots, and test
output, run non-destructive diagnostic commands, and run tests or builds when
that helps reproduce or isolate the problem. Investigate independently.

## Observed symptom

Watching the town during normal play, pedestrians **stutter** — their walk is
not smooth, they hitch or jerk repeatedly rather than moving continuously —
and then a pedestrian **suddenly disappears**, vanishing outright rather than
walking off or fading.

Reported from ordinary gameplay viewing, not from a harness. I have not
established whether the stutter and the disappearance are one fault or two.

## Desired behaviour and intent

Pedestrians should walk smoothly and continuously along roads, entrance spurs
and lot perimeters. The town's liveliness is a reward for building it — the
child is meant to watch an inhabited place. Agents leaving the scene should do
so plausibly (walking out of view / off the road network), never popping out of
existence in the middle of the visible town.

## Reproduction

1. `npx vite --port 4191 --strictPort`
2. `http://127.0.0.1:4191/?dev=1&skipIntro=1`
3. Dismiss the name form. `window.game` is exposed under `?dev=1`; the `b` key
   auto-builds so you can reach a busy town quickly. Liveliness (pedestrian and
   vehicle counts) scales up with each building completed, so the effect should
   be easiest to see near 10 buildings.

Frequency is unknown — it was noticed as a recurring annoyance rather than a
one-off. Whether it correlates with building count, camera position, or a
particular route is exactly the kind of thing worth establishing.

## History — what was already tried, and how it failed

Traffic in this project has one **previous fix that did not hold on the first
attempt**, which is why this is being diagnosed rather than patched.

An earlier round fixed pedestrian/vehicle deadlock. The first attempt's own
harness reported a 2.27s worst-case stall; measuring the *live game* showed
11.0s. Four separate causes were eventually found, and the subtle one matters
here:

> The frame loop clamps delta time (`Math.min(0.05, clock.getDelta())`). Yield
> timers were running on that clamped simulation `dt`, so on a slow machine a
> 1.8s timeout stretched to 8–12s of wall-clock. Safety watchdogs were moved to
> wall-clock time, vehicle wait history was made to persist until the vehicle
> physically moves, and wedged walkers were given a re-route path.

That work is in the tree. Whether the current symptom is a regression from it,
an incompletely-fixed remainder of it, or unrelated, is open.

## Constraints — what must not change

- Do not degrade the deadlock fix. Agents must still yield at crossings without
  wedging, and watchdogs must stay on wall-clock time, not clamped `dt`.
- Performance budget is real: the target is a school Chromebook at 1366×768.
  Agents are pooled and trees instanced deliberately. A fix that smooths motion
  by raising per-frame cost needs to say what it costs.
- Do not "fix" the stutter by removing the yielding behaviour, and do not fix
  the disappearance by simply suppressing despawn — both would hide the symptom.

## Systems that may be involved

Named without selecting a cause, and not an exhaustive or ordered list:
`src/systems/pedestrians.js`, `src/systems/vehicles.js`, `src/world/graph.js`,
`src/world/characters.js`, the agent pool, the route/re-route logic, the
liveliness scaling in `src/main.js`, and the frame loop's clamped delta.

Note that a separate upcoming change will remove the perimeter sidewalk ring
around built landmark plots, leaving only a connection between the building and
the road. If pedestrian routing depends on those lot perimeters, say so — it
affects how the fix should be shaped.

## Hypotheses offered only as things to rule out

**Unverified, not direction.** Both should be tested against the evidence, and
neither should crowd out a cause you find yourself:

- The disappearance could be pool recycling — an agent being returned to the
  pool and reissued elsewhere while still on screen.
- The stutter could be the re-route path from the earlier fix firing repeatedly,
  each re-route resetting motion.

## Report shape

Keep it short and decision-ready. No raw log dumps.

1. **Observed evidence** — what the code and runtime actually show, including
   whether stutter and disappearance share a cause.
2. **Ranked probable causes** (2–4) with confidence, file/line evidence,
   evidence against, and what would confirm or disprove each.
3. **Possible solutions** per leading cause — what changes, blast radius, risks,
   likely regressions, and whether it fixes the root cause or hides the symptom.
4. **Recommended solution** with reasoning.
5. **Relevant files/systems.**
6. **Remaining uncertainties** — anything only a runtime check or the user can
   settle.

If you cannot converge, say what you could not determine and what evidence would
settle it, rather than guessing.

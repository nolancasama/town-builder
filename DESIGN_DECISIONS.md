# Design Decisions

This file records meaningful product, UX, visual, architectural, or behavioral decisions for this project.

For each significant decision, record:

- Date
- What was decided or changed
- Why
- Previous approach, if relevant
- Rejected alternatives, if useful

Only record decisions that may be useful to understand later.

Do NOT record:
- trivial UI adjustments
- routine bug fixes
- formatting changes
- mechanical refactors with no design consequence
- every individual code modification

Git is the source of truth for detailed code-change history.

A useful rule:

> If a future developer or AI could reasonably ask, "Why is it designed this way?", record the answer here.

## 2026-09-05 — Rigged Quaternius crowds with a procedural speaking cast

Ambient pedestrians and guided-tour visitors now use eight selected modern
Quaternius characters and one shared five-clip animation library. The varied
silhouettes, skin tones, hair and clothing make the town feel inhabited while
Walk, Idle and Wave communicate the crowd's state more clearly than pivoted
box limbs.

The tour guide and opening town local deliberately remain on the procedural
rig. Their face, especially the guide's voice-level-driven mouth, is essential
to the lesson and is not present in the Quaternius models.

The accepted cost is a 62-joint skeleton and an `AnimationMixer` per imported
person. To keep that cost bounded on classroom Chromebooks, the ambient cap is
24 (previously 70 at runtime), geometry and untinted materials are shared,
off-screen mixers are skipped, and distant visible mixers update at 10 Hz. The
tour's five to seven mixers use the same visibility and distance budget.

## 2026-09-05 - All NPCs use the skinned cast

All NPCs in normal play now use the skinned Quaternius models, including the
child's guide avatar, the opening town local, tourists, pedestrians, and people
at completed landmarks. The procedural bodies remain only as the asset-load
fallback so the game can still start on unreliable classroom connections.

The world guide and town local trade the old moving mouth for voice-responsive
head and body motion. The portrait guide is the deliberate exception: it uses
the same skinned appearance as the world avatar but adds a simple mouth attached
to the Head bone, because this close-up is shown specifically while the child's
recorded speech plays and the speech must read on the face.

## 2026-09-06 - Blocky Kenney cast replaces the Quaternius one

Every NPC now uses Kenney's Blocky Characters 2.0 (CC0) instead of the
Quaternius cast adopted the day before. The blocky look sits closer to the
toy-town buildings than the semi-realistic figures did, and it is a better fit
for elementary classrooms.

The technical case was decisive. These models are node-animated rather than
skinned: seven nodes and 72 triangles each, against a 62-bone skeleton and
5,776 triangles. That removed the skinned-mesh path, the Draco decoder and the
whole glTF conversion pipeline - the files are shipped exactly as downloaded -
and cut the character payload from 6.2 MB to about 2.3 MB, which matters on
school wifi. With the per-person cost that much lower, the ambient pedestrian
cap went back up from 24 to 48.

Their `head`, `arm-left/right` and `leg-left/right` nodes are what the original
procedural pose helpers already drove, so pointing and head-turning went back to
being direct node rotations.

Nine ordinary townspeople form the common cast. The pack's costumed characters -
zombie, orcs, robot knights, ninja, vampire, pirate - appear as roughly one
ambient pedestrian in twelve, as a surprise on the street, and are never cast as
the guide, the portrait or the opening local: the child's own avatar is always
an ordinary person.

Accepted trade-off: this set is heavily male-presenting, so the crowd reads less
mixed than the Quaternius cast did.

## 2026-09-06 - Reserved ground is rotated, and walkers can always escape it

Two faults were reported: pedestrians stalling in front of some buildings, and
buildings appearing to spill onto the sidewalk.

`Occupancy.addRect` used to snap a lot's rotation to the nearest quarter turn and
keep an axis-aligned box. Twelve of seventeen landmark lots sit at arbitrary
angles, so that box simultaneously reserved open pavement the building was
nowhere near and missed the corners it really occupied. Reserved areas now carry
their true angle and are tested in their own frame.

That alone did not free a stalled walker, because the recovery path could not
make progress: `rejoinNearestSidewalk` targeted the nearest sidewalk point, which
for a pinched walker is the one it is already standing on. The zero-length leg
"arrived" instantly, restored `t` to the same spot, was blocked again next frame,
and ping-ponged forever. Worse, that same call reset the stall clock, so the
watchdog meant to catch exactly this could never reach its threshold. A rejoin
onto the walker's own position now adopts the road directly so the turn-around
takes effect, the stall clock is left to accumulate, and a walker that has
genuinely stalled gets a short window in which the reserved test is waived - the
same escape valve `trafficEscapeTime` already provided for yielding.

The apparent building spill was not oversized geometry: measured against their
own lots, no landmark exceeds its plot. Four lots were simply authored too close
to their road, so the building envelope itself bit 0.27-1.18 m into the sidewalk.
They were nudged back (large-center-north, large-center-south, medium-northwest,
medium-southwest); no lot now intrudes and none overlap each other.

Guard: `.ai/verify-pedestrian-flow.mjs` builds a few landmarks and fails if any
visible walker has not travelled.

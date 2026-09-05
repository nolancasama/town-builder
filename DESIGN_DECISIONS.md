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

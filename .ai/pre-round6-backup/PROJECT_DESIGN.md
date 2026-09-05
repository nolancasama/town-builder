# PROJECT_DESIGN.md — Matsubara Town

Project-specific design rules for this game. Overrides `PROGRAM_UX_DESIGN.md`
and `VISUAL_DESIGN.md` where they differ; falls back to them otherwise.

---

## What this game is

A three-phase speaking game for Japanese elementary classrooms, played on
school Chromebooks at 1366×768.

| Phase | The child says | What their English does |
| --- | --- | --- |
| 1 · Build | *We have a stadium in Matsubara.* | creates the place |
| 2 · Script | *We can watch soccer in the stadium.* | is recorded as their script |
| 3 · Guide | — | becomes the dialogue of their own guided tour |

The spine of the design is `DESIGN_MO.md`'s chain, applied to language:

> **English → action → visible consequence → reinforcement**

Every phase must keep the child's own English visibly causing something.

---

## 1. The town is the reward — never bury it

The completed town is the artifact the child made. Overlays sit *over* it, never
in place of it.

- Modal scrims stay light (~0.24 max) so the town reads through them.
- Panels are floating cards over the world, not full screens.
- No phase ever cuts to a blank or flat background.

## 2. One sentence is the hero

In every speaking state the English sentence pattern is the largest thing on
screen. Recognised speech, Japanese instructions, status text and hints are all
visibly subordinate to it.

## 3. Japanese instructs, English performs

Japanese appears only where it removes confusion about *what to do*:

- one short instruction line in phase 2
- button meanings on the end-of-phase panels

Japanese never restates the English pattern that is already on screen, and never
appears during the phase 3 cinematic — that phase exists to replay the child's
English.

## 4. Cinematics are rationed

Three tours of the same ten places would make all three feel routine
(`VISUAL_DESIGN.md` §32).

- **Phase 1 finale** — establishes the *finished town as a whole*: rise, orbit,
  one lap of the most spectacular building, aerial. It does **not** visit each
  landmark; phases 2 and 3 do that with meaning.
- **Phase 2** — visits each landmark because the child is about to speak about it.
- **Phase 3** — visits each landmark because the group physically walks there.

## 5. Speech failure is never a dead end

Recognition is the game's problem, not the child's.

- Every failure names its actual cause and offers the typing route.
- Skip is always present in phase 2; every place must be *visited*, no place
  must be *answered*.
- Matching stays deliberately forgiving. **Do not tighten it as polish.**

## 6. Held-back animations

Landmark activity animations (the stadium game, the arriving train, the turning
Ferris wheel) are **not** triggered in phase 2. Phase 2 records; phase 3
presents. The trigger architecture stays in place for a later phase 3
enhancement, invoked from the activity registry, never from speech code.

## 7. The guide is the child

The phase 3 guide and the speaking portrait are the same character built from
one appearance spec. The portrait exists because in-world lip movement is
invisible at gameplay distance — it is an additional presentation layer and the
world avatar keeps its own gestures.

- Portrait occupies 27–34% of screen width, on whichever side the landmark is not.
- It enters and leaves in ~200 ms, holds across both sentences of a stop.
- Mouth movement is driven by the amplitude of the child's actual recording,
  auto-levelled so a quiet child still reads clearly. Never a looping talk cycle.

## 8. Their voice is the priority audio

While a recording plays: town ambience ducks, tourists only look and listen, no
effects fire. Reactions, shutters and applause come *after* the sentence.

## 9. Visual system

- Radii: `--radius-sm` 15px (chips, small controls) · `--radius` 22px (panels) ·
  `--radius-lg` 26px (modal cards) · 999px (pills). Nothing else.
- One shadow token, one font stack, one accent (`--accent` / `--accent-deep`).
  The accent marks the *action* — microphone, primary button, the target word —
  and nothing else.
- Settings chrome (mute) dims to 35% during cinematic phases rather than
  disappearing, so it stays reachable without competing.

## 10. Classroom legibility beats screen real estate

Text and controls are sized to be read across a classroom at 1366×768. Do not
shrink UI to expose more of the 3D scene.

# Round 3 — two parts: revise sidewalk scope, and add an opening narrative scene

Two independent pieces of work. Split across subagents if that's cleaner —
they touch mostly-disjoint files (sidewalks: `world/scenery.js`,
`world/roads.js`, `world/index.js`, `config/town.js`; opening scene: mostly
new code plus a small hook in `main.js`).

---

## Part 1 — Sidewalks are over-built; revise the scope

After seeing the last round's screenshots, the actual direction is: **sidewalks
should only exist next to roads and next to developed (built) lots.**
Undeveloped/vacant lots do **not** need a perimeter sidewalk at all — remove
that requirement. This replaces what I asked for in the first round (every
lot, developed or not, getting a full perimeter loop) — that was the wrong
scope; the corrected rule is:

- Road-adjacent sidewalks: unchanged, keep what already exists in
  `world/roads.js`.
- A **built landmark** gets a sidewalk around/at its perimeter (so pedestrians
  visiting it stay off the building footprint — this is the part that
  actually mattered from the original request), connecting naturally to the
  nearest road sidewalk.
- An **undeveloped lot** should go back to just its gravel/dirt dressing
  (`createLotDressings` in `world/scenery.js`) with no perimeter sidewalk
  ring — remove that geometry for the unbuilt case, or don't generate it
  until the lot is actually built (whichever fits the existing "lot built ->
  swap dressing for the real building" flow better, likely in
  `buildLandmark`/`runConstruction` — check how the construction sequence
  already clears lot dressing when a building goes up, and hook the sidewalk
  generation there instead of at world-init time for every lot).
- **Grow lot sizes and the map if that's what it takes to fit things
  properly.** You have explicit permission to enlarge `LANDMARK_LOTS` sizes
  in `config/town.js` beyond what you already did, and to enlarge
  `WORLD.size`/`WORLD.flatRadius`/`WORLD.hillRadius` in the same file if a
  bigger world is needed to comfortably fit larger lots without crowding the
  road network or other lots. Don't be conservative about this — a
  building's footprint plus a real sidewalk plus reasonable clearance to the
  next lot should never feel cramped. Small, deliberate growth is fine; you
  don't need to preserve the exact current map footprint.

Re-verify: an unbuilt lot should look like it did originally (gravel/dirt,
no sidewalk ring) except without the z-fighting bug from earlier; a built
lot should have a sidewalk connecting it to the road, with the building not
overlapping it. Screenshot one of each.

---

## Part 2 — Opening narrative scene (new feature)

Add a short scripted opening scene that plays once, immediately after the
existing name-entry screen and before normal Phase 1 gameplay begins.

**Do not touch the name-entry screen itself** — it's finished and correct as
implemented. The hook point is in `src/main.js`: the `nameForm` submit
handler currently does

```js
configureHouseOwner(playerName.value);
nameEntry.remove();
loading.classList.remove('hidden');
game.init().catch(...);
```

and `Game.init()` currently ends with `this.progression.startRun(TARGET);
this.offerChoices();`. Insert the new scene so it plays after `init()` has
built the world/camera/etc. but *before* `offerChoices()` first shows the
building-choice cards — i.e. the world exists and is visible, but the normal
Phase 1 UI doesn't appear until the scene finishes. Thread the entered name
(`playerName.value`, already available in `main.js` at the point `game.init()`
is called) through to wherever the scene needs it.

### What happens, in order

1. **Wide establishing shot.** One static (or nearly static) wide camera view
   of the whole town as it exists at game start — reuse the existing
   `CAMERA.start`/home framing or something close to it; don't invent a new
   camera language. Hold for a beat (roughly a second or two) with no
   movement — the player should register "this town is pretty empty" before
   anything else happens.

2. **An NPC is already standing in an empty field/lot**, visible (small, at
   this distance) from the very start of the shot — not introduced by
   walking on screen or fading in. Build this character using the existing
   character toolkit in `src/world/characters.js` (`buildBody`, the pose
   helpers `poseTalk`/`poseIdle`/`poseLook`/`posePoint`, etc. — the same
   system the Phase 3 guide and tourists use). **Don't reuse `makeGuide`**
   specifically — that look (cap, flag, satchel) is the player's own Phase 3
   avatar identity and reusing it here would blur that later payoff. Either
   adapt `makeTourist` or compose a new small variant from the same
   primitives (own clothing/colors) so this NPC reads as a distinct local
   character. Give him an energetic idle (arms gesturing, hands-on-hips,
   pointing) — the pose helpers already support pointing (`posePoint`) and
   looking toward a target (`poseLook`); lean on those rather than inventing
   a new animation system for one scene.

3. **Dialogue begins while still in the wide shot.** Reuse the existing
   subtitle/dialogue panel visual language (see `#tour-subtitle` /
   `#subtitle-speaker` / `#subtitle-text` in `index.html`, and
   `hud.showTourSubtitle(text)` / `hud.hideTourSubtitle()` in
   `src/ui/hud.js`) — either drive that exact panel (relabeling the speaker
   if needed) or add a near-identical small panel if reusing it directly
   conflicts with Phase 3's own state management; match its look either way,
   don't invent a different dialogue UI. No audio is required — the NPC has
   no recorded voice (unlike the Phase 3 guide, which plays back the child's
   own recordings) — written dialogue lines are sufficient on their own,
   shown one beat at a time with a short pause between beats.

   Dialogue (Osaka-ben; `{name}` = the entered player name, defaulting to
   "Ken" the same way the rest of the game already does):

   - 「おーい！{name}！」
   - 「見てみぃ！なんやこの町！」— NPC gestures broadly at the town
   - 「建物、ぜんぜん足らへんやん！」— points toward empty/undeveloped lots
   - 「{name}、英語使えるんやろ？」— turns attention to the player/camera
   - 「ほな、英語で建物つくってみぃ！」
   - 「たとえばな…… "We have a stadium in Matsubara." や！」
   - 「ほな、頼んだで！」

   Keep each beat short and on screen only briefly (this whole scene should
   be quick — a handful of seconds per line, not a visual novel). **Do not
   build the example stadium** — that sentence is spoken as an example only;
   no construction sequence runs during this scene. The first real building
   only happens through normal gameplay after the scene ends.

4. **Camera push after the first beat or two** — smoothly move from the wide
   establishing shot to a medium shot centered on the NPC (use the existing
   cinematic camera pattern: `rig.beginCinematic()` / `rig.flyTo(position,
   target, duration, ease)`, the same technique used for the finale and
   guided-tour camera work in `systems/finale.js` / `systems/guidedTour.js`
   — don't hard-cut, and don't build a separate camera system). End framed so
   the NPC's gestures are clearly readable, with visible empty town behind
   him — he should be standing in an obviously undeveloped lot, and that lot
   should be visible in this framing since it's the visual punchline for
   "buildings, we don't have any."

5. **Scene ends cleanly.** After his last line: hide the dialogue panel,
   smoothly return the camera to the normal starting position (reuse
   `rig.returnHome()`), and go straight into the existing `offerChoices()`
   flow with the normal three building cards. No "Continue" button, no
   confirmation screen, no extra menu — dialogue ends, camera settles, Phase
   1 UI appears.

6. **After the scene, the NPC does not drive gameplay.** He can simply
   remain in the world as an inert background character (no continued
   dialogue, no reappearing after builds, no tutorial commentary) or you may
   have him walk off if that's a natural fit with the existing pedestrian
   system — either is fine. He must never interrupt Phase 1/2/3 again.

### Constraints

- Keep this scene brief — a handful of dialogue beats, not a long cutscene.
  It should not meaningfully delay getting to the actual game.
- Reuse existing systems throughout (camera rig's cinematic/flyTo pattern,
  the character-building toolkit, the subtitle panel) rather than building
  parallel new ones — this keeps the scene consistent with everything else
  and is significantly less code.
- The Japanese dialogue here is the NPC's actual voice/personality, not an
  instructional aid — that's a deliberate exception to the general "don't
  duplicate the English pattern in Japanese" rule elsewhere in this project;
  don't strip it down to just English.
- Respect `?dev=1` conventions if practical (e.g. don't make the scene
  unskippable in a way that blocks fast iteration/testing — a `?skipIntro=1`
  style param or checking `DEV` to shorten pauses would be reasonable, but
  isn't required if it adds meaningful complexity).
- Don't touch Phase 2/3, unlocking, or anything downstream of Phase 1 start.

### Verification

- A fresh load → name entry → confirm → the new scene plays in order (wide
  shot, NPC visible, dialogue beats appear with the entered name
  interpolated correctly, camera push, final line, clean return) → normal
  three-card choice screen appears, with no stadium built.
- No console errors through that whole sequence.
- Screenshot: the wide establishing shot (with the tiny NPC visible
  somewhere in frame), and the medium push-in shot with a dialogue line
  showing.

---

Keep `CURRENT_STATE.md` untouched, same as before. In your result, tell me
what you did for each part, any judgment calls, and give me the usual
build/console-error confirmation plus the screenshots.

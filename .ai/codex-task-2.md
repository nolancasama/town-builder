# Correction round — the railway height is a severe overcorrection, plus two smaller regressions

I reviewed the diff and the result, and independently re-verified visually
(not just from your own screenshots). Most of the change set (bank columns,
lot-patch z-fighting fix, station bench orientation, sidewalks, name entry,
WASD) looks right. Three things need fixing before this is done.

## 1. Railway height (`DECK_Y = 24.5`) is far too tall — this is the priority

Your own `railway-map-overview.png` and `railway-castle-clearance.png` show
why: the viaduct now towers over the entire town at a scale wildly out of
proportion with everything else (most buildings are 5-12 units tall). This
breaks the game's core visual rule (see `PROJECT_DESIGN.md`) that the town
itself is the thing the child should be looking at — right now the track
dominates and flattens everything else into insignificance. This is an
objective visual regression, not a matter of taste.

I independently measured every **actually-buildable** landmark's real height
(built each one via its own `factory`/`fallback` function and measured a
manual world-space bounding box, restricted to `ALL_TYPES` from
`src/config/landmarks.js` — the pool the player can actually select from).
Results, tallest first:

```
station 29.15 (includes the viaduct itself)
stadium 19.2, hospital 18.44, castle 17.9, airport 16, hotel 15.96,
amusementPark 15.74, mall 15.3, museum 14.6, gym 14.05, fire 12.6, ...
(everything else is under 12)
```

The true tallest **buildable** landmark is the stadium at ~19.2. Your result
cited "21.15" as the tallest non-station landmark — I strongly suspect that
number came from measuring `cityHall` and/or `post`, which are marked
`retired: true` in `src/config/landmarks.js` and are **excluded from
`ALL_TYPES`** — they can never actually be selected or built in a real
playthrough. In fact, looking at your own `railway-castle-clearance.png`
screenshot, the tall tiered/turreted building shown under the track there
*is* `cityHall` (matches its `civicBlock({ tower: true, flag: true, ... })`
shape), not the actual `castle` landmark. If the clearance sweep iterated
over the full `LANDMARKS` object (or `Object.keys(LANDMARKS)`) instead of
`ALL_TYPES`, that's the bug — please check and fix the sweep itself, not just
the resulting number.

What to do:

- Recompute required clearance using only `ALL_TYPES` landmarks.
- Don't treat this as "one global worst-case height for the entire span."
  The station's lot position is fixed (`LANDMARK_LOTS` in `src/config/
  town.js`), so the track's real-world path is deterministic. Check which
  *other* lots the extended track's path actually passes near, and size the
  clearance against what could really be built on those specific lots (cross-
  reference each nearby lot's `zones` against which `ALL_TYPES` landmarks
  could occupy it, per the placement logic in `src/buildings/index.js`) —
  rather than assuming every lot everywhere could someday hold the single
  tallest thing in the whole pool.
- If, after that, there's still a small number of specific tall lots directly
  under the path that can't be avoided, prefer a modest local deviation in
  the track's horizontal path (or a slight rise only over that stretch, back
  down elsewhere) over a single sky-high constant applied to the entire span.
  A modest global height with occasional local adjustment will look far more
  like a real elevated line and far less like a broken ramp into the sky.
- Target something much closer to the original `DECK_Y = 6.2` than to 24.5 —
  clearing the stadium's ~19.2 with a flat global height would already be a
  large, probably-unnecessary jump; a local/targeted approach should let the
  typical deck height stay much lower than that.
- Re-check pier bulk once the height comes down — the current piers read as
  oversized highway-overpass slabs partly *because* they have to span such an
  extreme height; a shorter deck should let you bring their proportions back
  in line with the game's toy/diorama scale.
- Re-verify: `Box3` clearance against `ALL_TYPES` landmarks specifically
  (not the full registry), plus fresh screenshots of the same two views
  (`railway-map-overview.png`, `railway-castle-clearance.png` — overwrite
  them) so I can confirm the new height actually looks right, not just that
  it numerically clears things.

## 2. Playground swings now look broken, not fixed

Your own `playground-swings-mid-motion.png` shows the swing's leg beams
crossing each other in a chaotic X-tangle rather than a stable A-frame — this
reads as broken/collapsed, which is worse than the original "seat tilts with
the chain" issue I asked you to fix. The support **legs** should stay static
(they don't move on a real swing); only the seat+chain assembly should move,
and the whole thing should still read as a coherent, physically plausible
swing set at rest and mid-swing. Please re-inspect `buildPlayground` in
`src/buildings/extras.js`, fix whatever the seat-leveling change did to the
leg rotations (my guess: the counter-rotation meant to keep the seat level
got applied to the wrong node in the hierarchy, or shares a transform with
the legs), and re-screenshot both a resting frame and a mid-swing frame.

## 3. Possible bad geometry/material on an undeveloped lot

Your own `undeveloped-lot-angle-a.png` shows a dark asphalt-gray wedge
cutting diagonally into the interior of an undeveloped lot that has the new
perimeter sidewalk — it crosses well inside the light-gray sidewalk border,
overlapping the tan dirt-patch dressing. Check whether this is a road segment
that shouldn't reach that far, or an entrance spur rendered in the road's
asphalt material instead of the sidewalk material. Fix whichever it is, and
confirm no road/entrance-spur geometry crosses inside a lot's own perimeter
sidewalk boundary. Re-screenshot the same lot/angle to confirm.

## 4. One thing to double-check, not necessarily fix

Your result mentioned "static lot-conflict safeguards where neighboring pads
cannot safely be occupied together." Please confirm explicitly: in a normal
game (`BUILD_TARGET = 10`, or a full 33-landmark sweep), is there any
combination of choices a player could make that gets stuck — i.e. a
situation where an already-built landmark's pad conflicts with every
remaining option for some other required lot, with no legal placement left?
If you're confident this can't happen in practice, say so and briefly explain
why; if there's a real edge case, fix it.

---

Everything else in the previous result stands — I'm not asking you to redo
the sidewalks/pedestrian work, the name-entry feature, or WASD panning,
which all looked correct. Keep `CURRENT_STATE.md` untouched, same as before.

When done, give me a short update: what changed for each of the four items
above, the new railway height and why, and confirmation of `npm run build`
plus a fresh no-console-errors playthrough.

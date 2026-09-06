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

## 2026-09-06 - Suburban house models replace the procedural boxes

The ambient homes filling the town blocks now use Kenney's City Kit Suburban 2.0
(CC0) instead of `makeHouse`'s procedural box-and-roof. Twenty-one shapes, each a
single mesh, all sharing one small colour map.

The pack ships three alternate colour maps, so each house is spawned with a
randomly chosen colourway: 21 shapes become 84 distinct-looking homes for no
extra download, which is what stops a street reading as one house stamped
repeatedly. Only four materials exist in total, one per colourway.

They cost 2.4 MB and, unlike the characters, must load *before* `buildWorld()`,
since houses are created synchronously during world generation - so this is 2.4
MB added to first load rather than to a background fetch. The procedural houses
stay as the fallback.

Models are scaled at spawn to the same 5-7.5 m width the procedural houses used,
so scenery spacing, placement collision and the reserved-ground bookkeeping are
all unchanged.

## 2026-09-06 - Procedural buildings use a four-sided toy-town kit

The suburban GLB experiment was removed and the ambient streetscape is
procedural again. Generic homes now use six distinct cheerful pastel walls,
one- and two-storey silhouettes, gable or hip roofs, three entry treatments,
and small planting or utility details. Shops use the same compact kit but add
upper floors or parapets, real entrances, projecting vertical signs and one
small pavement vignette. Every elevation carries windows or service detail so
the freely orbiting camera no longer exposes blank boxes.

Ground contact and roof edges are the shared visual grammar: a thin concrete
plinth and short approach anchor buildings to the lawn, while pale fascia and a
ridge or hip cap articulate pitched roofs. Existing landmarks keep their
recognisable forms and receive only those cues plus sparse side/rear glazing.

Large wall bodies use cached flat `box()` geometry. Rounded geometry remains on
small props where it contributes to the soft toy character; flat panels are kept
for wide walls because the rounded bevel buys nothing at that scale and costs
vertices. Dimensions come from small discrete sets so the added details reuse
cached geometry and material; there are no textures, imported models, PBR
materials, lights or per-frame work.

The diagonal weave that used to cross every large facade was **shadow acne, not
geometry**. The sun's shadow camera spans 208 m, so one texel of the 2048 map is
about 10 cm of world space, while `normalBias` was 0.035 - far under a texel, so
walls sitting near-parallel to the sun self-shadowed and printed the texel grid
onto themselves. `normalBias` is now derived from the actual texel size
(`extent * 2 / mapSize.x * 1.4`), which also keeps it correct on the 1024 map
low-power Chromebooks fall back to. Switching wall geometry does not affect
this; only the bias does.

## 2026-09-06 - Active template landmarks get vocabulary-first silhouettes

The ten landmarks that still used the shared `shopFront` or `civicBlock`
templates were reviewed as one group. The eight active lesson words - bakery,
cafe, restaurant, convenience store, bookstore, police station, bank and hotel -
now have bespoke procedural forms. The retired post office and city hall remain
on the templates, rather than spending the classroom rendering budget on places
that cannot currently be spoken into the town.

Each active landmark now carries a shape-and-prop mnemonic that survives with
its text sign hidden: bakery loaf and bread trays; cafe corner bay, coffee cup
and patio; restaurant deep noren entry, lanterns and kitchen flue; convenience
store wraparound colour bands and vending machines; bookstore rooftop book
stack and display shelf; police watch tower, vehicle bay and patrol car; bank
portico, vault wheel and ATM; hotel tall guest-room tower and porte-cochere.

These are variations of the existing four-sided toy-town kit, not a new visual
system. Every building uses a concrete plinth and approach, finished roof edges,
and useful rear/side windows or service details. Geometry and Lambert materials
come from the shared caches; there are no textures, lights or new update loops.
The police beacon keeps its existing `userData.animate` contract.

## 2026-09-06 - Typing is a teacher setting, not an in-panel escape hatch

"Type it instead" used to appear as a button in the speaking panel, revealed
automatically after a couple of failed attempts or certain speech errors. That
offered the child a way out of speaking practice at precisely the moment
speaking got difficult, which undercuts the point of the exercise.

Typing now lives in the teacher settings panel as "Allow typing instead of
speaking", off by default and persisted in localStorage. A class that needs it
(no working microphone, a child who cannot speak aloud today) turns it on for
the session; otherwise the option is never surfaced to the child at all.

The prompts still decide when typing *would* be appropriate - `offerTyping()` is
unchanged at its call sites - but the HUD now gates that on the teacher setting,
so the two concerns stay separate.

## 2026-09-06 - Japanese instructions frame English lesson content

The classroom interface uses Japanese for every direction, control, status,
error and explanation, written in short, friendly plain form for elementary
school children. English remains wherever it is the material being taught: the
target sentences and speaking-tour frame, landmark names and signs, category
labels, activity hints, recognised speech, `Let's make...` and `Matsubara Tour`.

This split is a teaching invariant, not a general localisation preference.
Translating the lesson labels would remove the English children are meant to
read and say; leaving directions in English would make the game depend on a
teacher translating the interface. When a string is genuinely ambiguous, it
stays English until its role is decided. Existing bilingual controls show the
Japanese instruction as the primary line instead of repeating it under an
English instruction.

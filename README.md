# Matsubara Town — speak English, build a town

A 3D browser game for Japanese elementary-school English classes. The child is
shown three places the town could have, taps one, says the sentence for it —

> **We have a zoo in Matsubara.**

— and the zoo is built in front of them. Ten landmarks later the town gets a
cinematic tour of itself.

Built with Three.js + Vite. No backend, no login, no asset downloads.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static files in dist/
npm run preview    # serve the built version
```

**Use Chrome, Edge, or a Chromebook.** Speech recognition uses the Web Speech
API, which **Firefox and Safari do not implement at all** - there the game says
so and switches to a typing box. Two other things it needs:

- **Microphone permission.** Chrome asks the first time the mic button is
  pressed; if it was ever blocked, re-allow it from the icon in the address bar.
- **An internet connection.** Chrome sends audio to Google's speech service, so
  recognition fails offline. Worth knowing before a lesson.

Whenever speech genuinely cannot work, the game names the reason on screen,
logs the raw error code to the console for the teacher, and offers the typing
box so the lesson continues.

## Three phases

| Phase | The child says | What happens |
| --- | --- | --- |
| 1 · Build | *We have a stadium in Matsubara.* | the stadium is built |
| 2 · Script | *We can watch soccer in the stadium.* | the sentence **and their voice** are saved |
| 3 · Guide | — | their avatar tours visitors round the town, **speaking in their own recorded voice** |

The payoff is phase three: every sentence the child spoke turns out to have been
the script for their own animated tour of Matsubara.

### Phase one - build the town

**Choose → Speak → Build → Enjoy → Repeat.**

1. Three cards appear: *What should we build?*
2. The child taps one; the target sentence appears above the microphone.
3. Correct speech triggers the construction sequence: the camera flies in, the
   lot is cleared in a puff of dust, a foundation lands, the building rises and
   settles, then the camera drifts back to the town view.
4. The town gets busier — more pedestrians, more cars, more cyclists.
5. Three new cards.

Nothing punishes a wrong answer: the card wobbles, a soft sound plays, and the
microphone is immediately ready again.

### Phase two - the speaking tour

When the town is finished it is not put away. The camera tours the places the
child actually built, one at a time, and asks what people can do there:

> **We can ___ in the stadium.**
> ここでできることを英語で言ってみよう。

This is semi-free production, not a guessing game. Each place accepts a bank of
reasonable ideas (the stadium takes watching baseball, playing soccer, running,
exercising…), and **the reward is the town acting it out**, not a checkmark:

| The child says | Matsubara does |
| --- | --- |
| watch a baseball game in the stadium | players take the field, the crowd erupts, the lights surge |
| ride the train in the train station | the station calls its train in, passengers wait on the platform |
| see elephants in the zoo | the elephants get excited and visitors photograph them |
| swim in the swimming pool | swimmers push off down the lanes, splashing |
| ride the Ferris wheel in the amusement park | the wheel and coaster speed up for good |
| watch a movie in the movie theater | the marquee blazes and a queue goes in |

**Phase 2 does not fire these animations.** It records the sentence and the
voice, gives light feedback, and moves on. The stadium's game, the arriving
train and the turning Ferris wheel are all held back for phase three, where the
child's own recording sets them off — that is what makes the guided tour a
payoff instead of a repeat.

Activities then **persist and accumulate**: nothing is switched off when the
group moves on, and a second sentence about the same place adds to what is
already happening rather than replacing it.

**Skip is always there.** Every place must be *visited*; no place has to be
*answered*. Two states are tracked separately, and the summary offers **Finish**
(おわる) or **Continue** (まだ言っていない場所をつづける), which revisits only the
places with no successful sentence yet. Skipped places are never framed as
failures.

## Teacher settings

Everything a teacher is likely to change lives in [`src/config/lessons.js`](src/config/lessons.js):

```js
export const CITY_NAME = 'Matsubara';   // every sentence derives from this
export const HOUSE_OWNER = 'Ken';       // gives you "Ken's house"
export const BUILD_TARGET = 10;         // landmarks before the finale
export const CHOICES_PER_ROUND = 3;
```

URL overrides for a quick change without editing files:

| Query | Effect |
| --- | --- |
| `?city=Nara` | Changes the city in every sentence |
| `?target=6` | Shorter game |
| `?dev=1` | Exposes `window.game`; **B** builds the current target instantly |

The sentence pattern itself is one function (`LESSON.sentence`), so switching to
*"There is a ___ in ___."* is a one-line change.

## Building pool

34 places across six categories — community, transport, sports and recreation,
attractions, shopping and food, and somewhere to stay. Each round offers three,
preferring three *different* categories so the menu is rarely
"cafe / bakery / restaurant". Because only ten are built per game, two children
end up with visibly different versions of Matsubara.

## Unlocking new places

Replay motivation with no points, score, or currency — just new content. 20
everyday places are available from the very first playthrough; 13 more
exciting ones (stadium, zoo, castle, amusement park, airport…) start **locked**
and are discovered through play.

- **Mystery cards.** Two or three times in a normal ten-round game, one of the
  three choice slots is a locked silhouette — the real building's own icon,
  darkened — with `???` instead of a name. It can't be picked; tapping it gives
  a light, non-blocking nudge ("Finish a town to unlock new places!") and
  returns to the same three cards. It never reduces the round to fewer than two
  real choices, and never repeats a silhouette within one run.
- **The reward.** Finishing the *entire* three-phase experience — not just
  construction — unlocks exactly one new place, preferring one the child
  actually saw as a mystery silhouette that run. A brief, skippable reveal (the
  real 3D building, darkened then lit, name, one line of Japanese) plays before
  the closing menu.
- **Persistence.** Unlocks live in `localStorage` and carry across
  playthroughs on the same device. If storage is unavailable the game still
  runs fine for that session, just without carrying progress forward.
- **NEW badge.** A freshly unlocked place carries a small badge the first
  couple of times it appears as a real choice, and clears immediately once
  built.

All of this lives in [`src/config/progression.js`](src/config/progression.js)
(the unlocked/locked split, pacing, unlock count — all easy to retune) and
[`src/systems/progression.js`](src/systems/progression.js) (the state machine
and persistence). A small teacher-only control — gear icon, top right, tap
twice to confirm — resets unlocks back to the starting set.

Every entry lives in [`src/config/landmarks.js`](src/config/landmarks.js) and
carries its display name, spoken name and article, sign text, icon, category,
compatible lot zones, footprint, recognition keywords, celebration weight, how
much life it adds to the town — and its **activities**, ready for the next
grammar step:

## Phase 3 — the guided tour

Finishing the speaking phase hands the child the reward: their avatar becomes a
tour guide, and five to seven international visitors follow them round the town.

- **The guide speaks with the child's voice.** Every accepted sentence is
  captured by `MediaRecorder` alongside speech recognition, kept per place and
  per sentence type, and replayed here. Only the take that was *accepted* is
  kept; failed attempts are discarded as they happen.
- **Lip sync comes from the audio itself** — the mouth opens with the live
  amplitude of the recording (auto-levelled, so a quiet child still gets a
  moving mouth), not a looping animation.
- **Nothing is invented.** A place skipped in phase 2 gets only its build
  sentence; the guide never says a line the child did not say.
- **The group walks there.** They follow the road graph on the sidewalk side
  (a small Dijkstra over a few dozen nodes — no general pathfinding), with the
  visitors trailing the guide's breadcrumbs in a loose formation.
- **Visitors react in their own time** — one looks up, one points, one raises a
  camera and the shutter clicks. Big attractions get bigger reactions than a
  bank does.
- **The camera checks its own shot.** Each stop tries candidate angles until one
  can actually see both the guide and the building, so the tour never plays a
  sentence over a blank wall.
- Ambient town sound ducks under every recording, then comes back for the
  reactions.

If the browser has no `MediaRecorder`, or the microphone was declined, the tour
still runs: the lines appear on screen with plausible mouth movement, and
nothing else changes.

## What can you do there?

[`src/config/activities.js`](src/config/activities.js) maps
**place + spoken action → world animation**. There are no per-building branches
in the speech code; the matcher returns a registry entry and the director runs
whatever it names:

```js
stadium: {
  view: { height: 2.5, distance: 0.9, targetY: 0.04 },  // look into the bowl
  preferred: 'watch a baseball game',
  actions: [
    { id: 'baseball', phrases: ['watch baseball', 'watch a baseball game', 'play baseball', …],
      anim: 'field', opts: { kind: 'baseball', count: 9, cheer: true } },
    { id: 'run', phrases: ['run', 'exercise', 'jog', …],
      anim: 'field', opts: { kind: 'run', count: 5, cheer: true } },
  ],
}
```

Each action carries an id, the phrases that trigger it, the animation to run and
its parameters. A place may also declare a camera adjustment — a stadium's game
happens *inside* the bowl and a pool is flat on the ground, so those get a
steeper look-down or the child would never see what their sentence did.

**Language acceptance is separate from animation availability.** A good sentence
with no bespoke animation is still correct: it is marked spoken and gets the
generic celebration. "We can see pandas in the zoo" is accepted and wakes the
whole zoo up even though there is no panda model.

Animations live in [`src/systems/activities.js`](src/systems/activities.js) as a
small parameterised library — `crowd`, `field`, `train`, `bus`, `plane`,
`swimmers`, `rides`, `animals`, `sea`, `vehicleArrive`, `props`, `lights` and the
`generic` fallback — and they reuse what the buildings already own. The station
activity *calls the existing train* rather than spawning a second one; the fire
station rolls out the engine that was already parked in it.

Wording note: the lesson teaches **ride the train / ride the bus** (not "take"),
and the sentence frame uses each place's own preposition — *in the library*,
but *at the beach*, *on the farm*, and *in Ken's house*.

## Where models come from

`loadLandmark()` in [`src/buildings/index.js`](src/buildings/index.js) resolves
geometry in a fixed priority order:

1. **`factory`** — a finished implementation that already exists in this
   project. The original eight landmarks (school, library, hospital, park,
   train station, museum, shopping mall, stadium) are built this way in
   [`src/buildings/procedural.js`](src/buildings/procedural.js) and are never
   regenerated or replaced.
2. **`model`** — `public/assets/buildings/<name>.glb`, if the file is really
   there. Dropping `zoo.glb` into that folder upgrades the zoo with no code
   change; it is scaled and centred into its lot automatically
   (`modelScale`, `modelRotation`, `modelOffsetY` are available per entry).
3. **`fallback`** — the procedural placeholder in
   [`src/buildings/extras.js`](src/buildings/extras.js).

A GLB never silently overrides a hand-built `factory` model. To let one take
over, delete that entry's `factory` line.

## Placement

The child never places anything. The map has 17 hand-placed lots, each tagged
with the zones it suits (`civic`, `small`, `medium`, `large`, `recreation`,
`transport`, `edge`) in [`src/config/town.js`](src/config/town.js). A landmark
lists the zones it can use, and the game picks the free compatible lot closest
in size to its footprint — so a bakery never lands in the middle of a
stadium-sized field, and the original eight keep their designed plots.

Unbuilt lots are dressed as ordinary scruffy ground: gravel patches, weeds, a
short run of site fence. They are not glowing empty squares.

## Layout

```
src/
  config/     lessons (city, target, sentences) · town (roads, lots, camera) ·
              landmarks (registry) · activities (what you can do where) ·
              progression (unlock config)
  core/       tween + easing · seeded RNG · shared materials, geometry, signage, wind sway
  world/      terrain · roads · road graph · scenery placement · sky, clouds, birds ·
              characters (guide + visitors)
  buildings/  index (asset priority + lot choice) · procedural (original 8) · extras (the rest)
  systems/    camera rig · speech · construction · pedestrians · vehicles · particles ·
              audio · choices · finale · explore · tour · activities ·
              recorder · tourRecords · guidedTour · progression · unlockReveal
  ui/         hud
```

## Performance notes

Targets a 1366×768 Chrome OS device.

- The whole road network is four draw calls; hundreds of trees are a dozen
  instanced meshes; particles are two pooled `InstancedMesh`es.
- Pedestrians and vehicles are pooled and follow a shared waypoint graph — no
  pathfinding, no physics engine.
- `MeshLambertMaterial` throughout with one shadow-casting light.
- Pixel ratio is capped, and if frame times stay poor for a few seconds the
  renderer drops to 1× and a smaller shadow map once, automatically.
- All audio is synthesised with WebAudio, so there is nothing to download.

## Known limits

- Web Speech API only; Safari and Firefox fall back to the typing box.
- Speech matching is keyword-based on purpose — it rewards a child who says the
  sentence clearly enough for a teacher to understand, and does not score
  pronunciation.

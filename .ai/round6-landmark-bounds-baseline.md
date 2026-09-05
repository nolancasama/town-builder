# Round 6 landmark bounds baseline

Measured with `THREE.Box3().setFromObject(...)` after calling every active
landmark's procedural factory/fallback with its target class envelope and RNG
seed `20260826`. This covers `ALL_TYPES` only (33 buildable landmarks); retired
`cityHall` and `post` are excluded. The station's town-spanning track structure
and moving train are detached before measuring the station-local scene.

The required PASS/FAIL column compares total X/Z dimensions with the target
envelope. The final column is an additional, stricter health check: because the
builder origin is the centre of its usable envelope, it checks all four Box3
limits against `± envelope / 2`. A model can pass the requested dimension table
while still protruding into the perimeter sidewalk if its scene is off-centre.

| Landmark | Class | Actual X x Z | Allowed X x Z | Size result | Centred inside envelope |
|---|---|---:|---:|---:|---:|
| school | large | 28.00 x 23.02 | 28 x 24 | PASS | PASS |
| library | medium | 23.86 x 17.42 | 22 x 18 | FAIL | FAIL |
| hospital | medium | 19.80 x 19.31 | 22 x 18 | FAIL | FAIL |
| police | medium | 19.64 x 17.40 | 22 x 18 | PASS | FAIL |
| fire | medium | 19.00 x 17.35 | 22 x 18 | PASS | PASS |
| bank | small | 13.00 x 14.40 | 16 x 14 | FAIL | FAIL |
| station | large | 26.00 x 12.00 | 28 x 24 | PASS | PASS |
| busStation | medium | 20.00 x 17.48 | 22 x 18 | PASS | FAIL |
| airport | large | 26.00 x 19.85 | 28 x 24 | PASS | PASS |
| gasStation | medium | 18.00 x 14.24 | 22 x 18 | PASS | PASS |
| stadium | xl | 38.08 x 27.54 | 38 x 28 | FAIL | FAIL |
| park | large | 27.68 x 23.15 | 28 x 24 | PASS | FAIL |
| gym | medium | 19.00 x 17.16 | 22 x 18 | PASS | FAIL |
| pool | medium | 20.00 x 16.40 | 22 x 18 | PASS | PASS |
| playground | medium | 20.00 x 16.00 | 22 x 18 | PASS | PASS |
| zoo | large | 26.20 x 22.74 | 28 x 24 | PASS | PASS |
| aquarium | medium | 18.00 x 17.18 | 22 x 18 | PASS | FAIL |
| museum | medium | 22.61 x 23.94 | 22 x 18 | FAIL | FAIL |
| cinema | medium | 19.00 x 17.08 | 22 x 18 | PASS | FAIL |
| amusementPark | large | 28.00 x 22.00 | 28 x 24 | PASS | FAIL |
| castle | large | 25.36 x 25.36 | 28 x 24 | FAIL | FAIL |
| temple | large | 25.00 x 21.00 | 28 x 24 | PASS | PASS |
| beach | large | 26.00 x 24.68 | 28 x 24 | FAIL | FAIL |
| farm | large | 26.00 x 22.00 | 28 x 24 | PASS | PASS |
| mall | large | 27.70 x 27.75 | 28 x 24 | FAIL | FAIL |
| supermarket | medium | 20.00 x 17.00 | 22 x 18 | PASS | PASS |
| convenience | small | 18.30 x 12.76 | 16 x 14 | FAIL | FAIL |
| restaurant | small | 13.70 x 12.76 | 16 x 14 | PASS | FAIL |
| cafe | small | 13.70 x 14.45 | 16 x 14 | FAIL | FAIL |
| bakery | small | 13.70 x 12.80 | 16 x 14 | PASS | FAIL |
| bookstore | small | 13.70 x 12.76 | 16 x 14 | PASS | FAIL |
| hotel | medium | 19.00 x 17.40 | 22 x 18 | PASS | FAIL |
| house | small | 14.00 x 12.00 | 16 x 14 | PASS | PASS |

Dimension result: 23 PASS, 10 FAIL. Centred-containment result: 12 PASS,
21 FAIL. Equality at the envelope boundary is accepted in both counts.

## Recomposition targets

- `buildLibrary`: the two trees at X `±10.5` make the width fail; pull them to
  roughly `±8.5`. Pull the steps, balustrades, book sculpture, front trees and
  bench inward enough to keep the foreground below local Z `9`.
- `buildHospital`: the ambulance canopy/apron centred at Z `9`, the vehicle,
  posts and cross sign extend to Z `12.51`. Compact the bay around Z `6.5–6.8`
  with a shallower canopy/apron instead of scaling the building.
- `civicBlock`: shared steps at `front + 2.6` cause the bank, police station and
  hotel forward spill. Around `front + 0.7` fits small and medium envelopes.
- `buildStadium`: the roof ring and lip radius `1.12 * rx` reach X `±19.04`;
  trim those two roof pieces to about `1.11`. The entrance roof reaches Z
  `14.10`; move the gate inward by `0.1`.
- `buildMuseum`: the building architecture itself is approximately Z
  `[-8.2, 8.3]` and fits. Pull the banner poles from X `±11.2`; compact the
  steps, sculpture and three-tree forecourt currently extending to Z `15.74`.
- `buildCastle`: tower roof radius `2.6` at `half = 10.08` makes depth `25.36`.
  Contract the curtain/tower spacing factor from `0.42` to about `0.39`.
- `buildBeach`: the sea slab is centred at Z `-8.64` with depth `10.08`, ending
  at `-13.68`; move it inward (for example `-ld * 0.28`).
- `buildMall`: preserve the architecture. The car park centred at Z `14` ends
  at `16.75`; place it in the near forecourt and rotate parked cars so their
  long axis runs X. Move the pylon at X `13.9` about one unit inward.
- `buildConvenience`: its side apron at X `9.75`, width `3.4`, ends at `11.45`;
  recompose it as an inside-front/side apron.
- `shopFront`: the optional bicycle at `front + 2.2` produces the small-shop
  centred spill. Pull it inward by about `0.5`.
- `buildCafe`: umbrellas at `front + 2.4`, radius `1.7`, end at Z `9.1`; pull
  the seating inward and modestly shrink the shade if necessary.
- Remaining centred-only fixes are local and small: bus station lane strips
  (`9.48`), aquarium rear dome (`-9.62`), cinema marquee sign (`9.08`), gym
  hoop (`9.01`), amusement park Ferris wheel/cabin (`-15`), and park random
  tree placement (`14.03`).

Measurement commands:

```text
node .ai/measure-r6-temp.mjs
node .ai/inspect-r6-overages.mjs
```

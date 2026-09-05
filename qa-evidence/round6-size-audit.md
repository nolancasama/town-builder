# Round 6 size-class verification

Generated 2026-08-27T03:40:38.186Z. Only `ALL_TYPES` (33 buildable landmarks) are measured. The station's town-spanning track structure and train are excluded from its local envelope.

## Landmark bounds

| Landmark | Class | Actual X x Z | Allowed X x Z | Result |
|---|---:|---:|---:|---:|
| school | large | 28 x 23.02 | 28 x 24 | PASS |
| library | medium | 19.36 x 16.52 | 22 x 18 | PASS |
| hospital | medium | 19.8 x 15.77 | 22 x 18 | PASS |
| police | medium | 19.64 x 15.72 | 22 x 18 | PASS |
| fire | medium | 19 x 17.35 | 22 x 18 | PASS |
| bank | small | 13 x 12.5 | 16 x 14 | PASS |
| station | large | 26 x 12 | 28 x 24 | PASS |
| busStation | medium | 20 x 16.95 | 22 x 18 | PASS |
| airport | large | 26 x 19.85 | 28 x 24 | PASS |
| gasStation | medium | 18 x 14.24 | 22 x 18 | PASS |
| stadium | xl | 37.4 x 27.15 | 38 x 28 | PASS |
| park | large | 27.3 x 23.15 | 28 x 24 | PASS |
| gym | medium | 19 x 16.96 | 22 x 18 | PASS |
| pool | medium | 20 x 16.4 | 22 x 18 | PASS |
| playground | medium | 20 x 16 | 22 x 18 | PASS |
| zoo | large | 26.2 x 22.74 | 28 x 24 | PASS |
| aquarium | medium | 18 x 17.18 | 22 x 18 | PASS |
| museum | medium | 21 x 17.1 | 22 x 18 | PASS |
| cinema | medium | 19 x 16.9 | 22 x 18 | PASS |
| amusementPark | large | 26.88 x 22 | 28 x 24 | PASS |
| castle | large | 25 x 23.92 | 28 x 24 | PASS |
| temple | large | 25 x 21 | 28 x 24 | PASS |
| beach | large | 26 x 22.76 | 28 x 24 | PASS |
| farm | large | 26 x 22 | 28 x 24 | PASS |
| mall | large | 26.8 x 22.9 | 28 x 24 | PASS |
| supermarket | medium | 20 x 17 | 22 x 18 | PASS |
| convenience | small | 14.27 x 12.2 | 16 x 14 | PASS |
| restaurant | small | 13.7 x 12.2 | 16 x 14 | PASS |
| cafe | small | 13.7 x 12.35 | 16 x 14 | PASS |
| bakery | small | 13.7 x 12.2 | 16 x 14 | PASS |
| bookstore | small | 13.7 x 12.2 | 16 x 14 | PASS |
| hotel | medium | 19 x 15.5 | 22 x 18 | PASS |
| house | small | 14 x 12 | 16 x 14 | PASS |

## Parcel geometry

- Closest reserved parcel to any rendered road/road-sidewalk surface: **2.224 units** (`large-center-north` / `road:7:sidewalk:-1`).
- Closest reserved-parcel pair: **6 units** (`small-center-west` / `small-center-east`).

## Railway

Tested 249 compatible landmark/parcel placements; 0 cross the corridor in X/Z. Minimum vertical clearance is n/a units; **0 physical intersections**.

## Randomized ten-building runs

- all-types direct random: 50,000 runs, 0 dead ends, minimum 10/10 completed.
- all-types three-card choices: 50,000 runs, 0 dead ends, minimum 10/10 completed.
- all-types random permutations: 50,000 runs, 0 dead ends, minimum 10/10 completed.
- default-unlocked three-card choices: 50,000 runs, 0 dead ends, minimum 10/10 completed.

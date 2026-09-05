# Round 6 landmark bounds

Measured from freshly instantiated `ALL_TYPES` models with
`THREE.Box3().setFromObject(...)`, including every child. Values are local X/Z
extents rounded to two decimals. The station row covers station-local geometry;
the authored town-spanning railway is audited separately.

| Landmark | Class | Actual X x Z | Allowed X x Z | Result |
|---|---|---:|---:|---|
| bank | small | 13.00 x 12.50 | 16 x 14 | PASS |
| bakery | small | 13.70 x 12.20 | 16 x 14 | PASS |
| bookstore | small | 13.70 x 12.20 | 16 x 14 | PASS |
| cafe | small | 13.70 x 12.35 | 16 x 14 | PASS |
| convenience | small | 14.27 x 12.20 | 16 x 14 | PASS |
| restaurant | small | 13.70 x 12.20 | 16 x 14 | PASS |
| house | small | 14.00 x 12.00 | 16 x 14 | PASS |
| aquarium | medium | 18.00 x 17.18 | 22 x 18 | PASS |
| cinema | medium | 19.00 x 16.90 | 22 x 18 | PASS |
| museum | medium | 21.00 x 17.10 | 22 x 18 | PASS |
| fire | medium | 19.00 x 17.35 | 22 x 18 | PASS |
| hospital | medium | 19.80 x 15.77 | 22 x 18 | PASS |
| library | medium | 19.36 x 16.52 | 22 x 18 | PASS |
| police | medium | 19.64 x 15.72 | 22 x 18 | PASS |
| gym | medium | 19.00 x 16.96 | 22 x 18 | PASS |
| playground | medium | 20.00 x 16.00 | 22 x 18 | PASS |
| pool | medium | 20.00 x 16.40 | 22 x 18 | PASS |
| supermarket | medium | 20.00 x 17.00 | 22 x 18 | PASS |
| hotel | medium | 19.00 x 15.50 | 22 x 18 | PASS |
| busStation | medium | 20.00 x 16.95 | 22 x 18 | PASS |
| gasStation | medium | 18.00 x 14.24 | 22 x 18 | PASS |
| amusementPark | large | 26.88 x 22.00 | 28 x 24 | PASS |
| beach | large | 26.00 x 22.76 | 28 x 24 | PASS |
| castle | large | 25.00 x 23.92 | 28 x 24 | PASS |
| farm | large | 26.00 x 22.00 | 28 x 24 | PASS |
| temple | large | 25.00 x 21.00 | 28 x 24 | PASS |
| zoo | large | 26.20 x 22.74 | 28 x 24 | PASS |
| school | large | 28.00 x 23.02 | 28 x 24 | PASS |
| park | large | 27.30 x 23.15 | 28 x 24 | PASS |
| mall | large | 26.80 x 22.90 | 28 x 24 | PASS |
| airport | large | 26.00 x 19.85 | 28 x 24 | PASS |
| station | large | 26.00 x 12.00 | 28 x 24 | PASS |
| stadium | xl | 37.40 x 27.15 | 38 x 28 | PASS |

Result: 33/33 pass both total-size and centred-envelope checks.

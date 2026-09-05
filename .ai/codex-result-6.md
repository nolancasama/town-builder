Implemented Round 6 completely. The town now uses four centralized size classes, standardized parcels, independent semantic zones, and no placement exclusions.

### Final classes

- Small: bank, bakery, bookstore, cafe, convenience, restaurant, house
- Medium: aquarium, cinema, museum, fire, hospital, library, police, gym, playground, pool, supermarket, hotel, busStation, gasStation
- Large: amusementPark, beach, castle, farm, temple, zoo, school, park, mall, airport, station
- XL: stadium

`mall` is explicitly large. Only station and stadium retain fixed parcels.

### Parcel layout

17 parcels total:

| Class | Count | Centers |
|---|---:|---|
| Small | 4 | `(-34,20)`, `(-14,20)`, `(-67,54)`, `(-67,-54)` |
| Medium | 6 | `(-24,-20)`, `(-65,20)`, `(-65,-20)`, `(-43,58)`, `(50,58)`, `(-43,-58)` |
| Large | 6 | `(24,20)`, `(24,-20)`, `(-13,60)`, `(20,58)`, `(-13,-60)`, station `(67,20)` |
| XL | 1 | stadium `(25,-60)` |

Roads are now systematic:

- Streets: `z = 0, 40, -40`
- Avenues: `x = -48, 0, 48`
- The old back streets, diagonal shortcut, and parcel-conflicting country-road loops were removed.
- Station moved from `(44,15)` to `(67,20)`.
- Stadium moved from `(24,-48)` to `(25,-60)`.

World dimensions changed from `230 / 88 / 124` to `250 / 100 / 136` for size, flat radius, and hill radius. The farthest parcel corner is radius `99.489`, leaving `0.511` units inside flat terrain.

### Scene work

Internally recomposed without blanket landmark scaling:

- Library, hospital, park, museum, mall, stadium
- Bakery, bookstore, cafe, convenience, restaurant
- Bank, police, hotel
- Aquarium, amusement park, castle, cinema, gym, beach, bus station

Changes pulled steps, vehicles, furniture, trees, signs, fences, courts, parking and decorative props inward. Mall architecture was preserved and its parking spacing corrected.

Airport measures `26.00 × 19.85` inside its `28 × 24` envelope. The aircraft, hangar, terminal, taxiway and windsock remain inside the parcel, with the perimeter sidewalk between them and all roads. Stadium measures `37.40 × 27.15` inside its XL `38 × 28` envelope.

The complete 33-landmark measurement table is in [landmark-bounds.md](/C:/Users/nolan/recipe-tester/town-builder/qa-evidence/round6/landmark-bounds.md).

### Placement cleanup

- Deleted `LOT_EXCLUSIONS` entirely.
- Removed both `excludedTypes` railway workarounds.
- Removed `minLotSize`.
- Removed all size words from semantic `zones`.
- Placement now independently checks `sizeClass`, semantic zones, reservations, and occupancy.
- Smaller landmarks prefer the smallest available compatible parcel.
- Tour and guided-tour framing use the usable envelope rather than the larger reserved plot.
- Unlock previews use the derived class envelope; the largest XL preview was visually verified.

### Verification

- Landmark bounds: **33/33 PASS**
- Worst road clearance: **1.000 unit**
- Worst parcel-to-parcel gap: **1.000 unit**
- Randomized testing: **40,000 random + 10,000 adversarial + 2,800 progression-ladder towns**, zero dead ends
- Railway: corridor `x = 66.2–71.4`, `z = -125–125`; zero parcels crossed, 249 compatible placements checked
- Live scenery: 22 committed paddy cells; town remains open, semi-rural and visually populated
- Full browser playthrough: 10 buildings, all Phase 2 stops, Phase 3 completion, 10 sidewalks, zero unexpected console/page/request errors
- `npm run build`: **PASS**
- `git diff --check`: **PASS**

Visual evidence for all requested representatives, normal and close views, plus airport overhead/oblique and unlock framing, is in [qa-evidence/round6](/C:/Users/nolan/recipe-tester/town-builder/qa-evidence/round6). The browser playthrough result is [full-playthrough.json](/C:/Users/nolan/recipe-tester/town-builder/qa-evidence/round6/full-playthrough.json).

Primary implementation files are [town.js](/C:/Users/nolan/recipe-tester/town-builder/src/config/town.js:10), [landmarks.js](/C:/Users/nolan/recipe-tester/town-builder/src/config/landmarks.js:38), [buildings/index.js](/C:/Users/nolan/recipe-tester/town-builder/src/buildings/index.js:70), [procedural.js](/C:/Users/nolan/recipe-tester/town-builder/src/buildings/procedural.js:155), [extras.js](/C:/Users/nolan/recipe-tester/town-builder/src/buildings/extras.js:29), and [world/index.js](/C:/Users/nolan/recipe-tester/town-builder/src/world/index.js:3).

`CURRENT_STATE.md` was left untouched. No unresolved issues.
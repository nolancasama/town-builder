Implemented Round 7 without changing the Round 6 standardization.

- Live houses + shops: **34**
- Road segments: **41**
- Parcel classes, semantic zones, deleted exclusions, and 33/33 landmark fit remain intact.
- `CURRENT_STATE.md` matches the pre-Round-7 backup exactly.

### Restored character

The network now includes:

- Crooked northern and southern neighbourhood streets
- A western back-street loop
- An offset central connection
- A non-orthogonal north-east shortcut
- Large northern and southern country-lane loops through the field belt

Country lanes use sparse rural frontage, preventing continuous suburban development while retaining occasional roadside houses.

### Clearance distribution

| Measurement | Min | P25 | Median | P75 | Max |
|---|---:|---:|---:|---:|---:|
| Parcel → carriageway | 4.206 | 4.472 | 5.000 | 7.308 | 11.484 |
| Parcel → complete road surface, including sidewalks | 2.224 | 2.737 | 3.397 | 6.032 | 9.284 |
| Parcel nearest neighbour | 6.000 | 6.500 | 7.500 | 18.000 | 21.000 |
| All 136 parcel pairs | 6.000 | 31.645 | 71.553 | 95.648 | 166.877 |

The former `1.000` values were not enforced by a hard-coded validator—the audit only required positive clearance—but they were direct results of deliberately tight authored coordinates. Those coordinates have been replaced with genuine slack.

### Verification

- Landmark envelopes: **33/33 centered fits**
- Road/sidewalk overlap: **0**
- Parcel overlap: **0**
- Randomized suite: **4 × 50,000 runs**, zero dead ends
- Additional stress suite: **40,000 random + 10,000 adversarial + 2,800 progression-ladder towns**, zero dead ends
- Railway: **249 compatible placements**, zero parcel crossings or physical intersections
- Full browser playthrough: ten builds, all Phase 2 stops, reached `guided-end`, ten sidewalks, zero unexpected console/page/request errors
- `npm run build`: **PASS**
- `git diff --check`: **PASS**

Implementation changes are limited to [town.js](C:/Users/nolan/recipe-tester/town-builder/src/config/town.js), [graph.js](C:/Users/nolan/recipe-tester/town-builder/src/world/graph.js), and [scenery.js](C:/Users/nolan/recipe-tester/town-builder/src/world/scenery.js).

Visual evidence: [normal-camera town overview](C:/Users/nolan/recipe-tester/town-builder/qa-evidence/round7/town-overview.png).

No unresolved issues.
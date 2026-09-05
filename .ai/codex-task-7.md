# Round 7 — the standardization is good, but the town lost its houses and its character

The parcel/size-class work from Round 6 is solid and I want to keep it:
33/33 landmarks measured inside their envelopes, `LOT_EXCLUSIONS` deleted,
`excludedTypes`/`minLotSize` gone, size words removed from semantic `zones`,
airport and stadium fitting cleanly. **Do not undo any of that.**

But the layout changes that came with it broke two explicit requirements of the
brief, and the result is a serious visual regression.

## 1. The town has almost no buildings any more

Measured in the live game, before vs after Round 6:

| | Before | After |
|---|---:|---:|
| houses + shops placed | **33** | **3** |
| road segments | **49** | **25** |

Three buildings. The blocks now contain only tan dirt lot-dressing and a few
trees. From the normal camera the town reads as an empty, planned-but-unbuilt
subdivision rather than an inhabited place — this is the single most damaging
change in the round.

The scenery generator itself is intact (`world/scenery.js` still has both the
road-frontage pass and the back-lot infill pass); it is being **starved**:

- **Frontage pass**: it iterates road edges and places along them. Halving the
  road network from 49 segments to 25 roughly halves the candidate frontage
  positions, and the survivors are long straight avenues whose adjacent land is
  now largely consumed by enlarged reserved parcels.
- **Infill pass**: it rejects any point failing `occ.blocked(...)`. With 17
  parcels now reserving 20×18 → 42×32 each (plus the map expansion), most
  interior block space is reserved, so nearly every infill candidate is
  rejected.

Fix so the built-up area is populated again — target roughly the previous
density (~30ish houses/shops, not a hard number), with buildings lining the
streets the way they used to. Do this **without** shrinking the standardized
parcels or reintroducing landmark/parcel overlap. Options worth considering:
give the frontage pass more road to work with (see #2), and/or ensure there is
genuine unreserved block interior left between parcels for infill.

Verify by reporting the same houses+shops count from the live game.

## 2. The road network became a bare regular grid

Streets at `z = -40, 0, 40` and avenues at `x = -48, 0, 48`, with the back
streets, the diagonal shortcut and the country-lane loops all deleted. That is
a perfectly regular 3×3 grid — precisely what the brief said to avoid:

> "Making the town larger should not turn it into a dense American-style city
> grid. Preserve the existing feeling of: semi-rural Matsubara … irregular
> development, roads through undeveloped areas, low-density surroundings."

The removed pieces were exactly what gave Matsubara its character: the
neighbourhood back streets, the north-east diagonal shortcut, and the country
lanes looping through the southern fields.

Restore that irregularity: bring back secondary/neighbourhood streets, a
diagonal or non-orthogonal connection, and country lanes running out through
the undeveloped land and rice-field areas. These extra roads also directly
address #1 by giving the frontage pass far more edge to build along.

The constraint that made you delete them still applies — roads must not
encroach on reserved parcels — so route the restored roads **between and
around** the standardized parcels rather than through them. It's fine for
country lanes to wander through open field well away from any parcel.

## 3. Clearance figures look suspiciously exact

You reported worst road clearance **1.000** and worst parcel-to-parcel gap
**1.000**. Two independent worst-cases landing on exactly 1.000 suggests a
hard-coded 1-unit minimum that the layout was solved against, rather than a
measured outcome with natural slack. One unit is also very tight for a town at
this scale — a parcel one metre from a carriageway leaves no room for the
sidewalk/setback the reserved plot is supposed to provide.

Confirm whether 1.000 is a constraint you imposed or a genuine measurement, and
if the former, give parcels more real breathing room (the map is already bigger
— use it). Report the resulting distribution, not just the worst case.

## Constraints

- Keep everything from #1 of the Round 6 report: the four classes, the parcel
  standardization, the class/zone separation, the deleted exclusions, and the
  33/33 landmark fit.
- Re-run the Round 6 verification afterwards — landmark bounds, road clearance,
  parcel overlap, randomized dead-end runs, railway corridor — since moving
  roads and adding scenery can disturb all of them.
- `npm run build` passes; full playthrough with zero console errors.
- Keep the tree buildable at checkpoints (a previous attempt died mid-edit and
  left it broken).
- Leave `CURRENT_STATE.md` alone.

## Report

Live houses+shops count, final road-segment count, what irregular roads you
restored, the clearance distribution (not just worst case), and re-confirmation
of the Round 6 verification set.

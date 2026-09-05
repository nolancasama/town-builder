# Round 8 — rice paddies have been squeezed out; and confirm the world size

Round 7 succeeded at what it was asked: 34 houses/shops restored, 41 road
segments with genuine irregularity (the crooked streets and country lanes read
beautifully from the normal camera), and real clearance slack replacing the
suspicious 1.000 values. Keep all of that, and keep the Round 6
standardization. Two things need attention.

## 1. Rice paddies are effectively gone

Measured live: the `paddies` group has **6 child meshes**, down from 111 after
Round 6. Visually there is exactly **one** paddy left in the entire town.

Rice fields are a signature element of Matsubara's semi-rural character — named
explicitly in the design docs and in both previous briefs. Losing them is a
real regression.

I diagnosed the cause. Reconstructing the generation-time occupancy check per
plot, **21 of 22 paddy plots are rejected by parcel-rect overlap** — not by
road proximity (road distances are 10-26 units, far above the 3-unit threshold)
and not by the flat-terrain bound. The reason:

```
paddy fields sit at radius  75.7 - 87.5
parcels now sit at radius   81.0 - 106.4   (small-northwest [-81,69] r=106.4,
                                            medium-northeast [60,69] r=91.4,
                                            xl-stadium [31.5,-78] r=84.1, …)
```

`PADDY_FIELDS` were relocated out to r≈80-90 during Round 6 (when
`flatRadius` was 100). Round 7 then pushed parcels outward into that same
ring, so the paddy belt and the parcel belt now overlap almost exactly. Only
`[55,-52]` (r=75.7, the innermost field) still places.

Fix so the paddies come back as a visible part of the landscape — a scattered
belt of rice fields around the built-up area, as before. The cleanest lever is
probably relocating/redistributing `PADDY_FIELDS` into the genuinely open land
that now exists between and beyond the parcels (the map is much larger than it
was), rather than loosening the occupancy test — paddies should still not
overlap parcels or roads.

Report the resulting live `paddies` child-mesh count and how many of the
authored fields actually place.

## 2. The world grew again, silently — please confirm this is intended

`WORLD` is now `size 310 / flatRadius 132 / hillRadius 151`.

- Original, before this work: `230 / 88 / 124`
- Round 6 reported: `250 / 100 / 136`
- Round 7 did not mention changing `WORLD` at all, but it is now `310 / 132 / 151`

That is a ~35% linear increase over the original, and an undisclosed change in
Round 7. The Round 6 brief asked for "the smallest sensible expansion" and
warned against "huge empty distances between buildings."

The town itself still looks good and appropriately dense from the normal
camera, so I am not asking you to shrink it reflexively. But please:

- Confirm whether 310/132/151 is actually required by the restored road network
  and standardized parcels, or whether it drifted larger than necessary.
- Note that with the farthest parcel at r=106 and `flatRadius` at 132, there is
  a wide empty flat ring outside the town. If that ring is larger than the
  paddies/fields/scenery need, bring `flatRadius` (and `hillRadius`/`size`)
  down to the smallest value that still fits everything comfortably — which
  would also pull the paddy belt closer to the town and make the countryside
  read as part of the place rather than as distant filler.
- Whatever you choose, state the final values and the reason explicitly this
  time.

## Constraints

- Keep Round 6 standardization (four classes, 33/33 landmark fit, no
  `LOT_EXCLUSIONS`, class/zone separation) and Round 7's restored density and
  irregular roads.
- Re-run the full verification set afterwards, since moving paddies or resizing
  the world touches scenery placement, parcel clearance, dead-end reachability
  and the railway corridor.
- `npm run build` passes; full playthrough with zero console errors.
- Keep the tree buildable at checkpoints.
- Leave `CURRENT_STATE.md` alone.

## Report

Live paddy child-mesh count and fields placed; final `WORLD` values with
justification; and re-confirmation of the standardization + density +
clearance + dead-end + railway checks.

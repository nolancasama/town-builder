# Suburban house models

**Kenney — City Kit Suburban 2.0**, <https://kenney.nl>
Licence: CC0 1.0 (public domain). No attribution required; credited here anyway.

## What is here

`building-type-<a..u>.glb` — 21 house shapes, ~95 KB each, one mesh apiece.
`Textures/colormap.png` — the shared colour map every model references.
`Textures/variation-{a,b,c}.png` — three alternate colourways.

The `.glb` files reference their texture **externally** as
`Textures/colormap.png`, so the loader must be given this directory as the glTF
resource path or every house renders untextured white.

## How they are used

`src/world/houseModels.js` preloads all 21 and builds one material per
colourway. `makeHouse()` in `src/world/props.js` then hands scenery a random
shape with a random colourway, which turns 21 meshes into 84 distinct-looking
homes for no extra download.

Models are authored roughly one unit wide and are scaled at spawn to the 5–7.5 m
width the procedural houses used, so street spacing and placement collision are
unchanged. Their front faces +Z, which is the direction scenery already rotates
a building to face the road.

Unlike the character models, these must be resident *before* `buildWorld()`
runs, because houses are created synchronously during world generation. The
procedural houses remain the fallback when the assets cannot be loaded.

# Drop-in building models

Put a `.glb` / `.gltf` file here and the matching landmark uses it instead of
its procedural placeholder. No code changes needed.

Expected filenames come from each entry's `model` field in
`src/config/landmarks.js`, for example:

    zoo.glb          aquarium.glb      castle.glb
    bakery.glb       airport.glb       hotel.glb
    police.glb       fire.glb          temple.glb

The model is scaled and centred to fit its lot automatically, standing on the
ground with its entrance facing the street. Per-entry `modelScale`,
`modelRotation` and `modelOffsetY` are available if a particular asset needs
nudging.

**Exception:** the eight original landmarks (school, library, hospital, park,
station, museum, mall, stadium) have finished hand-built models and use them in
preference to any GLB dropped here. To let a downloaded model take over, remove
that entry's `factory:` line in the registry.

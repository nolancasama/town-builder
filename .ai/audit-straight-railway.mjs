import * as THREE from 'three';

globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          clearRect() {}, fillRect() {}, fillText() {},
          measureText(text) { return { width: String(text).length * 24 }; },
        };
      },
    };
  },
};

const [{ LANDMARKS, ALL_TYPES }, { LANDMARK_LOTS }, { lotsFor }, { makeRng }] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/buildings/index.js'),
  import('../src/core/rng.js'),
]);

function eligible(type, lot) {
  return LANDMARKS[type].lot === lot.id || lotsFor(type, new Set()).some((candidate) => candidate.id === lot.id);
}

function meshesFor(type, lot) {
  const def = LANDMARKS[type];
  const modelLot = { ...lot, size: [...(lot.buildSize || lot.size)] };
  const model = (def.factory || def.fallback)({
    size: modelLot.size,
    sign: def.sign,
    type,
    rng: makeRng(20260826),
    lot: modelLot,
  });
  model.position.set(lot.pos[0], 0, lot.pos[1]);
  model.rotation.y = lot.rot;
  model.updateMatrixWorld(true);
  const rows = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    let parent = object;
    while (parent) {
      if (parent.name === 'station-track-structure') return;
      parent = parent.parent;
    }
    rows.push({ name: object.name || object.geometry.type, bounds: new THREE.Box3().setFromObject(object) });
  });
  return rows;
}

const placements = [];
for (const lot of LANDMARK_LOTS) {
  if (lot.id === 'lot-station') continue;
  for (const type of ALL_TYPES) {
    if (!eligible(type, lot)) continue;
    placements.push({ type, lot: lot.id, meshes: meshesFor(type, lot) });
  }
}

function audit(corridorX) {
  const minX = corridorX - 2.6;
  const maxX = corridorX + 2.6;
  const hits = [];
  for (const placement of placements) {
    let highest = null;
    for (const mesh of placement.meshes) {
      if (mesh.bounds.max.x <= minX || mesh.bounds.min.x >= maxX) continue;
      if (!highest || mesh.bounds.max.y > highest.maxY) highest = { name: mesh.name, maxY: mesh.bounds.max.y };
    }
    if (highest) hits.push({ type: placement.type, lot: placement.lot, ...highest });
  }
  hits.sort((a, b) => b.maxY - a.maxY);
  return hits;
}

for (const x of [-90, -84, -78, -72, -66, -60, -54, -48, -42, -36, -24, -8, 8, 20, 32, 40, 42, 44, 45.8, 47, 49, 52, 56, 60, 64, 68, 72, 76, 80, 84, 90]) {
  const hits = audit(x);
  console.log(`x=${x.toFixed(1)} max=${hits[0]?.maxY.toFixed(2) || 0} ${hits[0]?.type || '-'}@${hits[0]?.lot || '-'} hits=${hits.length}`);
}

const corridor = Number(process.argv[2] || 45.8);
console.log(`\nDetails for x=${corridor}`);
console.table(audit(corridor).filter((hit) => hit.maxY >= 10.2).map((hit) => ({ ...hit, maxY: +hit.maxY.toFixed(3) })));

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

const [{ LANDMARKS, ALL_TYPES }, { LANDMARK_LOTS }, { selectLot }, { makeRng }] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/buildings/index.js'),
  import('../src/core/rng.js'),
]);

function modelBounds(type, lot) {
  const def = LANDMARKS[type];
  const modelLot = { ...lot, size: [...(lot.buildSize || lot.size)] };
  const model = (def.factory || def.fallback)({
    size: modelLot.size, sign: def.sign, type, rng: makeRng(20260825), lot: modelLot,
  });
  model.updateMatrixWorld(true);
  const inverse = model.matrixWorld.clone().invert();
  const bounds = new THREE.Box3().makeEmpty();
  const point = new THREE.Vector3();
  model.traverse((object) => {
    if (!object.isMesh || object.name.startsWith('station-track-')) return;
    object.geometry.computeBoundingBox();
    const box = object.geometry.boundingBox;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      point.set(x, y, z).applyMatrix4(object.matrixWorld).applyMatrix4(inverse);
      bounds.expandByPoint(point);
    }
  });
  return bounds;
}

function groundMeshes(type, lot) {
  const def = LANDMARKS[type];
  const modelLot = { ...lot, size: [...(lot.buildSize || lot.size)] };
  const model = (def.factory || def.fallback)({ size: modelLot.size, sign: def.sign, type, rng: makeRng(20260825), lot: modelLot });
  model.updateMatrixWorld(true);
  const rows = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    let parent = object;
    while (parent) { if (parent.name === 'station-track-structure') return; parent = parent.parent; }
    const box = new THREE.Box3().setFromObject(object);
    if (box.min.y < 0.36 && box.max.y > 0) rows.push({ name: object.name || object.geometry.type, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z });
  });
  return rows.sort((a, b) => Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minZ), Math.abs(b.maxZ)) - Math.max(Math.abs(a.minX), Math.abs(a.maxX), Math.abs(a.minZ), Math.abs(a.maxZ)));
}

const rows = [];
for (const type of ALL_TYPES) {
  const lot = selectLot(type, new Set());
  const bounds = modelBounds(type, lot);
  const [w, d] = lot.buildSize || lot.size;
  rows.push({
    type, lot: lot.id,
    minX: +bounds.min.x.toFixed(2), maxX: +bounds.max.x.toFixed(2),
    minZ: +bounds.min.z.toFixed(2), maxZ: +bounds.max.z.toFixed(2),
    overX: +Math.max(0, -w / 2 - bounds.min.x, bounds.max.x - w / 2).toFixed(2),
    overZ: +Math.max(0, -d / 2 - bounds.min.z, bounds.max.z - d / 2).toFixed(2),
  });
}
console.table(rows.filter((row) => row.overX || row.overZ));
for (const type of ['hospital', 'museum', 'mall']) {
  const lot = selectLot(type, new Set());
  console.log(type, groundMeshes(type, lot).slice(0, 12));
}

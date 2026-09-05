import * as THREE from 'three';

globalThis.document = {
  createElement() {
    return {
      getContext() {
        return {
          clearRect() {}, fillRect() {}, fillText() {},
          measureText(text) { return { width: String(text).length * 24 }; },
        };
      },
    };
  },
};

const [{ LANDMARKS, ALL_TYPES }, { LANDMARK_SIZE_CLASSES, LANDMARK_LOTS }, { makeRng }] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/core/rng.js'),
]);

const rows = [];
for (const type of ALL_TYPES) {
  const def = LANDMARKS[type];
  const sizeClass = def.sizeClass;
  const size = LANDMARK_SIZE_CLASSES[sizeClass].envelope;
  const builder = def.factory || def.fallback;
  if (!builder) throw new Error(`${type} has no procedural builder/fallback`);
  const stationLot = type === 'station'
    ? LANDMARK_LOTS.find((lot) => lot.reservedFor === 'station' || lot.id.includes('station'))
    : null;
  const model = builder({
    size: [...size], sign: def.sign, type, rng: makeRng(20260826),
    lot: stationLot ? { ...stationLot, size: [...size], buildSize: [...size] } : null,
  });
  if (type === 'station') {
    model.getObjectByName('station-track-structure')?.removeFromParent();
    model.userData.train?.removeFromParent();
  }
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const actual = bounds.getSize(new THREE.Vector3());
  rows.push({
    type, sizeClass,
    actual: `${actual.x.toFixed(2)}x${actual.z.toFixed(2)}`,
    allowed: `${size[0]}x${size[1]}`,
    pass: actual.x <= size[0] + 1e-6 && actual.z <= size[1] + 1e-6,
    centeredPass: bounds.min.x >= -size[0] / 2 - 1e-6
      && bounds.max.x <= size[0] / 2 + 1e-6
      && bounds.min.z >= -size[1] / 2 - 1e-6
      && bounds.max.z <= size[1] / 2 + 1e-6,
    minX: +bounds.min.x.toFixed(2), maxX: +bounds.max.x.toFixed(2),
    minZ: +bounds.min.z.toFixed(2), maxZ: +bounds.max.z.toFixed(2),
  });
}
console.table(rows);

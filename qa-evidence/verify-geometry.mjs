import * as THREE from 'three';

// Landmark signs are canvas textures in the browser. Geometry verification only
// needs a minimal canvas-shaped object so the procedural builders can run in Node.
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          clearRect() {},
          fillRect() {},
          fillText() {},
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

function buildHolder(type, lot, seed = 20260825) {
  const def = LANDMARKS[type];
  const builder = def.factory || def.fallback;
  const modelLot = { ...lot, size: [...(lot.buildSize || lot.size)] };
  const model = builder({
    size: modelLot.size,
    sign: def.sign,
    type,
    rng: makeRng(seed),
    lot: modelLot,
  });
  const holder = new THREE.Group();
  holder.name = `landmark:${type}`;
  holder.position.set(lot.pos[0], 0, lot.pos[1]);
  holder.rotation.y = lot.rot;
  holder.add(model);
  holder.updateMatrixWorld(true);
  return { holder, model };
}

function intersectionSize(a, b) {
  const overlap = a.clone().intersect(b);
  if (overlap.isEmpty()) return null;
  return overlap.getSize(new THREE.Vector3());
}

const rows = [];
for (const type of ALL_TYPES) {
  const def = LANDMARKS[type];
  const builder = def.factory || def.fallback;
  if (!builder) continue;
  const size = def.footprint || [16, 14];
  const model = builder({
    size,
    sign: def.sign,
    type,
    rng: makeRng(20260825),
    lot: def.lot ? { id: def.lot, pos: [44, 15], rot: -Math.PI / 2, size } : null,
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  rows.push({
    type,
    minY: Number(bounds.min.y.toFixed(2)),
    maxY: Number(bounds.max.y.toFixed(2)),
    width: Number((bounds.max.x - bounds.min.x).toFixed(2)),
    depth: Number((bounds.max.z - bounds.min.z).toFixed(2)),
  });
}

console.table(rows.sort((a, b) => b.maxY - a.maxY));

const mixes = [
  [
    'school', 'park', 'library', 'hospital', 'museum', 'mall', 'station', 'stadium',
    'castle', 'airport',
  ],
  [
    'airport', 'amusementPark', 'hotel', 'zoo', 'supermarket', 'playground',
    'house', 'police', 'fire', 'bank',
  ],
  [
    'busStation', 'gasStation', 'aquarium', 'temple', 'farm', 'pool', 'gym',
    'cinema', 'convenience', 'restaurant',
  ],
  [
    'cafe', 'bakery', 'bookstore', 'school', 'park', 'station', 'stadium',
    'museum', 'mall', 'library',
  ],
];

let modelOverlapCount = 0;
for (let mixIndex = 0; mixIndex < mixes.length; mixIndex++) {
  const taken = new Set();
  const built = [];
  for (const type of mixes[mixIndex]) {
    const lot = selectLot(type, taken);
    if (!lot) throw new Error(`No lot for ${type} in representative mix ${mixIndex + 1}`);
    taken.add(lot.id);
    const item = buildHolder(type, lot, 20260825 + mixIndex);
    built.push({ type, lot, ...item });
  }

  // A whole-station Box3 spans the map by design. Check its station building
  // separately from the elevated structure, which gets mesh-level checks below.
  const station = built.find((item) => item.type === 'station');
  const track = station?.model.getObjectByName('station-track-structure');
  const train = station?.model.userData.train;
  if (track) station.model.remove(track);
  if (train) station.model.remove(train);
  station?.holder.updateMatrixWorld(true);

  const bounds = built.map((item) => ({
    ...item,
    bounds: new THREE.Box3().setFromObject(item.holder),
  }));
  for (let a = 0; a < bounds.length; a++) {
    for (let b = a + 1; b < bounds.length; b++) {
      const size = intersectionSize(bounds[a].bounds, bounds[b].bounds);
      if (!size || size.x < 0.02 || size.y < 0.02 || size.z < 0.02) continue;
      modelOverlapCount += 1;
      console.error(
        `MIX ${mixIndex + 1} OVERLAP: ${bounds[a].type}@${bounds[a].lot.id}`
        + ` / ${bounds[b].type}@${bounds[b].lot.id}`,
        size.toArray().map((n) => Number(n.toFixed(2)))
      );
    }
  }
  if (track) station.model.add(track);
  if (train) station.model.add(train);
}

const stationLot = LANDMARK_LOTS.find((lot) => lot.id === 'lot-station');
const station = buildHolder('station', stationLot, 20260825);
const track = station.model.getObjectByName('station-track-structure');
station.holder.updateMatrixWorld(true);
const trackParts = (track.userData.clearanceSegments || []).map((segment) => ({
  name: segment.name,
  bounds: segment.bounds.clone().applyMatrix4(track.matrixWorld),
}));
track.traverse((object) => {
  // Merged line meshes have a whole-span AABB that loses the local height
  // profile. Their individual source-segment bounds above retain it. Piers
  // remain separate meshes and can be checked directly.
  if (object.name === 'station-track-pier') {
    trackParts.push({ name: object.name || object.type, bounds: new THREE.Box3().setFromObject(object) });
  }
});
const deck = track.getObjectByName('station-track-deck');
const deckBounds = new THREE.Box3().setFromObject(deck);

const crossedLots = [];
for (const lot of LANDMARK_LOTS) {
  if (lot.id === 'lot-station') continue;
  const candidates = [];
  for (const type of ALL_TYPES) {
    if (type === 'station') continue;
    const def = LANDMARKS[type];
    const size = lot.buildSize || lot.size;
    const needed = def.footprint || [16, 14];
    if (!def.zones.some((zone) => lot.zones.includes(zone))) continue;
    if (size[0] < needed[0] * 0.62 || size[1] < needed[1] * 0.62) continue;
    const candidate = buildHolder(type, lot, 20260825);
    const bounds = new THREE.Box3().setFromObject(candidate.holder);
    const crossesHorizontally = bounds.max.x > deckBounds.min.x && bounds.min.x < deckBounds.max.x
      && bounds.max.z > deckBounds.min.z && bounds.min.z < deckBounds.max.z;
    if (crossesHorizontally) candidates.push({ type, maxY: bounds.max.y });
  }
  if (candidates.length) {
    candidates.sort((a, b) => b.maxY - a.maxY);
    crossedLots.push({ lot: lot.id, tallest: candidates[0].type, maxY: Number(candidates[0].maxY.toFixed(2)) });
  }
}
console.table(crossedLots);

let trackOverlapCount = 0;
let testedTrackPlacements = 0;
for (const lot of LANDMARK_LOTS) {
  if (lot.id === 'lot-station') continue;
  for (const type of ALL_TYPES) {
    const def = LANDMARKS[type];
    if (type === 'station' || !def.zones.some((zone) => lot.zones.includes(zone))) continue;
    const size = lot.buildSize || lot.size;
    const needed = def.footprint || [16, 14];
    if (size[0] < needed[0] * 0.62 || size[1] < needed[1] * 0.62) continue;
    const candidate = buildHolder(type, lot, 20260825);
    candidate.holder.updateMatrixWorld(true);
    const candidateParts = [];
    candidate.holder.traverse((object) => {
      if (object.isMesh || object.isInstancedMesh) {
        candidateParts.push(new THREE.Box3().setFromObject(object));
      }
    });
    testedTrackPlacements += 1;
    for (const part of trackParts) {
      for (const bounds of candidateParts) {
        const size = intersectionSize(part.bounds, bounds);
        if (!size || size.x < 0.02 || size.y < 0.02 || size.z < 0.02) continue;
        trackOverlapCount += 1;
        console.error(
          `TRACK OVERLAP: ${part.name} / ${type}@${lot.id}`,
          size.toArray().map((n) => Number(n.toFixed(2))),
          `trackY=${part.bounds.min.y.toFixed(2)}..${part.bounds.max.y.toFixed(2)}`,
          `geometryY=${bounds.min.y.toFixed(2)}..${bounds.max.y.toFixed(2)}`,
          `trackZ=${part.bounds.min.z.toFixed(2)}..${part.bounds.max.z.toFixed(2)}`
        );
      }
    }
  }
}

console.log(JSON.stringify({
  representativeTowns: mixes.length,
  representativeModels: mixes.reduce((sum, mix) => sum + mix.length, 0),
  modelOverlapCount,
  trackPlacementsTested: testedTrackPlacements,
  trackPartCount: trackParts.length,
  trackOverlapCount,
  deckWorldMin: deckBounds.min.toArray().map((n) => Number(n.toFixed(2))),
  deckWorldMax: deckBounds.max.toArray().map((n) => Number(n.toFixed(2))),
}, null, 2));

if (modelOverlapCount || trackOverlapCount) process.exitCode = 1;

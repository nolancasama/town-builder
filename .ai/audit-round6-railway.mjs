/*
 * Round 6 railway clearance audit.
 *
 * Derives the railway corridor and deck underside from the authored station
 * model. The map-wide track structure and moving train are excluded only from
 * the station-local envelope measurement; all other station geometry must fit.
 */
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

const [
  { LANDMARKS, ALL_TYPES },
  { LANDMARK_LOTS, LANDMARK_SIZE_CLASSES },
  { lotsFor },
  { makeRng },
] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/buildings/index.js'),
  import('../src/core/rng.js'),
]);

const EPSILON = 1e-6;
const OVERHEAD_MARGIN = 0.25;

function fail(message, details) {
  throw new Error(`${message}\n${JSON.stringify(details, null, 2)}`);
}

function makeModel(type, lot) {
  const def = LANDMARKS[type];
  const build = def.factory || def.fallback;
  if (!build) fail(`${type} has no procedural/factory builder`, {});
  const modelLot = { ...lot, size: [...lot.buildSize] };
  const model = build({
    size: modelLot.size,
    sign: def.sign,
    type,
    rng: makeRng(20260826),
    lot: modelLot,
  });
  model.position.set(lot.pos[0], 0, lot.pos[1]);
  model.rotation.y = lot.rot;
  model.updateMatrixWorld(true);
  return model;
}

function compatible(type, lot) {
  return LANDMARKS[type].lot === lot.id
    || lotsFor(type, new Set()).some((candidate) => candidate.id === lot.id);
}

function overlapsXZ(a, b) {
  return a.max.x > b.min.x + EPSILON
    && a.min.x < b.max.x - EPSILON
    && a.max.z > b.min.z + EPSILON
    && a.min.z < b.max.z - EPSILON;
}

function lotBoundsXZ(lot) {
  const [w, d] = lot.size;
  const c = Math.cos(lot.rot);
  const s = Math.sin(lot.rot);
  const corners = [
    [-w / 2, -d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [w / 2, d / 2],
  ].map(([x, z]) => [lot.pos[0] + c * x + s * z, lot.pos[1] - s * x + c * z]);
  return {
    minX: Math.min(...corners.map(([x]) => x)),
    maxX: Math.max(...corners.map(([x]) => x)),
    minZ: Math.min(...corners.map(([, z]) => z)),
    maxZ: Math.max(...corners.map(([, z]) => z)),
  };
}

const stationLot = LANDMARK_LOTS.find((lot) => lot.reservedFor === 'station' || lot.id === LANDMARKS.station.lot);
if (!stationLot) fail('station parcel not found', {});
const station = makeModel('station', stationLot);
const track = station.getObjectByName('station-track-structure');
const deck = station.getObjectByName('station-track-deck');
if (!track || !deck) fail('named station track structure/deck not found', {});

const corridor = new THREE.Box3().setFromObject(deck);
const deckUnderside = corridor.min.y;
const pierBoxes = [];
track.traverse((object) => {
  if (object.name === 'station-track-pier') {
    pierBoxes.push(new THREE.Box3().setFromObject(object));
  }
});

// Measure the station itself independently of infrastructure intentionally
// spanning the map. Platform, canopy, access core and station house remain.
track.removeFromParent();
const train = station.userData.train;
if (train) train.removeFromParent();
station.position.set(0, 0, 0);
station.rotation.y = 0;
station.updateMatrixWorld(true);
const stationLocal = new THREE.Box3().setFromObject(station);
const stationSize = stationLocal.getSize(new THREE.Vector3());
const stationAllowed = LANDMARK_SIZE_CLASSES[LANDMARKS.station.sizeClass].envelope;
if (stationSize.x > stationAllowed[0] + EPSILON || stationSize.z > stationAllowed[1] + EPSILON) {
  fail('station-local geometry exceeds its class envelope', {
    actual: [stationSize.x, stationSize.z], allowed: stationAllowed,
  });
}

const crossedPlots = [];
for (const lot of LANDMARK_LOTS) {
  if (lot.id === stationLot.id) continue;
  const bounds = lotBoundsXZ(lot);
  const plotBox = new THREE.Box3(
    new THREE.Vector3(bounds.minX, -Infinity, bounds.minZ),
    new THREE.Vector3(bounds.maxX, Infinity, bounds.maxZ)
  );
  if (overlapsXZ(plotBox, corridor)) crossedPlots.push(lot.id);
}

let testedPlacements = 0;
let worst = null;
const conflicts = [];
for (const lot of LANDMARK_LOTS) {
  if (lot.id === stationLot.id) continue;
  for (const type of ALL_TYPES) {
    if (type === 'station' || !compatible(type, lot)) continue;
    const model = makeModel(type, lot);
    testedPlacements += 1;
    model.traverse((object) => {
      if (!object.isMesh) return;
      const bounds = new THREE.Box3().setFromObject(object);
      if (bounds.isEmpty()) return;

      for (const pier of pierBoxes) {
        if (bounds.intersectsBox(pier)) {
          conflicts.push({ type, lot: lot.id, mesh: object.name || object.geometry.type, part: 'pier' });
        }
      }

      if (!overlapsXZ(bounds, corridor)) return;
      const clearance = deckUnderside - bounds.max.y;
      if (!worst || clearance < worst.clearance) {
        worst = { type, lot: lot.id, mesh: object.name || object.geometry.type, clearance };
      }
      if (clearance < OVERHEAD_MARGIN - EPSILON) {
        conflicts.push({
          type,
          lot: lot.id,
          mesh: object.name || object.geometry.type,
          part: 'deck corridor',
          clearance,
        });
      }
    });
  }
}

if (conflicts.length) fail('railway clearance conflicts found', conflicts.slice(0, 30));
console.log(JSON.stringify({
  status: 'PASS',
  corridor: {
    minX: corridor.min.x,
    maxX: corridor.max.x,
    minZ: corridor.min.z,
    maxZ: corridor.max.z,
    deckUnderside,
  },
  stationLocal: {
    actual: [stationSize.x, stationSize.z],
    allowed: stationAllowed,
  },
  crossedPlots,
  testedPlacements,
  worstOverheadClearance: worst,
  pierCount: pierBoxes.length,
  requiredMargin: OVERHEAD_MARGIN,
}, null, 2));

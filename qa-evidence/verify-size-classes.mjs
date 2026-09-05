import fs from 'node:fs/promises';
import * as THREE from 'three';

// Procedural signs only need a canvas-shaped stub during Node geometry audits.
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

const [town, landmarkConfig, buildingSystem, choiceSystem, progression, roads, rngModule] = await Promise.all([
  import('../src/config/town.js'),
  import('../src/config/landmarks.js'),
  import('../src/buildings/index.js'),
  import('../src/systems/choices.js'),
  import('../src/config/progression.js'),
  import('../src/world/roads.js'),
  import('../src/core/rng.js'),
]);

const {
  LANDMARK_SIZE_CLASSES, LANDMARK_LOTS, ROAD_SEGMENTS, ROAD_WIDTH, WORLD,
} = town;
const { LANDMARKS, ALL_TYPES } = landmarkConfig;
const { lotsFor, selectLot } = buildingSystem;
const { availableChoices, pickChoices } = choiceSystem;
const { DEFAULT_UNLOCKED } = progression;
const { SIDEWALK_BY_CLASS } = roads;
const { makeRng } = rngModule;

if (!LANDMARK_SIZE_CLASSES) {
  throw new Error('LANDMARK_SIZE_CLASSES is not exported by src/config/town.js');
}

const round = (value, places = 3) => Number(value.toFixed(places));
const sizeOf = (value, names) => {
  for (const name of names) {
    if (Array.isArray(value?.[name])) return value[name];
  }
  return null;
};
const usableFor = (sizeClass) => {
  const value = LANDMARK_SIZE_CLASSES[sizeClass];
  const result = sizeOf(value, ['usable', 'envelope', 'buildSize', 'footprint']);
  if (!result) throw new Error(`Size class ${sizeClass} has no usable envelope`);
  return result;
};
const reservedFor = (plotClass) => {
  const value = LANDMARK_SIZE_CLASSES[plotClass];
  const result = sizeOf(value, ['reserved', 'plot', 'size']);
  if (!result) throw new Error(`Size class ${plotClass} has no reserved plot`);
  return result;
};

function detachStationNetwork(model) {
  const detached = [];
  const track = model.getObjectByName('station-track-structure');
  const train = model.userData.train;
  for (const object of [track, train]) {
    if (object?.parent) {
      detached.push({ object, parent: object.parent });
      object.parent.remove(object);
    }
  }
  return () => {
    for (const { object, parent } of detached) parent.add(object);
  };
}

function builderArgs(type, lot = null, seed = 20260826) {
  const def = LANDMARKS[type];
  const usable = usableFor(def.sizeClass);
  const modelLot = lot ? { ...lot, size: [...usable], buildSize: [...usable] } : null;
  return {
    size: [...usable], sign: def.sign, type, rng: makeRng(seed), lot: modelLot,
  };
}

function buildModel(type, lot = null, seed = 20260826) {
  const def = LANDMARKS[type];
  const builder = def.factory || def.fallback;
  if (!builder) throw new Error(`${type} has no procedural builder for the Node audit`);
  const model = builder(builderArgs(type, lot, seed));
  model.updateMatrixWorld(true);
  return model;
}

function buildHolder(type, lot, seed = 20260826) {
  const model = buildModel(type, lot, seed);
  const holder = new THREE.Group();
  holder.name = `landmark:${type}`;
  holder.position.set(lot.pos[0], 0, lot.pos[1]);
  holder.rotation.y = lot.rot || 0;
  holder.add(model);
  holder.updateMatrixWorld(true);
  return { holder, model };
}

function boundsSize(object) {
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  return { bounds, width: size.x, depth: size.z, height: size.y };
}

function polygonForRect(cx, cz, width, depth, rot = 0) {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [
    [-width / 2, -depth / 2], [width / 2, -depth / 2],
    [width / 2, depth / 2], [-width / 2, depth / 2],
  ].map(([x, z]) => ({ x: cx + x * cos + z * sin, z: cz - x * sin + z * cos }));
}

function polygonForRoadRect(a, b, width, extraLength = 0, lateral = 0) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const ux = dx / len;
  const uz = dz / len;
  const rx = -uz;
  const rz = ux;
  const cx = (a[0] + b[0]) / 2 + rx * lateral;
  const cz = (a[1] + b[1]) / 2 + rz * lateral;
  const halfLength = (len + extraLength) / 2;
  const halfWidth = width / 2;
  return [
    { x: cx - ux * halfLength - rx * halfWidth, z: cz - uz * halfLength - rz * halfWidth },
    { x: cx + ux * halfLength - rx * halfWidth, z: cz + uz * halfLength - rz * halfWidth },
    { x: cx + ux * halfLength + rx * halfWidth, z: cz + uz * halfLength + rz * halfWidth },
    { x: cx - ux * halfLength + rx * halfWidth, z: cz - uz * halfLength + rz * halfWidth },
  ];
}

const axesFor = (polygon) => polygon.map((point, index) => {
  const next = polygon[(index + 1) % polygon.length];
  const ex = next.x - point.x;
  const ez = next.z - point.z;
  const length = Math.hypot(ex, ez);
  return { x: -ez / length, z: ex / length };
});

function signedPolygonGap(a, b) {
  let minimumOverlap = Infinity;
  let separated = false;
  for (const axis of [...axesFor(a), ...axesFor(b)]) {
    const project = (polygon) => {
      const values = polygon.map((p) => p.x * axis.x + p.z * axis.z);
      return [Math.min(...values), Math.max(...values)];
    };
    const [aMin, aMax] = project(a);
    const [bMin, bMax] = project(b);
    const overlap = Math.min(aMax, bMax) - Math.max(aMin, bMin);
    if (overlap < 0) separated = true;
    minimumOverlap = Math.min(minimumOverlap, overlap);
  }
  if (!separated) return -minimumOverlap;

  const pointSegmentDistance = (p, v, w) => {
    const vx = w.x - v.x;
    const vz = w.z - v.z;
    const lengthSq = vx * vx + vz * vz;
    const t = lengthSq > 0
      ? Math.max(0, Math.min(1, ((p.x - v.x) * vx + (p.z - v.z) * vz) / lengthSq))
      : 0;
    return Math.hypot(p.x - (v.x + t * vx), p.z - (v.z + t * vz));
  };
  let result = Infinity;
  for (let ai = 0; ai < a.length; ai++) {
    for (let bi = 0; bi < b.length; bi++) {
      result = Math.min(
        result,
        pointSegmentDistance(a[ai], b[bi], b[(bi + 1) % b.length]),
        pointSegmentDistance(b[bi], a[ai], a[(ai + 1) % a.length]),
      );
    }
  }
  return result;
}

function roadSurfacePolygons() {
  const polygons = [];
  for (const [index, segment] of ROAD_SEGMENTS.entries()) {
    const width = ROAD_WIDTH[segment.w] || ROAD_WIDTH.minor;
    const sidewalk = SIDEWALK_BY_CLASS[segment.w] || SIDEWALK_BY_CLASS.minor;
    const dx = segment.b[0] - segment.a[0];
    const dz = segment.b[1] - segment.a[1];
    const len = Math.hypot(dx, dz);
    polygons.push({
      id: `road:${index}:asphalt`,
      polygon: polygonForRoadRect(segment.a, segment.b, width, width),
    });
    const trim = Math.min(len * 0.34, width * 0.75 + 2.5);
    const walkLen = Math.max(2, len - trim * 2);
    for (const side of [-1, 1]) {
      polygons.push({
        id: `road:${index}:sidewalk:${side}`,
        polygon: polygonForRoadRect(
          segment.a, segment.b, sidewalk, walkLen - len,
          side * (width / 2 + sidewalk / 2),
        ),
      });
    }
  }
  return polygons;
}

function boxIntersectionSize(a, b) {
  const intersection = a.clone().intersect(b);
  if (intersection.isEmpty()) return null;
  return intersection.getSize(new THREE.Vector3());
}

const sizeRows = [];
for (const type of ALL_TYPES) {
  const def = LANDMARKS[type];
  const stationLot = type === 'station'
    ? LANDMARK_LOTS.find((lot) => lot.reservedFor === 'station' || lot.id.includes('station'))
    : null;
  const model = buildModel(type, stationLot);
  const restore = type === 'station' ? detachStationNetwork(model) : () => {};
  model.updateMatrixWorld(true);
  const measured = boundsSize(model);
  restore();
  const allowed = usableFor(def.sizeClass);
  const epsilon = 0.015;
  sizeRows.push({
    landmark: type,
    class: def.sizeClass,
    actual: [round(measured.width, 2), round(measured.depth, 2)],
    allowed: [...allowed],
    pass: measured.width <= allowed[0] + epsilon && measured.depth <= allowed[1] + epsilon,
  });
}

const lotPolygons = LANDMARK_LOTS.map((lot) => ({
  lot,
  polygon: polygonForRect(lot.pos[0], lot.pos[1], lot.size[0], lot.size[1], lot.rot || 0),
}));
const roadPolygons = roadSurfacePolygons();
let worstRoad = { margin: Infinity, lot: null, road: null };
for (const item of lotPolygons) {
  for (const road of roadPolygons) {
    const margin = signedPolygonGap(item.polygon, road.polygon);
    if (margin < worstRoad.margin) worstRoad = { margin, lot: item.lot.id, road: road.id };
  }
}

let worstLotGap = { gap: Infinity, a: null, b: null };
for (let a = 0; a < lotPolygons.length; a++) {
  for (let b = a + 1; b < lotPolygons.length; b++) {
    const gap = signedPolygonGap(lotPolygons[a].polygon, lotPolygons[b].polygon);
    if (gap < worstLotGap.gap) {
      worstLotGap = { gap, a: lotPolygons[a].lot.id, b: lotPolygons[b].lot.id };
    }
  }
}

const stationLot = LANDMARK_LOTS.find((lot) => lot.reservedFor === 'station' || lot.id.includes('station'));
if (!stationLot) throw new Error('No station parcel found');
const station = buildHolder('station', stationLot);
const track = station.model.getObjectByName('station-track-structure');
if (!track) throw new Error('Station model has no station-track-structure');
station.holder.updateMatrixWorld(true);
const trackParts = (track.userData.clearanceSegments || []).map((segment) => ({
  name: segment.name,
  bounds: segment.bounds.clone().applyMatrix4(track.matrixWorld),
}));
track.traverse((object) => {
  if (object.name === 'station-track-pier') {
    trackParts.push({ name: object.name, bounds: new THREE.Box3().setFromObject(object) });
  }
});

const railwayFailures = [];
const railwayClearances = [];
let railwayPlacements = 0;
for (const lot of LANDMARK_LOTS) {
  if (lot.id === stationLot.id) continue;
  for (const type of ALL_TYPES) {
    if (type === 'station' || !lotsFor(type, new Set()).some((candidate) => candidate.id === lot.id)) continue;
    const candidate = buildHolder(type, lot, 20260827);
    const candidateParts = [];
    candidate.holder.traverse((object) => {
      if (object.isMesh || object.isInstancedMesh) {
        candidateParts.push({ name: object.name || object.type, bounds: new THREE.Box3().setFromObject(object) });
      }
    });
    railwayPlacements += 1;
    let nearestVertical = Infinity;
    let horizontalCrossing = false;
    for (const rail of trackParts) {
      for (const part of candidateParts) {
        const xzCrosses = rail.bounds.max.x > part.bounds.min.x && rail.bounds.min.x < part.bounds.max.x
          && rail.bounds.max.z > part.bounds.min.z && rail.bounds.min.z < part.bounds.max.z;
        if (!xzCrosses) continue;
        horizontalCrossing = true;
        const verticalGap = Math.max(
          rail.bounds.min.y - part.bounds.max.y,
          part.bounds.min.y - rail.bounds.max.y,
        );
        nearestVertical = Math.min(nearestVertical, verticalGap);
        const overlap = boxIntersectionSize(rail.bounds, part.bounds);
        if (overlap && overlap.x > 0.015 && overlap.y > 0.015 && overlap.z > 0.015) {
          railwayFailures.push({
            lot: lot.id,
            landmark: type,
            railPart: rail.name,
            modelPart: part.name,
            overlap: [round(overlap.x), round(overlap.y), round(overlap.z)],
          });
        }
      }
    }
    if (horizontalCrossing) {
      railwayClearances.push({ lot: lot.id, landmark: type, verticalGap: round(nearestVertical) });
    }
  }
}

const runCount = Number(process.env.ROUND6_RANDOM_RUNS || 50000);
function simulate(label, availableTypes, mode) {
  let failures = 0;
  let minCompleted = 10;
  let firstFailure = null;
  for (let seed = 1; seed <= runCount; seed++) {
    const rng = makeRng(0x6a09e667 ^ seed);
    const built = [];
    const taken = new Set();
    const allowed = new Set(availableTypes);
    const permutation = [...availableTypes];
    for (let i = permutation.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    for (let roundIndex = 0; roundIndex < 10; roundIndex++) {
      const available = availableChoices(built, taken, allowed);
      let choice = null;
      if (mode === 'offered') {
        const offered = pickChoices(built, taken, rng, 3, allowed);
        choice = offered[Math.floor(rng() * offered.length)] || null;
      } else if (mode === 'permutation') {
        choice = permutation.find((type) => available.includes(type)) || null;
      } else {
        choice = available[Math.floor(rng() * available.length)] || null;
      }
      if (!choice) break;
      const lot = selectLot(choice, taken);
      if (!lot) break;
      built.push(choice);
      taken.add(lot.id);
    }
    minCompleted = Math.min(minCompleted, built.length);
    if (built.length < 10) {
      failures += 1;
      firstFailure ||= { seed, built, taken: [...taken] };
    }
  }
  return { label, runs: runCount, failures, minCompleted, firstFailure };
}

const randomizedRuns = [
  simulate('all-types direct random', ALL_TYPES, 'direct'),
  simulate('all-types three-card choices', ALL_TYPES, 'offered'),
  simulate('all-types random permutations', ALL_TYPES, 'permutation'),
  simulate('default-unlocked three-card choices', DEFAULT_UNLOCKED, 'offered'),
];

const classInventory = Object.fromEntries(Object.keys(LANDMARK_SIZE_CLASSES).map((name) => [
  name,
  {
    landmarks: ALL_TYPES.filter((type) => LANDMARKS[type].sizeClass === name).length,
    parcels: LANDMARK_LOTS.filter((lot) => lot.plotClass === name).length,
    usable: [...usableFor(name)],
    reserved: [...reservedFor(name)],
  },
]));

const result = {
  generatedAt: new Date().toISOString(),
  world: { ...WORLD },
  classInventory,
  landmarks: sizeRows,
  boundsFailures: sizeRows.filter((row) => !row.pass),
  parcelRoadClearance: { ...worstRoad, margin: round(worstRoad.margin) },
  parcelPairClearance: { ...worstLotGap, gap: round(worstLotGap.gap) },
  railway: {
    placementsTested: railwayPlacements,
    crossingPlacements: railwayClearances.length,
    minimumVerticalClearance: railwayClearances.length
      ? Math.min(...railwayClearances.map((item) => item.verticalGap))
      : null,
    failures: railwayFailures,
  },
  randomizedRuns,
};

const tableLines = [
  '| Landmark | Class | Actual X x Z | Allowed X x Z | Result |',
  '|---|---:|---:|---:|---:|',
  ...sizeRows.map((row) => `| ${row.landmark} | ${row.class} | ${row.actual.join(' x ')} | ${row.allowed.join(' x ')} | ${row.pass ? 'PASS' : 'FAIL'} |`),
];
const runLines = randomizedRuns.map((run) => (
  `- ${run.label}: ${run.runs.toLocaleString('en-US')} runs, ${run.failures} dead ends, minimum ${run.minCompleted}/10 completed.`
));
const markdown = `# Round 6 size-class verification\n\n`
  + `Generated ${result.generatedAt}. Only \`ALL_TYPES\` (${ALL_TYPES.length} buildable landmarks) are measured. `
  + `The station's town-spanning track structure and train are excluded from its local envelope.\n\n`
  + `## Landmark bounds\n\n${tableLines.join('\n')}\n\n`
  + `## Parcel geometry\n\n`
  + `- Closest reserved parcel to any rendered road/road-sidewalk surface: **${result.parcelRoadClearance.margin} units** `
  + `(\`${result.parcelRoadClearance.lot}\` / \`${result.parcelRoadClearance.road}\`).\n`
  + `- Closest reserved-parcel pair: **${result.parcelPairClearance.gap} units** `
  + `(\`${result.parcelPairClearance.a}\` / \`${result.parcelPairClearance.b}\`).\n\n`
  + `## Railway\n\n`
  + `Tested ${result.railway.placementsTested} compatible landmark/parcel placements; `
  + `${result.railway.crossingPlacements} cross the corridor in X/Z. `
  + `Minimum vertical clearance is ${result.railway.minimumVerticalClearance ?? 'n/a'} units; `
  + `**${result.railway.failures.length} physical intersections**.\n\n`
  + `## Randomized ten-building runs\n\n${runLines.join('\n')}\n`;

await Promise.all([
  fs.writeFile(new URL('./round6-size-audit.json', import.meta.url), `${JSON.stringify(result, null, 2)}\n`),
  fs.writeFile(new URL('./round6-size-audit.md', import.meta.url), markdown),
]);

console.log(markdown);
if (
  result.boundsFailures.length
  || result.parcelRoadClearance.margin <= 0
  || result.parcelPairClearance.gap <= 0
  || result.railway.failures.length
  || randomizedRuns.some((run) => run.failures)
) process.exitCode = 1;

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LANDMARKS, MODEL_BASE } from '../config/landmarks.js';
import { LANDMARK_LOTS } from '../config/town.js';

/**
 * LANDMARK CREATION
 * -----------------
 * One place decides where a building's geometry comes from. The priority is
 * deliberate:
 *
 *   1. `factory`  - an implementation that already exists in this project.
 *                   These are finished, hand-tuned models (the original eight
 *                   landmarks) and are always preferred: a downloaded GLB never
 *                   silently replaces work that already looks good.
 *   2. `model`    - assets/buildings/<name>.glb, if the file is actually there.
 *   3. `fallback` - the procedural placeholder for the wider building pool.
 *
 * So dropping `zoo.glb` into public/assets/buildings upgrades the zoo with no
 * code change, while `stadium.glb` is ignored unless the stadium's `factory`
 * entry is removed from the registry.
 */

const loader = new GLTFLoader();
const missing = new Set();

async function tryLoadGLB(url) {
  if (missing.has(url)) return null;
  try {
    // Probe first so a missing asset is a quiet 404 rather than a loader error.
    const head = await fetch(url, { method: 'HEAD' });
    const type = head.headers.get('content-type') || '';
    if (!head.ok || type.includes('text/html')) {
      missing.add(url);
      return null;
    }
    const gltf = await loader.loadAsync(url);
    return gltf.scene;
  } catch (err) {
    missing.add(url);
    return null;
  }
}

/** Scale + centre an imported model so it sits on the ground inside its lot. */
function fitToLot(object, lot, def) {
  const bounds = new THREE.Box3().setFromObject(object);
  const dims = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();

  const fit = Math.min((lot.size[0] - 2) / (dims.x || 1), (lot.size[1] - 2) / (dims.z || 1));
  const scale = (def.modelScale || 1) * (Number.isFinite(fit) && fit > 0 ? fit : 1);

  object.position.set(-centre.x, -bounds.min.y, -centre.z);
  object.scale.multiplyScalar(scale);
  object.position.multiplyScalar(scale);
  object.position.y += def.modelOffsetY || 0;
  object.rotation.y += def.modelRotation || 0;
  object.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  wrapper.add(object);
  return wrapper;
}

const area = (size) => size[0] * size[1];

/** Does this landmark have somewhere to go, given the lots already used? */
export function lotsFor(type, takenLotIds) {
  const def = LANDMARKS[type];
  const needed = def.footprint || [16, 14];
  return LANDMARK_LOTS.filter(
    (lot) =>
      !takenLotIds.has(lot.id) &&
      lot.zones.some((z) => def.zones.includes(z)) &&
      lot.size[0] >= needed[0] * 0.62 &&
      lot.size[1] >= needed[1] * 0.62
  );
}

export function canPlace(type, takenLotIds) {
  const def = LANDMARKS[type];
  if (def.lot && !takenLotIds.has(def.lot)) return true;
  return lotsFor(type, takenLotIds).length > 0;
}

/**
 * Picks the lot for a landmark: its designed plot if it has one and it is free,
 * otherwise the free compatible lot closest in size to what it wants - so a
 * bakery does not end up marooned in the middle of a stadium-sized field.
 */
export function selectLot(type, takenLotIds) {
  const def = LANDMARKS[type];
  if (def.lot) {
    const preferred = LANDMARK_LOTS.find((l) => l.id === def.lot);
    if (preferred && !takenLotIds.has(preferred.id)) return preferred;
  }
  const candidates = lotsFor(type, takenLotIds);
  if (!candidates.length) {
    return LANDMARK_LOTS.find((l) => !takenLotIds.has(l.id)) || null;
  }
  const want = area(def.footprint || [16, 14]);
  return candidates.sort((a, b) => Math.abs(area(a.size) - want) - Math.abs(area(b.size) - want))[0];
}

/**
 * Builds a landmark on a lot and returns a group positioned there, ready for
 * the construction sequence to animate into place.
 */
export async function loadLandmark(type, lot, rng) {
  const def = LANDMARKS[type];
  const holder = new THREE.Group();
  holder.name = `landmark:${type}`;
  holder.position.set(lot.pos[0], 0, lot.pos[1]);
  holder.rotation.y = lot.rot;

  const args = { size: lot.size, sign: def.sign, rng, type, lot };
  let model = null;
  let source = 'procedural';

  if (def.factory) {
    model = def.factory(args);
    source = 'existing';
  } else {
    const glb = def.model ? await tryLoadGLB(MODEL_BASE + def.model) : null;
    if (glb) {
      model = fitToLot(glb, lot, def);
      source = 'glb';
    } else {
      model = def.fallback(args);
    }
  }

  holder.add(model);
  holder.userData.type = type;
  holder.userData.def = def;
  holder.userData.lot = lot;
  holder.userData.source = source;
  holder.userData.animate = model.userData.animate || null;
  holder.userData.react = model.userData.react || null;
  holder.userData.model = model;   // activities reach the builder's own parts through this
  return holder;
}

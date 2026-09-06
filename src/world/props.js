import * as THREE from 'three';
import { PALETTE as P, mat, glow, roundedBox, box, cylinder, sphere, mesh, makeSwayMaterial, signPlane } from '../core/materials.js';

/**
 * Reusable scenery pieces: trees, houses, shops, street furniture, cars.
 * Both the starting town and the landmark buildings pull from here so the whole
 * map shares one visual language.
 */

/* ---------------- shared sway materials (foliage + crops) ---------------- */
export const LEAF_MATS = [
  makeSwayMaterial(P.leaf, { amount: 0.05, speed: 1.2 }),
  makeSwayMaterial(P.leafDark, { amount: 0.045, speed: 1.05 }),
  makeSwayMaterial(P.leafLight, { amount: 0.055, speed: 1.35 }),
];
export const RICE_MAT = makeSwayMaterial(P.rice, { amount: 0.22, speed: 2.1 });

/* ---------------- geometry helpers ---------------- */

const geoCache = new Map();

/** Triangular-prism gable roof, extruded along Z. */
export function gableRoof(w, h, d) {
  const key = `gable|${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, h);
    shape.closePath();
    g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -d / 2);
    geoCache.set(key, g);
  }
  return g;
}

/** Hipped (pyramid) roof sized to a rectangular footprint. */
export function hipRoof(w, h, d) {
  const key = `hip|${w}|${h}|${d}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(0.001, Math.SQRT1_2, h, 4, 1);
    g.rotateY(Math.PI / 4);
    g.scale(w, 1, d);
    g.translate(0, h / 2, 0);
    geoCache.set(key, g);
  }
  return g;
}

/* ---------------- trees ---------------- */

/**
 * Trees come in three silhouettes so the tree line never looks copy-pasted.
 * Geometry is deliberately chunky - a handful of spheres reads as "toy tree"
 * far better than a detailed model at this camera distance.
 */
export function makeTree(rng, { scale = 1, kind = null } = {}) {
  const g = new THREE.Group();
  const type = kind || rng.pick(['round', 'round', 'pine', 'tall']);
  const leafMat = rng.pick(LEAF_MATS);
  const trunkMat = mat(rng.chance(0.5) ? P.trunk : P.woodDark);

  if (type === 'pine') {
    const h = rng.range(1.1, 1.6);
    g.add(mesh(cylinder(0.16, 0.24, h * 1.6, 6), trunkMat, { y: h * 0.8 }));
    for (let i = 0; i < 3; i++) {
      const r = 1.5 - i * 0.38;
      g.add(mesh(cylinder(0.04, r, 1.9, 8), leafMat, { y: h * 1.1 + i * 1.15 }));
    }
  } else if (type === 'tall') {
    const h = rng.range(3.2, 4.4);
    g.add(mesh(cylinder(0.15, 0.22, h, 6), trunkMat, { y: h / 2 }));
    const crown = mesh(sphere(1.05, 8, 6), leafMat, { y: h + 0.6 });
    crown.scale.set(0.85, 1.35, 0.85);
    g.add(crown);
  } else {
    const h = rng.range(1.6, 2.4);
    g.add(mesh(cylinder(0.18, 0.26, h, 6), trunkMat, { y: h / 2 }));
    const blobs = rng.int(2, 3);
    for (let i = 0; i < blobs; i++) {
      const r = rng.range(0.95, 1.5);
      const b = mesh(sphere(r, 8, 6), leafMat, {
        x: rng.range(-0.6, 0.6),
        y: h + rng.range(0.3, 1.1),
        z: rng.range(-0.6, 0.6),
      });
      b.scale.y = rng.range(0.75, 0.95);
      g.add(b);
    }
  }
  g.scale.setScalar(scale * rng.range(0.85, 1.25));
  g.rotation.y = rng.range(0, Math.PI * 2);
  return g;
}

export function makeBush(rng, scale = 1) {
  const g = new THREE.Group();
  const m = rng.pick(LEAF_MATS);
  for (let i = 0; i < 3; i++) {
    const b = mesh(sphere(rng.range(0.4, 0.7), 7, 5), m, {
      x: rng.range(-0.4, 0.4),
      y: rng.range(0.2, 0.45),
      z: rng.range(-0.4, 0.4),
    });
    b.scale.y = 0.8;
    g.add(b);
  }
  g.scale.setScalar(scale);
  return g;
}

/* ---------------- buildings of the starting town ---------------- */

// One warm neutral and five clearly coloured pastels keep neighbouring homes
// identifiable from the classroom's usual overhead camera.
const HOUSE_WALLS = [0xfff2d9, 0xf0c58a, 0xaed5ea, 0xb9dfc8, 0xf0b9bd, 0xd2c3e8];
const HOUSE_ROOFS = [P.roofBlue, P.roofGrey, P.roofRed, P.roofTeal, P.roofBrown];
const SHOP_WALLS = [0xfff1d9, 0xd7e7ef, 0xd9eadb, 0xf1d2ce, 0xe2d8ef, 0xeee6d5];

/** Shared, cheap ground-contact cue for both infill buildings and landmarks. */
export function addBuildingPlinth(group, w, d, { z = 0, color = P.concreteDark } = {}) {
  group.add(mesh(box(w + 0.24, 0.34, d + 0.24), mat(color), {
    y: 0.17, z, cast: false,
  }));
}

/** Thin soffit/fascia below a pitched roof, plus a readable ridge or hip cap. */
export function addPitchedRoofFinish(group, {
  w, d, y, roofHeight, roofMat, type = 'gable', z = 0,
}) {
  group.add(mesh(box(w + 0.86, 0.16, d + 0.76), mat(P.cream), {
    y: y + 0.04, z, cast: false,
  }));
  if (type === 'gable') {
    const ridge = mesh(cylinder(0.12, 0.12, d + 0.72, 6), roofMat, {
      y: y + roofHeight + 0.02, z, cast: false,
    });
    ridge.rotation.x = Math.PI / 2;
    group.add(ridge);
  } else {
    group.add(mesh(box(0.48, 0.16, 0.48), roofMat, {
      y: y + roofHeight + 0.03, z, cast: false,
    }));
  }
}

function addFacadeWindow(group, material, x, y, z, w = 1.25, h = 1.05) {
  group.add(mesh(box(w, h, 0.12), material, { x, y, z, cast: false }));
}

function addSideWindow(group, material, x, y, z, w = 1.2, h = 1.05) {
  group.add(mesh(box(0.12, h, w), material, { x, y, z, cast: false }));
}

/** A small Japanese-suburb house: rendered walls, deep hipped or gabled roof. */
export function makeHouse(rng) {
  const g = new THREE.Group();
  // Discrete dimensions let the geometry cache genuinely share the new pieces.
  const w = rng.pick([5.4, 6.2, 7]);
  const d = rng.pick([5.2, 6, 6.8]);
  const storeys = rng.chance(0.45) ? 2 : 1;
  const h = storeys === 2 ? rng.pick([5.6, 6.2]) : rng.pick([3.2, 3.6]);
  const wallMat = mat(rng.pick(HOUSE_WALLS));
  const roofMat = mat(rng.pick(HOUSE_ROOFS));
  const winMat = mat(P.glass);
  const doorMat = mat(rng.pick([P.wood, P.woodDark, P.navy]));
  const roofType = rng.chance(0.55) ? 'gable' : 'hip';
  const rh = rng.pick([1.45, 1.75, 2.05]);

  // Flat box faces avoid RoundedBoxGeometry's diagonal Lambert gradients on
  // large panels. Small props remain rounded elsewhere in the town.
  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));

  if (roofType === 'gable') {
    const roof = mesh(gableRoof(w + 0.9, rh, d + 0.8), roofMat, { y: h });
    g.add(roof);
  } else {
    g.add(mesh(hipRoof(w + 0.9, rh, d + 0.8), roofMat, { y: h }));
  }
  addPitchedRoofFinish(g, { w, d, y: h, roofHeight: rh, roofMat, type: roofType });

  const doorX = -w * 0.2;
  for (let r = 0; r < storeys; r++) {
    const yy = 1.55 + r * 2.65;
    if (yy > h - 0.5) continue;
    if (r === 0) {
      addFacadeWindow(g, winMat, w * 0.25, yy, d / 2 + 0.02, 1.45, 1.1);
    } else {
      for (const sx of [-1, 1]) addFacadeWindow(g, winMat, sx * w * 0.23, yy, d / 2 + 0.02);
    }
    for (const sx of [-1, 1]) addFacadeWindow(g, winMat, sx * w * 0.24, yy, -d / 2 - 0.02);
    addSideWindow(g, winMat, -w / 2 - 0.02, yy, 0);
    addSideWindow(g, winMat, w / 2 + 0.02, yy, 0);
  }
  g.add(mesh(box(1.05, 2.05, 0.14), doorMat, { x: doorX, y: 1.03, z: d / 2 + 0.03, cast: false }));

  // An approach and one of three entry silhouettes anchor each house to its lot.
  g.add(mesh(box(1.25, 0.08, 1.05), mat(P.sidewalk), {
    x: doorX, y: 0.045, z: d / 2 + 0.48, cast: false,
  }));
  g.add(mesh(box(1.45, 0.2, 0.45), mat(P.concrete), {
    x: doorX, y: 0.1, z: d / 2 + 0.16, cast: false,
  }));
  const entryType = rng.int(0, 2);
  if (entryType === 0) {
    const canopy = mesh(box(2.35, 0.16, 1.15), roofMat, {
      x: doorX, y: 2.5, z: d / 2 + 0.48,
    });
    canopy.rotation.x = -0.12;
    g.add(canopy);
  } else if (entryType === 1) {
    g.add(mesh(box(1.7, 2.35, 0.7), wallMat, {
      x: doorX, y: 1.18, z: d / 2 + 0.34,
    }));
    g.add(mesh(box(1.05, 2.05, 0.12), doorMat, {
      x: doorX, y: 1.03, z: d / 2 + 0.7, cast: false,
    }));
    g.add(mesh(box(2, 0.16, 0.92), roofMat, {
      x: doorX, y: 2.42, z: d / 2 + 0.36,
    }));
  } else {
    g.add(mesh(box(2.25, 0.15, 0.7), mat(P.wood), {
      x: doorX, y: 2.45, z: d / 2 + 0.32,
    }));
  }

  // A rear service door, meter and downpipe make the secondary elevations read
  // as intentional without turning every small house into dozens of meshes.
  g.add(mesh(box(0.85, 1.8, 0.12), doorMat, {
    x: w * 0.2, y: 0.9, z: -d / 2 - 0.03, cast: false,
  }));
  g.add(mesh(box(0.45, 0.7, 0.18), mat(P.metal), {
    x: w / 2 + 0.1, y: 1.15, z: d * 0.25, cast: false,
  }));
  g.add(mesh(cylinder(0.07, 0.07, Math.max(2.5, h - 0.4), 6), mat(P.metalDark), {
    x: -w / 2 - 0.08, y: Math.max(2.5, h - 0.4) / 2, z: -d * 0.32, cast: false,
  }));

  if (rng.chance(0.55)) {
    const planterX = doorX + (doorX < 0 ? 1.25 : -1.25);
    g.add(mesh(cylinder(0.38, 0.48, 0.42, 8), mat(P.wood), {
      x: planterX, y: 0.21, z: d / 2 + 0.58, cast: false,
    }));
    g.add(mesh(sphere(0.46, 7, 5), mat(P.leafDark), {
      x: planterX, y: 0.62, z: d / 2 + 0.58, cast: false,
    }));
  }

  g.userData.footprint = Math.max(w, d);
  return g;
}

/** Generic small shop / workshop with an awning and a sign board. */
export function makeShop(rng, label = null) {
  const g = new THREE.Group();
  const w = rng.pick([7.5, 8.5, 9.5]);
  const d = rng.pick([6.2, 7.2]);
  const storeys = rng.chance(0.58) ? 2 : 1;
  const h = storeys === 2 ? rng.pick([6.8, 7.4]) : rng.pick([4.8, 5.2]);
  const wallMat = mat(rng.pick(SHOP_WALLS));
  const accent = rng.pick([P.red, P.blue, P.orange, P.green, P.purple, P.roofTeal]);
  const accentMat = mat(accent);
  const glassMat = mat(P.glass);
  const front = d / 2;

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  // A quiet roof cap replaces the oversized saturated slab; colour is carried
  // by the street-facing fascia and awning where it reads as shop identity.
  g.add(mesh(box(w + 0.5, 0.22, d + 0.5), mat(P.roofGrey), { y: h + 0.11 }));
  g.add(mesh(box(w * 0.72, 0.28, 0.18), accentMat, {
    y: h - 0.02, z: front + 0.17, cast: false,
  }));

  const displayW = w * 0.55;
  g.add(mesh(box(displayW, 2.1, 0.12), glassMat, {
    x: -w * 0.12, y: 1.5, z: front + 0.02, cast: false,
  }));
  const doorX = w * 0.34;
  g.add(mesh(box(1.05, 2.2, 0.14), mat(P.woodDark), {
    x: doorX, y: 1.1, z: front + 0.03, cast: false,
  }));
  g.add(mesh(box(0.62, 0.82, 0.04), glassMat, {
    x: doorX, y: 1.5, z: front + 0.11, cast: false,
  }));

  const awning = mesh(box(w * 0.68, 0.12, 1.6), accentMat, { x: -w * 0.08, y: 3.1, z: front + 0.7 });
  awning.rotation.x = -0.18;
  g.add(awning);
  g.add(mesh(box(w * 0.58, 0.78, 0.16), mat(P.cream), { y: storeys === 2 ? 3.95 : h - 0.75, z: front + 0.05, cast: false }));
  if (label) {
    const s = signPlane(label, w * 0.55, 0.7, { bg: 'transparent', fg: '#3d5a6c' });
    s.position.set(0, storeys === 2 ? 3.95 : h - 0.75, front + 0.16);
    g.add(s);
  }

  // Upper-floor windows, or a shallow parapet for the lower shop silhouette.
  if (storeys === 2) {
    for (const sx of [-1, 0, 1]) addFacadeWindow(g, glassMat, sx * w * 0.23, 5.65, front + 0.02, 1.2, 1.05);
    for (const sx of [-1, 1]) addFacadeWindow(g, glassMat, sx * w * 0.23, 5.65, -front - 0.02, 1.25, 1.05);
    addSideWindow(g, glassMat, -w / 2 - 0.02, 5.65, 0, 1.35);
    addSideWindow(g, glassMat, w / 2 + 0.02, 5.65, 0, 1.35);
  } else {
    g.add(mesh(box(w * 0.62, 0.6, 0.18), wallMat, {
      y: h + 0.38, z: 0.15, cast: false,
    }));
  }

  // Side display windows and a rear service elevation finish all four faces.
  addSideWindow(g, glassMat, -w / 2 - 0.02, 1.55, 0, 1.65, 1.25);
  addSideWindow(g, glassMat, w / 2 + 0.02, 1.55, 0, 1.65, 1.25);
  addFacadeWindow(g, glassMat, -w * 0.2, 1.55, -front - 0.02, 1.7, 1.2);
  g.add(mesh(box(1, 2, 0.14), mat(P.metalDark), {
    x: w * 0.28, y: 1, z: -front - 0.03, cast: false,
  }));

  // Projecting tatekanban-inspired sign: the repeated pale inserts stay legible
  // from oblique street views without adding another canvas texture per shop.
  const signX = -w / 2 + 0.48;
  g.add(mesh(box(0.22, 2.05, 0.78), accentMat, {
    x: signX, y: Math.min(h - 1.25, 4.25), z: front + 0.4, cast: false,
  }));
  for (const sy of [-0.48, 0.48]) {
    g.add(mesh(box(0.24, 0.68, 0.5), mat(P.cream), {
      x: signX - 0.01, y: Math.min(h - 1.25, 4.25) + sy, z: front + 0.4, cast: false,
    }));
  }

  g.add(mesh(box(1.15, 0.08, 1.15), mat(P.sidewalk), {
    x: doorX, y: 0.045, z: front + 0.55, cast: false,
  }));
  g.add(mesh(box(1.35, 0.18, 0.42), mat(P.concrete), {
    x: doorX, y: 0.09, z: front + 0.18, cast: false,
  }));

  // One small street vignette per shop keeps the mesh budget predictable.
  if (rng.chance(0.5)) {
    const px = -w * 0.35;
    g.add(mesh(cylinder(0.4, 0.5, 0.48, 8), mat(P.wood), {
      x: px, y: 0.24, z: front + 0.82, cast: false,
    }));
    g.add(mesh(sphere(0.5, 7, 5), mat(P.leafDark), {
      x: px, y: 0.7, z: front + 0.82, cast: false,
    }));
  } else {
    for (const i of [0, 1]) {
      const crate = mesh(box(0.75, 0.58, 0.62), mat(P.wood), {
        x: -w * 0.34 + i * 0.7, y: 0.29 + i * 0.12, z: front + 0.78, cast: false,
      });
      crate.rotation.y = i ? 0.16 : -0.12;
      g.add(crate);
    }
  }
  g.add(mesh(cylinder(0.07, 0.07, h - 0.4, 6), mat(P.metalDark), {
    x: w / 2 + 0.08, y: (h - 0.4) / 2, z: -d * 0.32, cast: false,
  }));
  g.userData.footprint = Math.max(w, d);
  return g;
}

/* ---------------- street furniture ---------------- */

export function makeUtilityPole(rng) {
  const g = new THREE.Group();
  const h = rng.range(7.5, 9);
  g.add(mesh(cylinder(0.13, 0.17, h, 6), mat(P.concreteDark), { y: h / 2 }));
  g.add(mesh(box(2.2, 0.12, 0.12), mat(P.woodDark), { y: h - 0.5 }));
  g.add(mesh(box(1.6, 0.12, 0.12), mat(P.woodDark), { y: h - 1.4 }));
  if (rng.chance(0.5)) g.add(mesh(box(0.5, 0.7, 0.4), mat(P.metal), { y: h - 2.4 }));
  return g;
}

export function makeStreetLamp() {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.09, 0.12, 5, 6), mat(P.metalDark), { y: 2.5 }));
  g.add(mesh(box(1.2, 0.12, 0.12), mat(P.metalDark), { x: 0.5, y: 5 }));
  g.add(mesh(box(0.7, 0.22, 0.4), glow(0xfff3c4, 0.35), { x: 1, y: 4.85, cast: false }));
  return g;
}

export function makeBench(rng) {
  const g = new THREE.Group();
  const m = mat(P.wood);
  g.add(mesh(box(1.9, 0.14, 0.6), m, { y: 0.5 }));
  const back = mesh(box(1.9, 0.5, 0.12), m, { y: 0.82, z: -0.24 });
  back.rotation.x = -0.16;
  g.add(back);
  for (const sx of [-0.7, 0.7]) g.add(mesh(box(0.14, 0.5, 0.5), mat(P.metalDark), { x: sx, y: 0.25 }));
  if (rng) g.rotation.y = rng.range(0, Math.PI * 2);
  return g;
}

export function makeVendingMachine(rng) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(1.1, 1.9, 0.7, 0.08), mat(rng.pick([P.red, P.blue, P.orange])), { y: 0.95 }));
  g.add(mesh(box(0.75, 1.1, 0.06), glow(0xfff6d8, 0.4), { y: 1.2, z: 0.37, cast: false }));
  return g;
}

export function makeFenceRun(length, { height = 1.2, color = P.metal, postEvery = 2.2 } = {}) {
  const g = new THREE.Group();
  g.add(mesh(box(length, 0.09, 0.09), mat(color), { y: height * 0.85, cast: false }));
  g.add(mesh(box(length, 0.09, 0.09), mat(color), { y: height * 0.35, cast: false }));
  const n = Math.max(2, Math.round(length / postEvery));
  for (let i = 0; i <= n; i++) {
    const x = -length / 2 + (length * i) / n;
    g.add(mesh(box(0.1, height, 0.1), mat(color), { x, y: height / 2, cast: false }));
  }
  return g;
}

/* ---------------- vehicles ---------------- */

const CAR_COLORS = [P.red, P.blue, P.yellow, P.green, P.wallWhite, P.purple, P.orange, 0x4c5b6b];

/** A chunky toy car. Kept to ~10 meshes so dozens can drive at once. */
export function makeCar(rng) {
  const g = new THREE.Group();
  const color = rng.pick(CAR_COLORS);
  const kind = rng.chance(0.18) ? 'van' : rng.chance(0.12) ? 'truck' : 'car';
  const len = kind === 'car' ? 3.8 : kind === 'van' ? 4.6 : 5.4;
  const wid = 1.9;

  g.add(mesh(roundedBox(wid, 0.95, len, 0.32), mat(color), { y: 0.72 }));
  if (kind === 'truck') {
    g.add(mesh(roundedBox(wid * 0.96, 1.3, len * 0.5, 0.16), mat(P.wallWhite), { y: 1.5, z: -len * 0.2 }));
    g.add(mesh(roundedBox(wid * 0.9, 0.8, 1.5, 0.24), mat(P.glass), { y: 1.5, z: len * 0.28 }));
  } else {
    const cabinLen = kind === 'van' ? len * 0.6 : len * 0.5;
    g.add(mesh(roundedBox(wid * 0.88, 0.8, cabinLen, 0.26), mat(P.glass), { y: 1.5, z: kind === 'van' ? 0 : -0.15 }));
  }
  const wheel = cylinder(0.42, 0.42, 0.34, 8);
  const wm = mat(0x2f3640);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const w = mesh(wheel, wm, { x: sx * wid * 0.5, y: 0.42, z: sz * len * 0.32, cast: false });
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  }
  g.add(mesh(box(0.35, 0.18, 0.08), glow(0xfff2c9, 0.5), { x: -0.55, y: 0.85, z: len / 2, cast: false }));
  g.add(mesh(box(0.35, 0.18, 0.08), glow(0xfff2c9, 0.5), { x: 0.55, y: 0.85, z: len / 2, cast: false }));
  g.userData.length = len;
  return g;
}

export function makeBicycle(rng) {
  const g = new THREE.Group();
  const m = mat(rng.pick([P.red, P.blue, P.green, 0x38424f]));
  const wheelGeo = new THREE.TorusGeometry(0.34, 0.05, 5, 10);
  for (const sz of [-0.55, 0.55]) {
    const w = new THREE.Mesh(wheelGeo, mat(0x2f3640));
    w.position.set(0, 0.34, sz);
    w.rotation.y = Math.PI / 2;
    g.add(w);
  }
  g.add(mesh(box(0.1, 0.1, 1.1), m, { y: 0.62, cast: false }));
  g.add(mesh(box(0.1, 0.45, 0.1), m, { y: 0.8, z: -0.5, cast: false }));
  return g;
}

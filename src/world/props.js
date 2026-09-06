import * as THREE from 'three';
import { PALETTE as P, mat, glow, roundedBox, box, cylinder, sphere, mesh, makeSwayMaterial, signPlane } from '../core/materials.js';
import { createHouseModel } from './houseModels.js';

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

const HOUSE_WALLS = [P.wallWhite, P.wallCream, P.wallSand, P.wallBlue, P.wallMint, P.wallPink];
const HOUSE_ROOFS = [P.roofBlue, P.roofGrey, P.roofRed, P.roofTeal, P.roofBrown];

/** A small Japanese-suburb house: rendered walls, deep hipped or gabled roof. */
export function makeHouse(rng) {
  const model = createHouseModel(rng);
  if (model) return model;

  const g = new THREE.Group();
  const w = rng.range(5, 7.5);
  const d = rng.range(5, 7);
  const storeys = rng.chance(0.45) ? 2 : 1;
  const h = storeys === 2 ? rng.range(5.2, 6.2) : rng.range(3, 3.6);
  const wallMat = mat(rng.pick(HOUSE_WALLS));
  const roofMat = mat(rng.pick(HOUSE_ROOFS));

  g.add(mesh(roundedBox(w, h, d, 0.16), wallMat, { y: h / 2 }));

  if (rng.chance(0.55)) {
    const rh = rng.range(1.3, 1.9);
    const roof = mesh(gableRoof(w + 0.9, rh, d + 0.8), roofMat, { y: h });
    g.add(roof);
  } else {
    g.add(mesh(hipRoof(w + 0.9, rng.range(1.4, 2.1), d + 0.8), roofMat, { y: h }));
  }

  const winMat = mat(P.glass);
  const doorMat = mat(rng.pick([P.wood, P.woodDark, P.navy]));
  for (let r = 0; r < storeys; r++) {
    const yy = 1.5 + r * 2.6;
    if (yy > h - 0.5) continue;
    for (const sx of [-1, 1]) {
      g.add(mesh(box(1.3, 1.1, 0.12), winMat, { x: sx * w * 0.24, y: yy, z: d / 2 + 0.02, cast: false }));
    }
  }
  g.add(mesh(box(1.1, 2, 0.14), doorMat, { x: 0, y: 1, z: d / 2 + 0.02, cast: false }));
  if (rng.chance(0.4)) g.add(mesh(box(2.6, 0.16, 1.2), roofMat, { y: 2.5, z: d / 2 + 0.5 }));

  g.userData.footprint = Math.max(w, d);
  return g;
}

/** Generic small shop / workshop with an awning and a sign board. */
export function makeShop(rng, label = null) {
  const g = new THREE.Group();
  const w = rng.range(7, 10);
  const d = rng.range(6, 8);
  const h = rng.range(4, 5.6);
  const wallMat = mat(rng.pick([P.wallCream, P.wallWhite, P.wallSand, P.concrete]));
  const accent = rng.pick([P.red, P.blue, P.orange, P.green, P.purple, P.roofTeal]);

  g.add(mesh(roundedBox(w, h, d, 0.14), wallMat, { y: h / 2 }));
  g.add(mesh(box(w + 0.5, 0.35, d + 0.5), mat(accent), { y: h + 0.15 }));
  g.add(mesh(box(w * 0.7, 2.1, 0.12), mat(P.glass), { y: 1.5, z: d / 2 + 0.02, cast: false }));

  const awning = mesh(box(w * 0.8, 0.12, 1.6), mat(accent), { y: 3.1, z: d / 2 + 0.7 });
  awning.rotation.x = -0.18;
  g.add(awning);
  g.add(mesh(box(w * 0.6, 0.9, 0.16), mat(P.cream), { y: 3.9, z: d / 2 + 0.05, cast: false }));
  if (label) {
    const s = signPlane(label, w * 0.55, 0.7, { bg: 'transparent', fg: '#3d5a6c' });
    s.position.set(0, 3.9, d / 2 + 0.16);
    g.add(s);
  }
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

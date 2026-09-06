import * as THREE from 'three';
import {
  PALETTE as P, mat, glow, roundedBox, box, cylinder, sphere, mesh, signPlane,
} from '../core/materials.js';
import {
  makeTree, makeBush, makeBench, makeFenceRun, makeCar, makeStreetLamp,
  makeBicycle, gableRoof, hipRoof, addBuildingPlinth, addPitchedRoofFinish,
} from '../world/props.js';
import { windowGrid, facadeSign, steps, flagPole } from './procedural.js';

/**
 * EXTRA LANDMARK MODELS
 * ---------------------
 * The wider building pool. The eight original landmarks keep their own
 * implementations in procedural.js and are NOT rebuilt here - this module only
 * covers places that had no model yet.
 *
 * Same conventions as procedural.js: origin on the ground at the centre of the
 * lot, entrance facing local +Z, optional `userData.animate(dt, time)`.
 */

/* ------------------------------------------------------------------ *
 * Two shared templates cover the ordinary streetscape buildings, so the
 * shops and civic offices look like they belong to the same town rather
 * than to eight different asset packs.
 * ------------------------------------------------------------------ */

/** Small shopfront: glazed front, awning, sign board, pavement clutter. */
export function shopFront({
  size, sign, wall = P.wallCream, accent = P.orange, storeys = 1,
  awning = true, roofSign = false, dressing,
  rng,
}) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 3, 13);
  const d = Math.min(ld - 4, 10);
  const h = storeys === 2 ? 7.6 : 5;

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), mat(wall), { y: h / 2 }));
  g.add(mesh(box(w + 0.7, 0.45, d + 0.7), mat(accent), { y: h + 0.2 }));
  g.add(mesh(box(w + 0.42, 0.14, d + 0.42), mat(P.cream), { y: h - 0.02, cast: false }));

  const front = d / 2;
  g.add(mesh(box(w * 0.62, 2.4, 0.14), mat(P.glass), { y: 1.6, z: front + 0.02, cast: false }));
  g.add(mesh(box(1.2, 2.3, 0.16), mat(P.woodDark), { x: w * 0.36, y: 1.15, z: front + 0.03, cast: false }));
  if (storeys === 2) {
    windowGrid(g, { w: w - 2, h, z: front + 0.02, cols: 3, rows: 1, y0: 5.4, stepY: 3, ww: 1.4, wh: 1.3 });
  }
  windowGrid(g, { w: w - 2, h, z: -front - 0.02, cols: 2, rows: storeys, y0: 2.1, stepY: 3.1, ww: 1.5, wh: 1.2 });
  for (const sx of [-1, 1]) {
    for (let r = 0; r < storeys; r++) {
      g.add(mesh(box(0.14, 1.2, 1.5), mat(P.glass), {
        x: sx * (w / 2 + 0.02), y: 2.1 + r * 3.1, cast: false,
      }));
    }
  }

  if (awning) {
    const shade = mesh(box(w * 0.72, 0.14, 1.9), mat(accent), { y: 3.25, z: front + 0.9 });
    shade.rotation.x = -0.2;
    g.add(shade);
    for (let i = 0; i < 4; i++) {
      g.add(mesh(box(w * 0.18, 0.16, 1.9), mat(0xffffff), {
        x: -w * 0.36 + w * 0.18 * (i * 1.15 + 0.5), y: 3.16, z: front + 0.9, cast: false,
      }));
    }
  }

  facadeSign(g, sign, { w: w * 0.62, h: 0.8, y: h - 0.85, z: front + 0.08, fg: '#3d5a6c' });
  if (roofSign) {
    g.add(mesh(box(w * 0.5, 1.5, 0.35), mat(0xffffff), { y: h + 1.2, z: 0.4 }));
    const rs = signPlane(sign, w * 0.46, 1.1, { bg: 'transparent', fg: '#e2761b' });
    rs.position.set(0, h + 1.2, 0.6);
    g.add(rs);
  }

  // pavement life
  if (rng && rng.chance(0.7)) {
    const bike = makeBicycle(rng);
    bike.position.set(-w * 0.36, 0, front + 1.6);
    bike.rotation.y = 1.4;
    g.add(bike);
  }
  if (dressing) dressing(g, { w, d, h, front, rng });
  return g;
}

/** Civic office block: rendered walls, banded windows, steps, flagpole. */
export function civicBlock({
  size, sign, wall = P.wallWhite, accent = P.navy, storeys = 2,
  tower = false, flag = false, dressing, rng,
}) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 4, 20);
  const d = Math.min(ld - 5, 12);
  const h = 3 + storeys * 3.1;

  addBuildingPlinth(g, w, d, { z: -0.5 });
  g.add(mesh(box(w, h, d), mat(wall), { y: h / 2, z: -0.5 }));
  g.add(mesh(box(w + 1, 0.55, d + 1), mat(accent), { y: h + 0.28, z: -0.5 }));
  g.add(mesh(box(w + 0.4, 0.9, d + 0.4), mat(accent), { y: 0.45, z: -0.5, cast: false }));

  const front = d / 2 - 0.5;
  windowGrid(g, { w: w - 2.4, h, z: front + 0.02, cols: 4, rows: storeys, y0: 2.6, stepY: 3.1, ww: 1.8, wh: 1.5 });
  g.add(mesh(box(3.2, 3, 0.18), mat(P.glass), { y: 1.5, z: front + 0.03, cast: false }));

  // entrance canopy on slim columns
  g.add(mesh(box(6, 0.35, 2.6), mat(accent), { y: 3.6, z: front + 1.3 }));
  for (const sx of [-2.4, 2.4]) {
    g.add(mesh(cylinder(0.18, 0.18, 3.6, 8), mat(P.metal), { x: sx, y: 1.8, z: front + 2.3 }));
  }
  steps(g, { w: 6.5, depth: 1.8, count: 3, z: front + 0.7 });
  facadeSign(g, sign, { w: Math.min(w * 0.62, 8), h: 0.95, y: h - 1.1, z: front + 0.08 });

  if (tower) {
    g.add(mesh(roundedBox(4.4, 6.5, 4.4, 0.2), mat(wall), { y: h + 3.2, z: -0.5 }));
    g.add(mesh(hipRoof(5.4, 2.4, 5.4), mat(accent), { y: h + 6.45, z: -0.5 }));
    const face = mesh(cylinder(1.1, 1.1, 0.24, 16), mat(0xffffff), { y: h + 3.9, z: 1.85 });
    face.rotation.x = Math.PI / 2;
    g.add(face);
    g.add(mesh(box(0.12, 0.75, 0.12), mat(0x33414d), { y: h + 4.2, z: 1.99, cast: false }));
  }
  if (flag) {
    const pole = flagPole(9, P.red);
    pole.position.set(-w / 2 - 1.6, 0, front + 2);
    g.add(pole);
    g.userData.animate = (dt, time) => pole.userData.animate(dt, time);
  }
  if (dressing) dressing(g, { w, d, h, front, rng });
  return g;
}

/** Low-cost parapet/fascia treatment for flat-roof landmark silhouettes. */
function addFlatRoofFinish(group, { w, d, y, z = 0, edge = P.cream }) {
  group.add(mesh(box(w + 0.56, 0.18, d + 0.56), mat(edge), {
    y: y + 0.09, z, cast: false,
  }));
  group.add(mesh(box(w + 0.72, 0.34, 0.22), mat(edge), {
    y: y + 0.28, z: z + d / 2 + 0.18, cast: false,
  }));
  group.add(mesh(box(w + 0.72, 0.34, 0.22), mat(edge), {
    y: y + 0.28, z: z - d / 2 - 0.18, cast: false,
  }));
  for (const sx of [-1, 1]) {
    group.add(mesh(box(0.22, 0.34, d + 0.5), mat(edge), {
      x: sx * (w / 2 + 0.18), y: y + 0.28, z, cast: false,
    }));
  }
}

/** A short, visible route from the lot surface to a street-facing entrance. */
function addEntranceApproach(group, { x = 0, front, width = 1.7, depth = 1.5 }) {
  group.add(mesh(box(width, 0.08, depth), mat(P.sidewalk), {
    x, y: 0.045, z: front + depth / 2, cast: false,
  }));
  group.add(mesh(box(width + 0.2, 0.18, 0.42), mat(P.concrete), {
    x, y: 0.09, z: front + 0.16, cast: false,
  }));
}

function addSideWindow(group, { x, y, z = 0, w = 1.5, h = 1.2, material = mat(P.glass) }) {
  group.add(mesh(box(0.14, h, w), material, { x, y, z, cast: false }));
}

function addFaceWindow(group, { x = 0, y, z, w = 1.5, h = 1.2, material = mat(P.glass) }) {
  group.add(mesh(box(w, h, 0.14), material, { x, y, z, cast: false }));
}

/* --------------------------- SHOPS AND FOOD --------------------------- */

export function buildBakery({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 4, 10.5);
  const d = Math.min(size[1] - 5, 7.6);
  const h = 4.6;
  const front = d / 2;
  const wallMat = mat(0xfbe9cf);
  const roofMat = mat(0xd98b53);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  g.add(mesh(gableRoof(w + 0.9, 2.05, d + 0.8), roofMat, { y: h }));
  addPitchedRoofFinish(g, { w, d, y: h, roofHeight: 2.05, roofMat, type: 'gable' });

  addFaceWindow(g, { x: -1.3, y: 1.55, z: front + 0.02, w: 5.6, h: 2.35, material: glassMat });
  g.add(mesh(box(1.2, 2.35, 0.16), mat(P.woodDark), {
    x: w * 0.36, y: 1.18, z: front + 0.04, cast: false,
  }));
  for (const sx of [-1, 1]) {
    addSideWindow(g, { x: sx * (w / 2 + 0.02), y: 2, z: 0, w: 1.7, h: 1.3, material: glassMat });
  }
  addFaceWindow(g, { x: -1.8, y: 2, z: -front - 0.02, w: 2.2, h: 1.25, material: glassMat });
  g.add(mesh(box(1, 2.05, 0.14), mat(P.woodDark), {
    x: 2.7, y: 1.03, z: -front - 0.03, cast: false,
  }));

  const awning = mesh(box(6.8, 0.14, 1.45), roofMat, { x: -0.7, y: 3.18, z: front + 0.65 });
  awning.rotation.x = -0.18;
  g.add(awning);
  for (const sx of [-2.25, -0.75, 0.75, 2.25]) {
    const stripe = mesh(box(0.72, 0.16, 1.46), mat(P.cream), {
      x: sx - 0.7, y: 3.17, z: front + 0.65, cast: false,
    });
    stripe.rotation.x = -0.18;
    g.add(stripe);
  }
  facadeSign(g, sign, { w: 4.8, h: 0.7, y: 3.9, z: front + 0.08, fg: '#8a5935' });

  // A sculpted loaf remains readable when the text plane is hidden.
  g.add(mesh(roundedBox(2.2, 0.95, 0.34, 0.25), mat(0xd9a566), {
    x: -3.55, y: 4.85, z: front + 0.28, cast: false,
  }));
  for (const sx of [-0.5, 0, 0.5]) {
    const score = mesh(box(0.12, 0.62, 0.08), mat(0xf6d6a0), {
      x: -3.55 + sx, y: 4.85, z: front + 0.5, cast: false,
    });
    score.rotation.z = -0.35;
    g.add(score);
  }

  // Window trays and rows of bread form the second unmistakable cue.
  for (const yy of [0.85, 1.55]) {
    g.add(mesh(box(4.5, 0.12, 0.5), mat(P.wood), {
      x: -1.3, y: yy, z: front + 0.28, cast: false,
    }));
    for (let i = 0; i < 5; i++) {
      const loaf = mesh(sphere(0.23, 7, 5), mat(rng.pick([0xd9a566, 0xc98a4b, 0xe8c894])), {
        x: -2.9 + i * 0.8, y: yy + 0.22, z: front + 0.36, cast: false,
      });
      loaf.scale.set(1.4, 0.65, 0.8);
      g.add(loaf);
    }
  }
  addEntranceApproach(g, { x: w * 0.36, front, width: 1.5, depth: 1.8 });
  return g;
}

export function buildCafe({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 5, 9);
  const d = Math.min(size[1] - 5, 7.4);
  const h = 4.5;
  const bodyX = 0;
  const front = d / 2;
  const wallMat = mat(0xf3ece0);
  const roofMat = mat(0x8a6340);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { x: bodyX, y: h / 2 }));
  g.add(mesh(hipRoof(w + 0.9, 1.8, d + 0.8), roofMat, { x: bodyX, y: h }));
  addPitchedRoofFinish(g, { w, d, y: h, roofHeight: 1.8, roofMat, type: 'hip' });

  // The projecting octagonal corner bay makes this a cafe pavilion at a glance.
  const bayX = -w / 2 + 0.25;
  g.add(mesh(cylinder(1.77, 1.77, 0.34, 8), mat(P.concreteDark), {
    x: bayX, y: 0.17, z: 0.35, cast: false,
  }));
  g.add(mesh(cylinder(1.65, 1.65, 5.2, 8), wallMat, { x: bayX, y: 2.6, z: 0.35 }));
  g.add(mesh(cylinder(0.18, 2.05, 1.05, 8), roofMat, { x: bayX, y: 5.65, z: 0.35 }));
  for (const zz of [-0.65, 0.35, 1.35]) {
    addSideWindow(g, { x: -w / 2 - 1.38, y: 2.15, z: zz, w: 0.78, h: 1.55, material: glassMat });
  }
  addFaceWindow(g, { x: 0.25, y: 1.75, z: front + 0.02, w: 3.4, h: 2.1, material: glassMat });
  g.add(mesh(box(1.15, 2.25, 0.16), mat(P.woodDark), {
    x: 3.35, y: 1.13, z: front + 0.04, cast: false,
  }));
  addFaceWindow(g, { x: 0.7, y: 2, z: -front - 0.02, w: 2.3, h: 1.25, material: glassMat });
  g.add(mesh(box(0.9, 1.95, 0.14), mat(P.woodDark), {
    x: 3.5, y: 0.98, z: -front - 0.03, cast: false,
  }));
  addSideWindow(g, { x: bodyX + w / 2 + 0.02, y: 2, z: 0, w: 1.8, h: 1.3, material: glassMat });
  facadeSign(g, sign, { w: 3.7, h: 0.75, y: 3.85, z: front + 0.08, fg: '#68462f' });

  // Rooftop coffee cup with three blocky steam wisps.
  g.add(mesh(cylinder(0.72, 0.58, 0.9, 10), mat(P.cream), {
    x: 2.45, y: 6.15, z: 0.2, cast: false,
  }));
  g.add(mesh(cylinder(0.78, 0.78, 0.12, 10), mat(P.woodDark), {
    x: 2.45, y: 6.61, z: 0.2, cast: false,
  }));
  for (const sx of [-0.38, 0, 0.38]) {
    const steam = mesh(cylinder(0.07, 0.07, 0.72, 6), mat(P.cream), {
      x: 2.45 + sx, y: 7.15, z: 0.2, cast: false,
    });
    steam.rotation.z = sx * 0.45;
    g.add(steam);
  }

  const tableX = 1.05;
  const patioZ = front + 1.45;
  g.add(mesh(cylinder(0.7, 0.7, 0.14, 10), mat(P.cream), { x: tableX, y: 0.9, z: patioZ, cast: false }));
  g.add(mesh(cylinder(0.11, 0.15, 0.9, 8), mat(P.metalDark), { x: tableX, y: 0.45, z: patioZ, cast: false }));
  g.add(mesh(cylinder(0.08, 0.08, 2.45, 8), mat(P.metalDark), { x: tableX, y: 1.23, z: patioZ, cast: false }));
  g.add(mesh(cylinder(0.08, 1.15, 0.65, 10), mat(0xd96a5a), { x: tableX, y: 2.62, z: patioZ }));
  for (const sx of [-1.05, 1.05]) {
    g.add(mesh(roundedBox(0.5, 0.5, 0.5, 0.12), mat(P.wood), {
      x: tableX + sx, y: 0.45, z: patioZ, cast: false,
    }));
  }
  addEntranceApproach(g, { x: 3.35, front, width: 1.45, depth: 1.8 });
  return g;
}

export function buildRestaurant({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 4, 10.4);
  const d = Math.min(size[1] - 5, 8.2);
  const h = 5.2;
  const front = d / 2;
  const wallMat = mat(0xf6e7d2);
  const roofMat = mat(0xc0392b);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  g.add(mesh(hipRoof(w + 1, 2.15, d + 0.9), roofMat, { y: h }));
  addPitchedRoofFinish(g, { w, d, y: h, roofHeight: 2.15, roofMat, type: 'hip' });

  // Deep central entry gives the restaurant a different massing from the shops.
  g.add(mesh(box(4.6, 3.5, 1.1), mat(0xe7d3b7), { y: 1.75, z: front + 0.5 }));
  g.add(mesh(box(5.2, 0.24, 1.7), roofMat, { y: 3.7, z: front + 0.7 }));
  g.add(mesh(box(1.25, 2.45, 0.16), mat(P.woodDark), { y: 1.23, z: front + 1.08, cast: false }));
  // Five separate noren panels read even when the facade sign is hidden.
  for (let i = 0; i < 5; i++) {
    g.add(mesh(box(0.72, 1.05, 0.1), roofMat, {
      x: -1.62 + i * 0.81, y: 2.78, z: front + 1.13, cast: false,
    }));
  }
  for (const sx of [-3.7, 3.7]) {
    const lantern = mesh(sphere(0.43, 10, 7), glow(0xffd9a0, 0.5), {
      x: sx, y: 3.25, z: front + 0.55, cast: false,
    });
    lantern.scale.y = 1.3;
    g.add(lantern);
  }
  facadeSign(g, sign, { w: 5.3, h: 0.8, y: 4.45, z: front + 0.08, fg: '#a52f26' });

  for (const sx of [-3.75, 3.75]) {
    addFaceWindow(g, { x: sx, y: 1.8, z: front + 0.02, w: 1.65, h: 1.65, material: glassMat });
    addFaceWindow(g, { x: sx, y: 2.25, z: -front - 0.02, w: 1.7, h: 1.3, material: glassMat });
  }
  for (const sx of [-1, 1]) {
    addSideWindow(g, { x: sx * (w / 2 + 0.02), y: 2.2, z: 0.5, w: 1.75, h: 1.3, material: glassMat });
    g.add(mesh(box(0.18, 0.75, 1.15), mat(P.metal), {
      x: sx * (w / 2 + 0.1), y: 3.85, z: -1.4, cast: false,
    }));
  }
  g.add(mesh(box(1.05, 2.05, 0.14), mat(P.metalDark), {
    y: 1.03, z: -front - 0.03, cast: false,
  }));
  g.add(mesh(cylinder(0.36, 0.36, 2.8, 8), mat(P.metal), {
    x: 3.55, y: h + 1.15, z: -2.2,
  }));
  g.add(mesh(cylinder(0.52, 0.36, 0.4, 8), mat(P.metalDark), {
    x: 3.55, y: h + 2.55, z: -2.2,
  }));
  addEntranceApproach(g, { front: front + 1.02, width: 1.7, depth: 1.1 });
  return g;
}

export function buildConvenience({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 4, 11.6);
  const d = Math.min(size[1] - 5, 7.8);
  const h = 4.35;
  const front = d / 2;
  const wallMat = mat(P.wallWhite);
  const glassMat = mat(P.glass);
  const greenMat = mat(0x2fa36b);
  const blueMat = mat(0x3fa8dd);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  addFlatRoofFinish(g, { w, d, y: h, edge: 0x2fa36b });

  // Familiar konbini colour bands wrap all four elevations.
  for (const yy of [3.55, 3.95]) {
    const bandMat = yy < 3.7 ? blueMat : greenMat;
    for (const zz of [-front - 0.07, front + 0.07]) {
      g.add(mesh(box(w + 0.12, 0.23, 0.14), bandMat, { y: yy, z: zz, cast: false }));
    }
    for (const sx of [-1, 1]) {
      g.add(mesh(box(0.14, 0.23, d + 0.12), bandMat, {
        x: sx * (w / 2 + 0.07), y: yy, cast: false,
      }));
    }
  }

  addFaceWindow(g, { x: -1.4, y: 1.65, z: front + 0.02, w: 6.5, h: 2.45, material: glassMat });
  g.add(mesh(box(1.35, 2.45, 0.16), greenMat, {
    x: 4.2, y: 1.23, z: front + 0.04, cast: false,
  }));
  addFaceWindow(g, { x: -2.3, y: 1.8, z: -front - 0.02, w: 2.7, h: 1.25, material: glassMat });
  g.add(mesh(box(2.6, 2.75, 0.16), mat(P.metalDark), {
    x: 3.2, y: 1.38, z: -front - 0.03, cast: false,
  }));
  for (const sx of [-1, 1]) {
    addSideWindow(g, { x: sx * (w / 2 + 0.02), y: 1.75, z: 0.8, w: 2.4, h: 1.45, material: glassMat });
  }
  facadeSign(g, sign, { w: 4.4, h: 0.72, y: 3.12, z: front + 0.08, fg: '#247a57' });

  // Tall rooftop marker plus paired vending machines make a 24-hour store cue.
  g.add(mesh(box(3.4, 1.55, 0.34), wallMat, { x: -2.8, y: 5.55, z: 0.3 }));
  g.add(mesh(box(3.1, 0.35, 0.38), blueMat, { x: -2.8, y: 5.75, z: 0.3, cast: false }));
  g.add(mesh(box(3.1, 0.35, 0.38), greenMat, { x: -2.8, y: 5.35, z: 0.3, cast: false }));
  for (let i = 0; i < 2; i++) {
    const vmX = -4.7 + i * 1.15;
    g.add(mesh(roundedBox(0.95, 1.85, 0.68, 0.08), mat(i ? P.blue : P.red), {
      x: vmX, y: 0.93, z: front + 0.52,
    }));
    g.add(mesh(box(0.62, 0.92, 0.06), glow(0xfff6d8, 0.35), {
      x: vmX, y: 1.18, z: front + 0.88, cast: false,
    }));
  }
  addEntranceApproach(g, { x: 4.2, front, width: 1.6, depth: 1.75 });
  return g;
}

export function buildBookstore({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 5, 9.2);
  const d = Math.min(size[1] - 5, 7.5);
  const h = 7.25;
  const front = d / 2;
  const wallMat = mat(0xe8dcc6);
  const blueMat = mat(0x3f6f8f);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  addFlatRoofFinish(g, { w, d, y: h, edge: 0x3f6f8f });

  addFaceWindow(g, { x: -1.15, y: 1.6, z: front + 0.02, w: 5.5, h: 2.35, material: glassMat });
  g.add(mesh(box(1.15, 2.3, 0.16), mat(P.woodDark), {
    x: 3.55, y: 1.15, z: front + 0.04, cast: false,
  }));
  for (const sx of [-2.5, 0, 2.5]) {
    addFaceWindow(g, { x: sx, y: 5.15, z: front + 0.02, w: 1.45, h: 1.25, material: glassMat });
    addFaceWindow(g, { x: sx, y: 4.8, z: -front - 0.02, w: 1.45, h: 1.25, material: glassMat });
  }
  addFaceWindow(g, { x: -1.5, y: 1.8, z: -front - 0.02, w: 2.1, h: 1.25, material: glassMat });
  g.add(mesh(box(1, 2, 0.14), mat(P.woodDark), {
    x: 2.7, y: 1, z: -front - 0.03, cast: false,
  }));
  for (const sx of [-1, 1]) {
    for (const yy of [2, 5]) {
      addSideWindow(g, { x: sx * (w / 2 + 0.02), y: yy, z: 0, w: 1.6, h: 1.2, material: glassMat });
    }
  }
  facadeSign(g, sign, { w: 4.8, h: 0.82, y: 3.65, z: front + 0.08, fg: '#315a76' });

  // Oversized stacked books replace a generic rooftop sign as the silhouette.
  const bookColors = [P.red, P.yellow, P.blue];
  const bookYs = [7.82, 8.28, 8.74];
  const bookRots = [-0.12, 0.1, -0.05];
  for (let i = 0; i < 3; i++) {
    const book = mesh(box(4.1, 0.38, 1.65), mat(bookColors[i]), {
      x: -0.4 + i * 0.15, y: bookYs[i], z: -0.15, cast: false,
    });
    book.rotation.y = bookRots[i];
    g.add(book);
    g.add(mesh(box(3.45, 0.2, 1.7), mat(P.cream), {
      x: -0.4 + i * 0.15, y: bookYs[i], z: -0.15, cast: false,
    }));
  }

  // A street-side display shelf carries bright, individually readable spines.
  g.add(mesh(box(3.2, 1.65, 0.35), mat(P.wood), {
    x: -2.2, y: 0.84, z: front + 0.38, cast: false,
  }));
  for (let i = 0; i < 7; i++) {
    const color = rng.pick([P.red, P.blue, P.yellow, P.green, P.purple]);
    g.add(mesh(box(0.28, 0.78, 0.16), mat(color), {
      x: -3.25 + i * 0.36, y: 1.08, z: front + 0.58, cast: false,
    }));
  }
  addEntranceApproach(g, { x: 3.55, front, width: 1.45, depth: 1.8 });
  return g;
}

export function buildSupermarket({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 3, 20);
  const d = Math.min(ld - 6, 13);
  const h = 6.5;
  g.add(mesh(roundedBox(w, h, d, 0.22), mat(0xf2f0e8), { y: h / 2, z: -1.5 }));
  g.add(mesh(box(w + 1, 0.6, d + 1), mat(0xe0553f), { y: h + 0.3, z: -1.5 }));
  const front = d / 2 - 1.5;
  g.add(mesh(box(w * 0.75, 3.2, 0.16), mat(P.glass), { y: 1.9, z: front + 0.02, cast: false }));
  g.add(mesh(box(w * 0.8, 0.4, 3.2), mat(0xe0553f), { y: 4.4, z: front + 1.5 }));
  facadeSign(g, sign, { w: Math.min(w * 0.7, 10), h: 1.2, y: h - 1, z: front + 0.1, fg: '#e0553f' });

  // trolley bay and a delivery van
  g.add(mesh(box(3.6, 0.12, 3), mat(0x9aa2ab), { x: -w * 0.36, y: 0.08, z: front + 3, cast: false }));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(0.8, 0.9, 1.2), mat(P.metal), { x: -w * 0.36, y: 0.6, z: front + 2.6 + i * 0.5, cast: false }));
  }
  const van = makeCar(rng);
  van.position.set(w * 0.3, 0, front + 3);
  van.rotation.y = Math.PI / 2;
  g.add(van);
  return g;
}

export function buildGasStation({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const apronW = Math.min(lw - 2, 18);
  const apronD = Math.min(ld - 2, 14);
  g.add(mesh(box(apronW, 0.14, apronD), mat(0xb9bcc0), { y: 0.09, cast: false }));

  // kiosk at the back
  const kiosk = new THREE.Group();
  kiosk.position.set(-apronW * 0.28, 0, -apronD * 0.28);
  kiosk.add(mesh(roundedBox(7, 4, 5, 0.18), mat(0xf7f5ef), { y: 2 }));
  kiosk.add(mesh(box(7.6, 0.4, 5.6), mat(0xe04f4f), { y: 4.2 }));
  kiosk.add(mesh(box(4.4, 2.4, 0.14), mat(P.glass), { y: 1.5, z: 2.52, cast: false }));
  g.add(kiosk);
  facadeSign(g, sign, { w: 5, h: 0.8, y: 3.5, z: -apronD * 0.28 + 2.6 });

  // forecourt canopy + pumps
  const canopy = mesh(box(apronW * 0.7, 0.6, 7), mat(0xe04f4f), { y: 5.2, z: apronD * 0.15 });
  g.add(canopy);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      g.add(mesh(cylinder(0.28, 0.28, 5.2, 8), mat(P.metal), {
        x: sx * apronW * 0.28, y: 2.6, z: apronD * 0.15 + sz * 2.8,
      }));
    }
  }
  for (const sx of [-1, 1]) {
    const pump = new THREE.Group();
    pump.position.set(sx * 2.6, 0, apronD * 0.15);
    pump.add(mesh(box(2.6, 0.35, 1.6), mat(0xd9d3c4), { y: 0.2, cast: false }));
    pump.add(mesh(roundedBox(0.9, 1.9, 0.7, 0.12), mat(0xf7f5ef), { y: 1.15 }));
    pump.add(mesh(box(0.6, 0.7, 0.08), glow(0x86e8ff, 0.4), { y: 1.6, z: 0.38, cast: false }));
    g.add(pump);
  }
  const car = makeCar(rng);
  car.position.set(2.6, 0, apronD * 0.15 + 3.2);
  g.add(car);
  return g;
}

/* ------------------------------ CIVIC ------------------------------ */

export function buildPoliceStation({ size, sign, rng }) {
  const [lw, ld] = size;
  const g = new THREE.Group();
  const w = Math.min(lw - 7, 13.5);
  const d = Math.min(ld - 8, 9);
  const h = 5.1;
  const bodyZ = -0.8;
  const front = bodyZ + d / 2;
  const wallMat = mat(0xeef2f6);
  const blueMat = mat(0x2f5f9e);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d, { z: bodyZ });
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2, z: bodyZ }));
  addFlatRoofFinish(g, { w, d, y: h, z: bodyZ, edge: 0x2f5f9e });

  // Koban-like watch tower makes the station visible above neighbouring roofs.
  const towerX = -w / 2 + 2.1;
  const tower = new THREE.Group();
  tower.position.set(towerX, 0, bodyZ - 1);
  tower.add(mesh(box(4.2, 9, 4.5), wallMat, { y: 4.5 }));
  tower.add(mesh(hipRoof(5, 1.8, 5.3), blueMat, { y: 9 }));
  addPitchedRoofFinish(tower, {
    w: 4.2, d: 4.5, y: 9, roofHeight: 1.8, roofMat: blueMat, type: 'hip',
  });
  g.add(tower);
  for (const zz of [-2.25, 0.25]) {
    addSideWindow(g, { x: towerX - 2.12, y: 6.6, z: bodyZ + zz, w: 1.15, h: 1.45, material: glassMat });
  }
  addFaceWindow(g, { x: towerX, y: 6.7, z: front + 0.02, w: 1.6, h: 1.5, material: glassMat });
  addFaceWindow(g, { x: towerX, y: 6.7, z: bodyZ - d / 2 - 0.02, w: 1.6, h: 1.5, material: glassMat });

  // Public entrance and a single broad vehicle bay split the front elevation.
  g.add(mesh(box(1.3, 2.5, 0.16), blueMat, {
    x: 1.1, y: 1.25, z: front + 0.04, cast: false,
  }));
  g.add(mesh(box(4.15, 3.35, 0.18), mat(P.metal), {
    x: 4.45, y: 1.68, z: front + 0.04, cast: false,
  }));
  for (let i = 0; i < 5; i++) {
    g.add(mesh(box(3.85, 0.09, 0.08), blueMat, {
      x: 4.45, y: 0.55 + i * 0.62, z: front + 0.16, cast: false,
    }));
  }
  facadeSign(g, sign, { w: 4.2, h: 0.78, y: 4.35, z: front + 0.08, fg: '#28558e' });
  for (const sx of [0.7, 4.2]) {
    addFaceWindow(g, { x: sx, y: 2, z: bodyZ - d / 2 - 0.02, w: 1.7, h: 1.25, material: glassMat });
  }
  g.add(mesh(box(1, 2, 0.14), blueMat, {
    x: -1.8, y: 1, z: bodyZ - d / 2 - 0.03, cast: false,
  }));
  addSideWindow(g, { x: w / 2 + 0.02, y: 2.1, z: bodyZ - 0.6, w: 1.8, h: 1.3, material: glassMat });

  const lamp = mesh(cylinder(0.42, 0.42, 0.55, 10), glow(0x4aa3ff, 0.8), {
    x: towerX, y: 11.15, z: bodyZ - 1, cast: false,
  });
  g.add(lamp);
  const patrol = makeCar(rng);
  const patrolX = Math.min(7.2, lw / 2 - 3.1);
  const patrolZ = Math.min(front + 2.6, ld / 2 - 1.3);
  patrol.position.set(patrolX, 0, patrolZ);
  patrol.rotation.y = Math.PI / 2;
  g.add(patrol);
  g.add(mesh(box(0.9, 0.3, 1.6), glow(0x4aa3ff, 0.6), {
    x: patrolX, y: 2.3, z: patrolZ, cast: false,
  }));
  addEntranceApproach(g, { x: 1.1, front, width: 1.7, depth: 2 });

  // Preserve the existing animation hook consumed by construction/activity code.
  g.userData.animate = (dt, time) => {
    lamp.rotation.y = time * 3;
    lamp.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(time * 3)) * 0.6;
  };
  return g;
}

export function buildFireStation({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 3, 18);
  const d = Math.min(ld - 5, 12);
  const h = 7.5;
  g.add(mesh(roundedBox(w, h, d, 0.2), mat(0xf4ece2), { y: h / 2, z: -2 }));
  g.add(mesh(box(w + 1, 0.6, d + 1), mat(0xc0392b), { y: h + 0.3, z: -2 }));
  const front = d / 2 - 2;

  // the giveaway: two big roller doors with a fire engine pulling out
  for (const sx of [-1, 1]) {
    g.add(mesh(box(w * 0.36, 4.4, 0.2), mat(0xc0392b), { x: sx * w * 0.21, y: 2.2, z: front + 0.03, cast: false }));
    for (let i = 0; i < 6; i++) {
      g.add(mesh(box(w * 0.34, 0.12, 0.1), mat(0xe6b0a6), { x: sx * w * 0.21, y: 0.7 + i * 0.7, z: front + 0.15, cast: false }));
    }
  }
  facadeSign(g, sign, { w: Math.min(w * 0.6, 9), h: 1, y: h - 1.1, z: front + 0.08, fg: '#c0392b' });
  // hose tower
  g.add(mesh(roundedBox(3.4, 11, 3.4, 0.2), mat(0xf4ece2), { x: -w / 2 + 1.7, y: 5.5, z: -d / 2 - 0.4 }));
  g.add(mesh(hipRoof(4.2, 1.6, 4.2), mat(0xc0392b), { x: -w / 2 + 1.7, y: 11, z: -d / 2 - 0.4 }));

  const engine = new THREE.Group();
  engine.position.set(w * 0.21, 0, front + 2.3);
  engine.add(mesh(roundedBox(2.4, 1.5, 6.4, 0.3), mat(0xd0342c), { y: 1.35 }));
  engine.add(mesh(roundedBox(2.3, 1.2, 2.2, 0.25), mat(0xd0342c), { y: 2.6, z: 1.9 }));
  engine.add(mesh(box(2.1, 0.7, 1.5), mat(P.glass), { y: 2.7, z: 3, cast: false }));
  engine.add(mesh(box(1.6, 0.3, 4), mat(P.metal), { y: 3.35, z: -0.8, cast: false }));
  engine.add(mesh(box(1.4, 0.25, 0.4), glow(0x4aa3ff, 0.7), { y: 3.5, z: 1.7, cast: false }));
  for (const sx of [-1, 1]) {
    for (const sz of [-2, 1.8]) {
      const wheel = mesh(cylinder(0.5, 0.5, 0.36, 8), mat(0x2f3640), { x: sx * 1.2, y: 0.5, z: sz, cast: false });
      wheel.rotation.z = Math.PI / 2;
      engine.add(wheel);
    }
  }
  engine.scale.setScalar(0.68);
  g.add(engine);
  g.userData.engine = engine;
  g.userData.engineHome = engine.position.clone();
  if (rng.chance(0.6)) {
    const t = makeTree(rng, { scale: 0.8 });
    t.position.set(-w / 2 - 1.5, 0, front + 3);
    g.add(t);
  }
  return g;
}

export function buildPostOffice({ size, sign, rng }) {
  return civicBlock({
    size, sign, rng, wall: 0xfdf6e8, accent: 0xd34b3f, storeys: 2,
    dressing: (g, { w, front }) => {
      // the red post box everyone recognises
      const boxBody = mesh(cylinder(0.55, 0.55, 2.2, 12), mat(0xd34b3f), { x: -w * 0.4, y: 1.1, z: front + 2.6 });
      g.add(boxBody);
      g.add(mesh(sphere(0.55, 12, 8), mat(0xd34b3f), { x: -w * 0.4, y: 2.2, z: front + 2.6, cast: false }));
      g.add(mesh(box(0.7, 0.16, 0.12), mat(0x33414d), { x: -w * 0.4, y: 1.75, z: front + 3.14, cast: false }));
      const van = makeCar(rng);
      van.position.set(w * 0.42 + 2.2, 0, front + 3.4);
      van.rotation.y = Math.PI / 2;
      g.add(van);
    },
  });
}

export function buildCityHall({ size, sign, rng }) {
  return civicBlock({
    size, sign, rng, wall: 0xf3efe2, accent: 0x4a6b8a, storeys: 3, tower: true, flag: true,
    dressing: (g, { w, front }) => {
      for (const sx of [-1, 1]) {
        g.add(mesh(cylinder(0.45, 0.5, 6.4, 12), mat(0xf3efe2), { x: sx * w * 0.3, y: 3.2, z: front + 1.4 }));
      }
      const planter = mesh(box(3.4, 0.7, 1.4), mat(0xd9d3c4), { x: w * 0.42 + 1.4, y: 0.35, z: front + 3, cast: false });
      g.add(planter);
      const bush = makeBush(rng, 0.9);
      bush.position.set(w * 0.42 + 1.4, 0.7, front + 3);
      g.add(bush);
    },
  });
}

export function buildBank({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = Math.min(size[0] - 5, 10.8);
  const d = Math.min(size[1] - 5, 8.2);
  const h = 5.8;
  const front = d / 2;
  const wallMat = mat(0xeae3d2);
  const greenMat = mat(0x2c7a5b);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wallMat, { y: h / 2 }));
  g.add(mesh(gableRoof(w + 0.9, 1.7, d + 0.8), greenMat, { y: h }));
  addPitchedRoofFinish(g, { w, d, y: h, roofHeight: 1.7, roofMat: greenMat, type: 'gable' });

  // Chunky portico and pediment give the bank a deliberately solid profile.
  g.add(mesh(box(7.4, 0.35, 2.2), greenMat, { y: 4.55, z: front + 0.92 }));
  for (const sx of [-2.6, -0.85, 0.85, 2.6]) {
    g.add(mesh(cylinder(0.28, 0.34, 4.4, 8), mat(P.cream), {
      x: sx, y: 2.2, z: front + 1.65,
    }));
  }
  g.add(mesh(box(1.35, 2.6, 0.16), greenMat, {
    y: 1.3, z: front + 0.04, cast: false,
  }));
  for (const sx of [-3.55, 3.55]) {
    addFaceWindow(g, { x: sx, y: 2.1, z: front + 0.02, w: 1.55, h: 1.45, material: glassMat });
    addFaceWindow(g, { x: sx, y: 2.25, z: -front - 0.02, w: 1.55, h: 1.3, material: glassMat });
  }
  facadeSign(g, sign, { w: 4.4, h: 0.82, y: 5.05, z: front + 0.08, fg: '#28694f' });

  // A rear vault wheel and side ATM make even non-front views informative.
  const vault = mesh(cylinder(1.05, 1.05, 0.34, 16), mat(P.metal), {
    y: 1.75, z: -front - 0.18, cast: false,
  });
  vault.rotation.x = Math.PI / 2;
  g.add(vault);
  for (const rz of [0, Math.PI / 3, -Math.PI / 3]) {
    const spoke = mesh(box(0.13, 1.55, 0.1), mat(P.metalDark), {
      y: 1.75, z: -front - 0.39, cast: false,
    });
    spoke.rotation.z = rz;
    g.add(spoke);
  }
  for (const sx of [-1, 1]) {
    addSideWindow(g, { x: sx * (w / 2 + 0.02), y: 3.9, z: 0.8, w: 1.45, h: 1.15, material: glassMat });
  }
  g.add(mesh(roundedBox(1.15, 2, 0.65, 0.08), mat(P.metal), {
    x: w / 2 + 0.38, y: 1, z: 1.1,
  }));
  g.add(mesh(box(0.08, 0.72, 0.48), glassMat, {
    x: w / 2 + 0.99, y: 1.35, z: 1.1, cast: false,
  }));
  addEntranceApproach(g, { front, width: 2, depth: 2.25 });
  return g;
}

/* ---------------------------- ATTRACTIONS ---------------------------- */

export function buildZoo({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.16, ld - 2), mat(0x93d762), { y: 0.09, cast: false }));

  // entrance arch with the sign
  const arch = new THREE.Group();
  arch.position.z = ld / 2 - 1.5;
  for (const sx of [-3.4, 3.4]) {
    arch.add(mesh(cylinder(0.5, 0.6, 5.4, 10), mat(0x9c6b48), { x: sx, y: 2.7 }));
  }
  arch.add(mesh(box(8.4, 1.4, 1), mat(0x9c6b48), { y: 5.7 }));
  const plate = signPlane(sign, 6.4, 1, { bg: 'transparent', fg: '#3f7a3f' });
  plate.position.set(0, 5.7, 0.55);
  arch.add(plate);
  g.add(arch);

  // winding path
  g.add(mesh(box(3, 0.1, ld - 5), mat(0xdcc9a0), { y: 0.2, z: -1, cast: false }));
  g.add(mesh(box(lw - 8, 0.1, 3), mat(0xdcc9a0), { y: 0.2, z: -ld * 0.22, cast: false }));

  // three fenced enclosures with simple stand-in animals
  const pens = [
    { x: -lw * 0.26, z: -ld * 0.05, r: 4.6, animal: 'elephant' },
    { x: lw * 0.26, z: -ld * 0.06, r: 4.2, animal: 'giraffe' },
    { x: 0, z: -ld * 0.34, r: 3.4, animal: 'lion' },
  ];
  for (const pen of pens) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(pen.r, 0.12, 5, 22),
      mat(0x8a929c)
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(pen.x, 1.1, pen.z);
    g.add(ring);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.add(mesh(box(0.14, 1.2, 0.14), mat(0x8a929c), {
        x: pen.x + Math.cos(a) * pen.r, y: 0.6, z: pen.z + Math.sin(a) * pen.r, cast: false,
      }));
    }
    g.add(mesh(cylinder(pen.r * 0.9, pen.r * 0.9, 0.12, 16), mat(0xcbb98d), { x: pen.x, y: 0.16, z: pen.z, cast: false }));

    const a = new THREE.Group();
    a.position.set(pen.x, 0, pen.z);
    if (pen.animal === 'elephant') {
      a.add(mesh(roundedBox(3.4, 2.2, 2.2, 0.7), mat(0x9aa3ad), { y: 2.1 }));
      a.add(mesh(sphere(1, 10, 8), mat(0x9aa3ad), { x: 1.9, y: 2.6 }));
      a.add(mesh(cylinder(0.24, 0.34, 1.9, 8), mat(0x9aa3ad), { x: 2.5, y: 1.5 }));
      for (const [sx, sz] of [[-1, -0.7], [-1, 0.7], [1, -0.7], [1, 0.7]]) {
        a.add(mesh(cylinder(0.4, 0.4, 1.2, 8), mat(0x9aa3ad), { x: sx, y: 0.6, z: sz }));
      }
    } else if (pen.animal === 'giraffe') {
      a.add(mesh(roundedBox(2.4, 1.6, 1.4, 0.5), mat(0xe0b05a), { y: 2.6 }));
      a.add(mesh(cylinder(0.28, 0.34, 3.4, 8), mat(0xe0b05a), { x: 0.9, y: 4.4 }));
      a.add(mesh(roundedBox(1, 0.7, 0.7, 0.2), mat(0xe0b05a), { x: 1.2, y: 6 }));
      for (const [sx, sz] of [[-0.8, -0.5], [-0.8, 0.5], [0.8, -0.5], [0.8, 0.5]]) {
        a.add(mesh(cylinder(0.2, 0.2, 1.9, 8), mat(0xe0b05a), { x: sx, y: 0.95, z: sz }));
      }
    } else {
      a.add(mesh(roundedBox(2.6, 1.3, 1.3, 0.5), mat(0xd9a24a), { y: 1.3 }));
      a.add(mesh(sphere(0.85, 10, 8), mat(0xd9a24a), { x: 1.5, y: 1.6 }));
      a.add(mesh(sphere(1.05, 10, 8), mat(0xa8722f), { x: 1.35, y: 1.6, cast: false }));
      for (const [sx, sz] of [[-0.8, -0.4], [-0.8, 0.4], [0.8, -0.4], [0.8, 0.4]]) {
        a.add(mesh(cylinder(0.22, 0.22, 0.9, 8), mat(0xd9a24a), { x: sx, y: 0.45, z: sz }));
      }
    }
    a.rotation.y = rng.range(-0.6, 0.6);
    g.add(a);
    a.userData.bobPhase = rng.range(0, 6.28);
    pen.model = a;
  }

  const treeSpots = [];
  for (let attempt = 0; attempt < 70 && treeSpots.length < 7; attempt++) {
    const x = rng.range(-lw / 2 + 2, lw / 2 - 2);
    const z = rng.range(-ld / 2 + 2, ld / 2 - 4);
    if (pens.some((pen) => Math.hypot(x - pen.x, z - pen.z) < pen.r + 1.5)) continue;
    if (Math.abs(x) < 2.4 || Math.abs(z + ld * 0.22) < 2.4) continue;
    if (Math.hypot(x - lw * 0.3, z - ld * 0.22) < 2.5) continue;
    if (treeSpots.some((spot) => Math.hypot(x - spot.x, z - spot.z) < 3)) continue;
    treeSpots.push({ x, z });
  }
  for (const spot of treeSpots) {
    const t = makeTree(rng, { scale: rng.range(0.8, 1.2) });
    t.position.set(spot.x, 0.1, spot.z);
    g.add(t);
  }
  const bench = makeBench(rng);
  bench.position.set(lw * 0.3, 0.15, ld * 0.22);
  g.add(bench);

  let excite = 0;
  let starred = null;
  g.userData.pens = pens;
  /** Wake the animals up - one in particular if the child named it. */
  g.userData.exciteAnimal = (animal) => {
    excite = 6;
    starred = animal;
  };
  g.userData.animate = (dt, time) => {
    if (excite > 0) excite = Math.max(0, excite - dt);
    for (const pen of pens) {
      const star = excite > 0 && (!starred || pen.animal === starred);
      const lift = star ? 0.55 : 0.12;
      const rate = star ? 4.5 : 1.4;
      pen.model.position.y = Math.abs(Math.sin(time * rate + pen.model.userData.bobPhase)) * lift;
      if (star) pen.model.rotation.y += dt * 0.8;
    }
  };
  return g;
}

export function buildAquarium({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 4, 20);
  const d = Math.min(ld * 0.5, 9);
  const h = 9;
  const buildingZ = -ld * 0.13;

  // a curved, modern shell in blue glass
  g.add(mesh(roundedBox(w, h, d, 0.9), mat(0xe8f2f6), { y: h / 2, z: buildingZ }));
  const dome = mesh(sphere(w * 0.36, 18, 12), mat(0x7fc9e8, { transparent: true, opacity: 0.85 }), { y: h - 0.5, z: buildingZ });
  dome.scale.y = 0.5;
  g.add(dome);
  const front = buildingZ + d / 2;
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(w * 0.8, 1.6, 0.14), mat(0x3fa3d9), { y: 2.2 + i * 2.6, z: front + 0.02, cast: false }));
  }
  g.add(mesh(box(4, 3.2, 0.2), mat(0x2b3542), { y: 1.6, z: front + 0.04, cast: false }));
  facadeSign(g, sign, { w: Math.min(w * 0.62, 9), h: 1.1, y: h - 1.4, z: front + 0.1, fg: '#2a7fa8' });

  // outdoor pool with a leaping dolphin
  const poolZ = front + 3.2;
  const pool = mesh(cylinder(2.7, 2.7, 0.6, 20), mat(0x4fbfe0), { x: -w * 0.1, y: 0.3, z: poolZ, cast: false });
  g.add(pool);
  g.add(mesh(cylinder(3.1, 3.1, 0.4, 20), mat(0xe6e2d6), { x: -w * 0.1, y: 0.2, z: poolZ, cast: false }));
  const dolphin = new THREE.Group();
  dolphin.position.set(-w * 0.1, 1.4, poolZ);
  const bodyD = mesh(roundedBox(1, 1.1, 3.4, 0.5), mat(0x8fa8b8), {});
  dolphin.add(bodyD);
  dolphin.add(mesh(box(0.14, 0.8, 0.9), mat(0x8fa8b8), { y: 0.7, z: -0.2, cast: false }));
  dolphin.add(mesh(box(1.4, 0.14, 0.7), mat(0x8fa8b8), { z: -1.7, cast: false }));
  g.add(dolphin);

  let jumpT = 0;
  const show = { speed: 1 };
  g.userData.dolphinShow = show;
  g.userData.poolCentre = new THREE.Vector3(-w * 0.1, 0, poolZ);
  g.userData.animate = (dt) => {
    jumpT = (jumpT + dt * 0.5 * show.speed) % 1;
    dolphin.position.y = 0.9 + Math.sin(jumpT * Math.PI) * 2.4;
    dolphin.rotation.x = Math.cos(jumpT * Math.PI) * 0.9;
  };
  return g;
}

export function buildAmusementPark({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.16, ld - 2), mat(0xc9b78d), { y: 0.09, cast: false }));

  // colourful entrance
  const gate = new THREE.Group();
  gate.position.z = ld / 2 - 1.5;
  for (const sx of [-3.6, 3.6]) gate.add(mesh(cylinder(0.4, 0.5, 5, 10), mat(0xe0553f), { x: sx, y: 2.5 }));
  const banner = mesh(box(8.6, 1.6, 0.6), mat(0xffd166), { y: 5.4 });
  gate.add(banner);
  const plate = signPlane(sign, 7, 1.2, { bg: 'transparent', fg: '#c0392b' });
  plate.position.set(0, 5.4, 0.35);
  gate.add(plate);
  for (let i = -3; i <= 3; i++) {
    gate.add(mesh(sphere(0.28, 8, 6), glow(rng.pick([0xff6b6b, 0xffd166, 0x6bcb77, 0x4d96ff]), 0.6), {
      x: i * 1.2, y: 6.4, cast: false,
    }));
  }
  g.add(gate);

  // ferris wheel
  const wheel = new THREE.Group();
  wheel.position.set(-lw * 0.2, 0, -ld * 0.16);
  const R = Math.min(lw, ld) * 0.32;
  for (const sx of [-1.6, 1.6]) {
    const leg = mesh(cylinder(0.22, 0.3, R + 2, 8), mat(P.metalDark), { x: sx, y: (R + 2) / 2 });
    leg.rotation.z = sx > 0 ? -0.22 : 0.22;
    wheel.add(leg);
  }
  const rim = new THREE.Group();
  rim.position.y = R + 1.4;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.16, 6, 32), mat(0xe8e4d8));
  rim.add(ring);
  const cabins = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = mesh(box(0.1, R * 2, 0.1), mat(0xe8e4d8), { cast: false });
    spoke.rotation.z = a;
    if (i < 5) rim.add(spoke);
    const cabin = mesh(roundedBox(1.2, 1.2, 1.2, 0.3), mat(rng.pick([0xff6b6b, 0xffd166, 0x6bcb77, 0x4d96ff, 0xc490e4])), {
      x: Math.cos(a) * R, y: Math.sin(a) * R,
    });
    rim.add(cabin);
    cabins.push({ cabin, a });
  }
  wheel.add(rim);
  g.add(wheel);

  // a small coaster loop and a carousel
  const coaster = new THREE.Group();
  coaster.position.set(lw * 0.24, 0, -ld * 0.1);
  const track = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.16, 6, 26), mat(0xe0553f));
  track.rotation.x = 0.25;
  track.position.y = 4.4;
  coaster.add(track);
  for (const sx of [-3, 3]) coaster.add(mesh(box(0.3, 4.4, 0.3), mat(P.metalDark), { x: sx, y: 2.2 }));
  const cart = mesh(roundedBox(1.1, 0.8, 1.6, 0.25), mat(0xffd166), { y: 8.6 });
  coaster.add(cart);
  g.add(coaster);

  const carousel = new THREE.Group();
  carousel.position.set(lw * 0.02, 0, ld * 0.2);
  carousel.add(mesh(cylinder(3.4, 3.4, 0.4, 16), mat(0xf0e6d2), { y: 0.3, cast: false }));
  carousel.add(mesh(cylinder(0.4, 0.4, 4, 8), mat(P.metalDark), { y: 2.2 }));
  const roof = mesh(cylinder(0.2, 3.8, 1.5, 16), mat(0xe0553f), { y: 4.6 });
  carousel.add(roof);
  const horses = new THREE.Group();
  horses.position.y = 0.5;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    horses.add(mesh(roundedBox(0.6, 1, 1.4, 0.25), mat(rng.pick([0xffffff, 0xffd166, 0xff9aa2])), {
      x: Math.cos(a) * 2.4, y: 1.3, z: Math.sin(a) * 2.4,
    }));
    horses.add(mesh(cylinder(0.07, 0.07, 2.6, 6), mat(P.metal), {
      x: Math.cos(a) * 2.4, y: 1.8, z: Math.sin(a) * 2.4, cast: false,
    }));
  }
  carousel.add(horses);
  g.add(carousel);

  let wheelAngle = 0;
  let horseAngle = 0;
  let coasterT = 0;
  const speed = { ferris: 1, carousel: 1, coaster: 1 };
  g.userData.rides = speed;
  g.userData.animate = (dt) => {
    wheelAngle += dt * 0.35 * speed.ferris;
    horseAngle += dt * 0.8 * speed.carousel;
    coasterT = (coasterT + dt * 0.35 * speed.coaster) % 1;
    rim.rotation.z = wheelAngle;
    for (const c of cabins) c.cabin.rotation.z = -rim.rotation.z;
    horses.rotation.y = horseAngle;
    const t = coasterT;
    const a = t * Math.PI * 2;
    cart.position.set(
      Math.cos(a) * 4.2,
      4.4 + Math.sin(a) * 4.2 * Math.cos(0.25),
      Math.sin(a) * 4.2 * Math.sin(0.25)
    );
  };
  return g;
}

export function buildCastle({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const wallH = 5;
  const half = Math.min(lw, ld) * 0.39;

  // stone base and curtain walls
  g.add(mesh(box(lw - 3, 1.2, ld - 3), mat(0x9aa0a6), { y: 0.6, cast: false }));
  for (const [dx, dz, len, rot] of [
    [0, -half, half * 2, 0], [0, half, half * 2, 0],
    [-half, 0, half * 2, Math.PI / 2], [half, 0, half * 2, Math.PI / 2],
  ]) {
    g.add(mesh(box(len, wallH, 1.6), mat(0xd6d0c2), { x: dx, y: wallH / 2 + 1.2, z: dz, ry: rot }));
  }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tower = new THREE.Group();
    tower.position.set(sx * half, 0, sz * half);
    tower.add(mesh(cylinder(1.9, 2.2, 8, 12), mat(0xe4dfd1), { y: 5.2 }));
    tower.add(mesh(cylinder(0.1, 2.6, 2.6, 12), mat(0x3f6f8f), { y: 10.4 }));
    g.add(tower);
  }

  // the keep: stacked tiers with upturned roofs
  const keep = new THREE.Group();
  keep.position.y = 1.2;
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const s = 9 - i * 2.2;
    const y = 3.2 + i * 4.2;
    keep.add(mesh(roundedBox(s, 3.4, s * 0.85, 0.2), mat(0xf4f0e4), { y }));
    const roof = mesh(hipRoof(s + 2.4, 2, s * 0.85 + 2.2), mat(0x3f5f7f), { y: y + 1.7 });
    keep.add(roof);
    for (let k = 0; k < 3; k++) {
      keep.add(mesh(box(0.9, 0.9, 0.1), mat(0x2b3542), { x: -s * 0.28 + k * (s * 0.28), y, z: s * 0.43, cast: false }));
    }
  }
  keep.add(mesh(sphere(0.5, 10, 8), mat(P.yellow), { y: 3.2 + tiers * 4.2 + 0.4, cast: false }));
  g.add(keep);

  // gate
  const gateZ = half;
  g.add(mesh(box(4.4, 4.4, 2.2), mat(0x8a6340), { y: 3.4, z: gateZ }));
  g.add(mesh(box(3, 3.2, 0.3), mat(0x5b432c), { y: 2.8, z: gateZ + 1.2, cast: false }));
  facadeSign(g, sign, { w: 5.5, h: 0.9, y: 6.4, z: gateZ + 1.25, fg: '#3f5f7f' });
  for (let i = 0; i < 4; i++) {
    const t = makeTree(rng, { scale: 0.85, kind: 'pine' });
    t.position.set(rng.range(-lw / 2 + 2, lw / 2 - 2), 0, rng.range(ld * 0.2, ld / 2 - 2));
    g.add(t);
  }
  return g;
}

export function buildTemple({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 3, 0.16, ld - 3), mat(0xd8cdb4), { y: 0.09, cast: false }));

  // torii gate at the front
  const torii = new THREE.Group();
  torii.position.z = ld / 2 - 2;
  for (const sx of [-2.6, 2.6]) {
    const pillar = mesh(cylinder(0.32, 0.42, 6, 10), mat(0xc0392b), { x: sx, y: 3 });
    pillar.rotation.z = sx > 0 ? -0.03 : 0.03;
    torii.add(pillar);
  }
  const top = mesh(box(8.2, 0.5, 0.9), mat(0xc0392b), { y: 6.1 });
  top.rotation.x = 0.02;
  torii.add(top);
  torii.add(mesh(box(6.6, 0.35, 0.7), mat(0xc0392b), { y: 5.2 }));
  g.add(torii);

  // main hall with a deep hipped roof
  const hall = new THREE.Group();
  hall.position.z = -ld * 0.12;
  hall.add(mesh(box(13, 1, 10), mat(0xb9ac91), { y: 0.5, cast: false }));
  hall.add(mesh(roundedBox(11, 4.2, 8, 0.16), mat(0xf0e6d2), { y: 3.1 }));
  hall.add(mesh(hipRoof(15, 3.4, 12), mat(0x4a5560), { y: 5.2 }));
  hall.add(mesh(hipRoof(9, 2, 7), mat(0x4a5560), { y: 8.2 }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      hall.add(mesh(cylinder(0.3, 0.3, 4.2, 8), mat(0xc0392b), { x: sx * 5, y: 3.1, z: sz * 3.6 }));
    }
  }
  hall.add(mesh(box(3.2, 3, 0.14), mat(0x8a6340), { y: 2.5, z: 4.02, cast: false }));
  g.add(hall);
  facadeSign(g, sign, { w: 5, h: 0.9, y: 5.6, z: -ld * 0.12 + 4.2, bg: '#f7f3e8', fg: '#8a3324' });

  // stone lanterns and steps
  for (const sx of [-1, 1]) {
    const lantern = new THREE.Group();
    lantern.position.set(sx * 5.5, 0, ld * 0.16);
    lantern.add(mesh(cylinder(0.4, 0.5, 1.4, 8), mat(0xb0aa9a), { y: 0.7 }));
    lantern.add(mesh(box(1.3, 0.9, 1.3), glow(0xffe9b0, 0.35), { y: 1.8 }));
    lantern.add(mesh(hipRoof(1.8, 0.7, 1.8), mat(0x9a9488), { y: 2.25 }));
    g.add(lantern);
  }
  steps(g, { w: 6, depth: 1.6, count: 3, z: -ld * 0.12 + 4.6, color: 0xc9c2b0 });
  for (let i = 0; i < 4; i++) {
    const t = makeTree(rng, { scale: rng.range(0.8, 1.1) });
    t.position.set(rng.range(-lw / 2 + 2, lw / 2 - 2), 0, rng.range(-ld / 2 + 2, ld * 0.05));
    g.add(t);
  }
  return g;
}

export function buildMovieTheater({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 3, 18);
  const d = Math.min(ld - 5, 13);
  const h = 10;
  g.add(mesh(roundedBox(w, h, d, 0.25), mat(0x2f3a4a), { y: h / 2, z: -1 }));
  g.add(mesh(box(w + 1, 0.6, d + 1), mat(0xe0553f), { y: h + 0.3, z: -1 }));
  const front = d / 2 - 1;

  // marquee canopy with chaser bulbs
  const marquee = mesh(box(w * 0.86, 1.3, 3.6), mat(0xf7f0dc), { y: 5.2, z: front + 1.6 });
  g.add(marquee);
  const bulbs = [];
  for (let i = 0; i < 12; i++) {
    const b = mesh(sphere(0.17, 6, 5), glow(0xffe9a8, 0.7), {
      x: -w * 0.4 + (w * 0.8 * i) / 11, y: 4.5, z: front + 3.25, cast: false,
    });
    bulbs.push(b);
    g.add(b);
  }
  facadeSign(g, sign, { w: Math.min(w * 0.7, 10), h: 1.1, y: 5.2, z: front + 3.25, bg: '#f7f0dc', fg: '#c0392b' });
  // poster boards and doors
  for (const sx of [-1, 1]) {
    g.add(mesh(box(2, 3, 0.16), mat(rng.pick([0x4d96ff, 0xffd166, 0x6bcb77])), { x: sx * w * 0.3, y: 2.2, z: front + 0.03, cast: false }));
  }
  g.add(mesh(box(w * 0.3, 3, 0.18), mat(0x8a6340), { y: 1.5, z: front + 0.04, cast: false }));
  g.add(mesh(box(w * 0.55, 2.6, 0.14), glow(0xffe9a8, 0.25), { y: 8, z: front + 0.03, cast: false }));

  const marqueeState = { bright: 0 };
  g.userData.marquee = marqueeState;
  g.userData.animate = (dt, time) => {
    const lit = marqueeState.bright > 0 ? 1.4 : 0.9;
    for (let i = 0; i < bulbs.length; i++) {
      const on = (Math.floor(time * 6) + i) % 3 === 0;
      bulbs[i].material = on ? glow(0xffe9a8, lit) : glow(0xffe9a8, 0.15);
    }
  };
  return g;
}

export function buildGym({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = Math.min(lw - 3, 20);
  const d = Math.min(ld - 5, 14);
  const h = 8;
  g.add(mesh(roundedBox(w, h, d, 0.3), mat(0xe9edf1), { y: h / 2, z: -1 }));
  // barrel roof - the classic sports-hall silhouette
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(d * 0.55, d * 0.55, w, 16, 1, false, 0, Math.PI),
    mat(0x4a6b8a)
  );
  roof.rotation.z = Math.PI / 2;
  roof.position.set(0, h, -1);
  g.add(roof);
  const front = d / 2 - 1;
  g.add(mesh(box(w * 0.7, 3, 0.16), mat(P.glass), { y: 2.2, z: front + 0.02, cast: false }));
  for (let i = 0; i < 4; i++) {
    g.add(mesh(box(1.4, 1.4, 0.14), mat(P.glass), { x: -w * 0.3 + i * (w * 0.2), y: 6, z: front + 0.02, cast: false }));
  }
  facadeSign(g, sign, { w: Math.min(w * 0.55, 8), h: 1, y: 5.9, z: front + 0.08, fg: '#2f5f9e' });
  steps(g, { w: 6, depth: 1.6, count: 2, z: front + 1.2 });
  // outdoor half-court
  g.add(mesh(box(w * 0.6, 0.12, 3), mat(0xb96a4a), { x: w * 0.1, y: 0.08, z: front + 1.7, cast: false }));
  const hoop = new THREE.Group();
  hoop.position.set(w * 0.1, 0, front + 2.3);
  hoop.add(mesh(cylinder(0.16, 0.2, 3.4, 8), mat(P.metalDark), { y: 1.7 }));
  hoop.add(mesh(box(1.8, 1.2, 0.14), mat(0xffffff), { y: 3.6 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 5, 14), mat(0xe0553f));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 3.1, 0.5);
  hoop.add(ring);
  g.add(hoop);
  return g;
}

export function buildSwimmingPool({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.16, ld - 2), mat(0xe6e2d6), { y: 0.09, cast: false }));

  // changing building at the back
  const house = new THREE.Group();
  house.position.set(0, 0, -ld / 2 + 4);
  house.add(mesh(roundedBox(Math.min(lw - 6, 14), 4.4, 6, 0.2), mat(0xf6f3ea), { y: 2.2 }));
  house.add(mesh(box(Math.min(lw - 5, 15), 0.4, 6.8), mat(0x3fa8dd), { y: 4.6 }));
  house.add(mesh(box(3, 2.6, 0.14), mat(P.glass), { y: 1.4, z: 3.02, cast: false }));
  g.add(house);
  facadeSign(g, sign, { w: 6, h: 0.95, y: 3.5, z: -ld / 2 + 7.1, fg: '#2a7fa8' });

  // the pool itself, with lane ropes and a diving board
  const pw = Math.min(lw - 8, 16);
  const pd = Math.min(ld - 12, 10);
  g.add(mesh(box(pw + 2, 0.5, pd + 2), mat(0xdfe6ea), { y: 0.25, z: ld * 0.1, cast: false }));
  const water = mesh(box(pw, 0.42, pd), mat(0x4fbfe0), { y: 0.38, z: ld * 0.1, cast: false });
  g.add(water);
  for (let i = 1; i < 4; i++) {
    g.add(mesh(box(0.14, 0.06, pd), mat(0xffffff), { x: -pw / 2 + (pw / 4) * i, y: 0.6, z: ld * 0.1, cast: false }));
  }
  const board = new THREE.Group();
  board.position.set(-pw / 2 - 1.2, 0, ld * 0.1);
  board.add(mesh(box(0.5, 2.4, 0.5), mat(P.metalDark), { y: 1.2 }));
  board.add(mesh(box(3, 0.18, 1), mat(0xf7f0dc), { x: 1.4, y: 2.4, cast: false }));
  g.add(board);
  for (const sx of [-1, 1]) {
    const chair = mesh(box(0.8, 0.14, 2), mat(0xffd166), { x: sx * (pw / 2 + 2.4), y: 0.6, z: ld * 0.16, cast: false });
    chair.rotation.x = -0.25;
    g.add(chair);
  }
  let splash = 0;
  g.userData.animate = (dt, time) => {
    if (splash > 0) splash = Math.max(0, splash - dt);
    const churn = splash > 0 ? 0.16 * (splash / 3) : 0.03;
    const rate = splash > 0 ? 7 : 1.6;
    water.position.y = 0.38 + Math.sin(time * rate) * churn;
    water.scale.set(1 + churn * 0.4, 1, 1 + churn * 0.4);
  };
  /** Somebody said you can swim here - so somebody does. */
  g.userData.react = () => {
    splash = 3;
  };
  return g;
}

export function buildPlayground({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.16, ld - 2), mat(0xe4d3a8), { y: 0.09, cast: false }));
  g.add(mesh(box(lw - 6, 0.14, ld - 8), mat(0x93d762), { y: 0.16, z: -ld * 0.14, cast: false }));

  // climbing frame
  const frame = new THREE.Group();
  frame.position.set(-lw * 0.2, 0, 0);
  frame.add(mesh(box(3, 0.24, 3), mat(0x4d96ff), { y: 2.6 }));
  for (const [sx, sz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
    frame.add(mesh(box(0.2, 2.6, 0.2), mat(0xe0553f), { x: sx, y: 1.3, z: sz }));
  }
  const slide = mesh(box(1.2, 0.16, 4), mat(0xffd166), { y: 1.5, z: 2.2 });
  slide.rotation.x = 0.6;
  frame.add(slide);
  const ladder = new THREE.Group();
  ladder.position.set(0, 0, -1.6);
  for (let i = 0; i < 5; i++) ladder.add(mesh(box(1.2, 0.12, 0.12), mat(0x6bcb77), { y: 0.4 + i * 0.5, cast: false }));
  frame.add(ladder);
  g.add(frame);

  // swings and a see-saw
  const swing = new THREE.Group();
  swing.name = 'playground-swing-set';
  swing.position.set(lw * 0.2, 0, -ld * 0.04);
  swing.add(mesh(box(0.18, 0.18, 4.2), mat(0xe0553f), { y: 2.6 }));
  for (const sz of [-2, 2]) {
    for (const sx of [-0.9, 0.9]) {
      const leg = mesh(box(0.16, 2.7, 0.16), mat(0xe0553f), { x: sx, y: 1.35, z: sz });
      leg.name = 'playground-swing-support';
      // The feet flare out while the tops meet beneath the crossbar. Reversing
      // these signs makes the pair cross like an X instead of forming an A.
      leg.rotation.z = sx > 0 ? 0.3 : -0.3;
      swing.add(leg);
    }
  }
  const seats = [];
  for (const sz of [-0.9, 0.9]) {
    const s = new THREE.Group();
    s.name = 'playground-swing-chains';
    s.position.set(0, 2.6, sz);
    s.add(mesh(box(0.08, 1.6, 0.08), mat(0x4a5560), { x: -0.32, y: -0.8, cast: false }));
    s.add(mesh(box(0.08, 1.6, 0.08), mat(0x4a5560), { x: 0.32, y: -0.8, cast: false }));
    const seat = mesh(box(0.85, 0.12, 0.4), mat(0x4d96ff), { y: -1.6, cast: false });
    seat.name = 'playground-swing-seat';
    s.add(seat);
    s.userData.phase = rng.range(0, 6.28);
    seats.push({ chains: s, seat });
    swing.add(s);
  }
  g.add(swing);

  const seesaw = new THREE.Group();
  seesaw.position.set(0, 0, ld * 0.24);
  seesaw.add(mesh(box(0.6, 0.9, 0.6), mat(0x9c6b48), { y: 0.45 }));
  const plank = mesh(box(0.7, 0.16, 4.6), mat(0xffd166), { y: 1 });
  seesaw.add(plank);
  g.add(seesaw);

  for (let i = 0; i < 3; i++) {
    const t = makeTree(rng, { scale: 0.85 });
    t.position.set(rng.range(-lw / 2 + 2, lw / 2 - 2), 0.1, rng.range(-ld / 2 + 2, -ld * 0.2));
    g.add(t);
  }
  const bench = makeBench(rng);
  bench.position.set(lw * 0.28, 0.15, ld * 0.3);
  g.add(bench);
  const post = new THREE.Group();
  post.position.set(-lw * 0.36, 0, ld / 2 - 2);
  post.add(mesh(cylinder(0.12, 0.12, 2.4, 6), mat(P.metalDark), { y: 1.2 }));
  const plate = signPlane(sign, 3, 0.7, { bg: '#ffffff', fg: '#3d5a6c' });
  plate.position.set(0, 2.3, 0.07);
  post.add(plate);
  post.add(mesh(box(3.1, 0.8, 0.1), mat(0xffffff), { y: 2.3, cast: false }));
  g.add(post);

  g.userData.animate = (dt, time) => {
    for (const { chains, seat } of seats) {
      const angle = Math.sin(time * 1.8 + chains.userData.phase) * 0.3;
      chains.rotation.x = angle;
      // Let the chains carry the seat along their arc while the freely hanging
      // plank counter-rotates to remain level in world space.
      seat.rotation.x = -angle;
    }
    plank.rotation.x = Math.sin(time * 1.2) * 0.22;
  };
  return g;
}

export function buildBeach({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  // sand in front, sea behind - reads as the coast even inland on the map edge
  g.add(mesh(box(lw - 2, 0.2, ld - 2), mat(0xf0e0b8), { y: 0.1, cast: false }));
  const sea = mesh(box(lw - 2, 0.5, ld * 0.42), mat(0x4fbfe0), { y: 0.2, z: -ld * 0.28, cast: false });
  g.add(sea);
  const foam = mesh(box(lw - 2.4, 0.24, 1.6), mat(0xffffff), { y: 0.34, z: -ld * 0.15, cast: false });
  g.add(foam);

  for (let i = 0; i < 4; i++) {
    const x = -lw * 0.32 + i * (lw * 0.21);
    const z = ld * rng.range(0.02, 0.22);
    const pole = mesh(cylinder(0.09, 0.09, 2.6, 6), mat(P.wood), { x, y: 1.3, z, cast: false });
    g.add(pole);
    const shade = mesh(cylinder(0.05, 1.9, 0.7, 10), mat(rng.pick([0xff6b6b, 0xffd166, 0x4d96ff])), { x, y: 2.7, z });
    g.add(shade);
    const towel = mesh(box(1.4, 0.06, 2.2), mat(rng.pick([0xffffff, 0xffd166, 0x6bcb77])), { x: x + 1.4, y: 0.22, z: z + 0.4, cast: false });
    towel.rotation.y = rng.range(-0.4, 0.4);
    g.add(towel);
  }
  // a couple of palms and a lifeguard hut
  for (let i = 0; i < 3; i++) {
    const palm = new THREE.Group();
    palm.position.set(rng.range(-lw / 2 + 2, lw / 2 - 2), 0, rng.range(ld * 0.22, ld / 2 - 2));
    const trunk = mesh(cylinder(0.22, 0.34, 4.4, 7), mat(0xb98a5a), { y: 2.2 });
    trunk.rotation.z = rng.range(-0.12, 0.12);
    palm.add(trunk);
    for (let k = 0; k < 5; k++) {
      const frond = mesh(box(3.2, 0.14, 0.9), mat(0x5fae4e), { x: 1.4, y: 4.4 });
      frond.rotation.y = (k / 5) * Math.PI * 2;
      frond.rotation.z = -0.35;
      const holder = new THREE.Group();
      holder.rotation.y = (k / 5) * Math.PI * 2;
      holder.add(mesh(box(3.2, 0.14, 0.9), mat(0x5fae4e), { x: 1.5, y: 4.3 }));
      palm.add(holder);
    }
    g.add(palm);
  }
  const hut = new THREE.Group();
  hut.position.set(lw * 0.32, 0, -ld * 0.02);
  hut.add(mesh(box(2.4, 2.6, 2.4), mat(0xf7f0dc), { y: 2.6 }));
  hut.add(mesh(hipRoof(3.2, 1.1, 3.2), mat(0xe0553f), { y: 3.9 }));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    hut.add(mesh(box(0.2, 1.4, 0.2), mat(P.wood), { x: sx, y: 0.7, z: sz }));
  }
  g.add(hut);
  const post = mesh(cylinder(0.12, 0.12, 2.6, 6), mat(P.wood), { x: -lw * 0.34, y: 1.3, z: ld / 2 - 2.5 });
  g.add(post);
  const plate = signPlane(sign, 3.4, 0.8, { bg: '#ffffff', fg: '#2a7fa8' });
  plate.position.set(-lw * 0.34, 2.5, ld / 2 - 2.42);
  g.add(plate);
  g.add(mesh(box(3.5, 0.9, 0.1), mat(0xffffff), { x: -lw * 0.34, y: 2.5, z: ld / 2 - 2.5, cast: false }));

  g.userData.animate = (dt, time) => {
    foam.position.z = -ld * 0.15 + Math.sin(time * 0.9) * 0.7;
    foam.scale.z = 1 + Math.sin(time * 0.9) * 0.25;
  };
  return g;
}

export function buildFarm({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.16, ld - 2), mat(0x9ecf63), { y: 0.09, cast: false }));

  // barn
  const barn = new THREE.Group();
  barn.position.set(-lw * 0.24, 0, -ld * 0.12);
  barn.add(mesh(roundedBox(9, 5, 7, 0.15), mat(0xc0392b), { y: 2.5 }));
  barn.add(mesh(gableRoof(10, 3.2, 7.6), mat(0xf4ece2), { y: 5 }));
  barn.add(mesh(box(3.4, 3.4, 0.16), mat(0x8a6340), { y: 1.7, z: 3.52, cast: false }));
  barn.add(mesh(box(3.6, 0.2, 0.2), mat(0xf4ece2), { y: 3.5, z: 3.6, cast: false }));
  g.add(barn);
  facadeSign(g, sign, { w: 5, h: 0.9, y: 5.4, z: -ld * 0.12 + 3.9, fg: '#8a3324' });

  // crop rows and a greenhouse
  for (let i = 0; i < 4; i++) {
    g.add(mesh(box(lw * 0.44, 0.3, 1.1), mat(0xb08d5a), {
      x: lw * 0.18, y: 0.22, z: -ld * 0.28 + i * 2.4, cast: false,
    }));
    for (let k = 0; k < 7; k++) {
      g.add(mesh(sphere(0.42, 6, 5), mat(0x6bbf5a), {
        x: lw * 0.18 - lw * 0.2 + k * (lw * 0.066), y: 0.55, z: -ld * 0.28 + i * 2.4, cast: false,
      }));
    }
  }
  const silo = new THREE.Group();
  silo.position.set(-lw * 0.4, 0, ld * 0.16);
  silo.add(mesh(cylinder(1.8, 1.8, 8, 14), mat(0xd9d3c4), { y: 4 }));
  silo.add(mesh(sphere(1.8, 14, 8), mat(0x8a929c), { y: 8 }));
  g.add(silo);

  // a few animals in a paddock
  const cows = [];
  const fence = makeFenceRun(lw * 0.4, { height: 1.1, color: 0xb98a5a });
  fence.position.set(lw * 0.15, 0, ld * 0.2);
  g.add(fence);
  const cowSpots = [
    [-lw * 0.15, ld * 0.34, 0],
    [lw * 0.05, ld * 0.38, Math.PI],
    [lw * 0.24, ld * 0.32, 0],
  ];
  for (const [x, z, heading] of cowSpots) {
    const cow = new THREE.Group();
    cow.position.set(x, 0, z);
    cow.add(mesh(roundedBox(2.4, 1.2, 1.2, 0.45), mat(0xf4f0e4), { y: 1.2 }));
    cow.add(mesh(roundedBox(0.9, 0.8, 0.8, 0.25), mat(0x3c3c44), { x: 1.4, y: 1.4 }));
    cow.add(mesh(box(1, 0.5, 1.22), mat(0x3c3c44), { x: -0.3, y: 1.35, cast: false }));
    for (const [sx, sz] of [[-0.7, -0.4], [-0.7, 0.4], [0.7, -0.4], [0.7, 0.4]]) {
      cow.add(mesh(cylinder(0.16, 0.16, 0.9, 6), mat(0xf4f0e4), { x: sx, y: 0.45, z: sz }));
    }
    cow.rotation.y = heading;
    cow.userData.phase = rng.range(0, 6.28);
    cows.push(cow);
    g.add(cow);
  }
  const tractor = makeCar(rng);
  tractor.position.set(-lw * 0.36, 0, ld * 0.32);
  tractor.rotation.y = Math.PI / 2;
  g.add(tractor);

  let busy = 0;
  g.userData.exciteAnimal = () => { busy = 6; };
  g.userData.animate = (dt, time) => {
    if (busy > 0) busy = Math.max(0, busy - dt);
    for (const cow of cows) {
      const lift = busy > 0 ? 0.3 : 0.05;
      cow.position.y = Math.abs(Math.sin(time * (busy > 0 ? 3.6 : 1.1) + cow.userData.phase)) * lift;
    }
  };
  return g;
}

/* ------------------- TRANSPORT, STAY AND HOME ------------------- */

export function buildBusStation({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  g.add(mesh(box(lw - 2, 0.14, ld - 2), mat(0xb9bcc0), { y: 0.09, cast: false }));

  const office = new THREE.Group();
  office.position.set(-lw * 0.22, 0, -ld * 0.2);
  office.add(mesh(roundedBox(9, 4.6, 6, 0.2), mat(0xf4f2ea), { y: 2.3 }));
  office.add(mesh(box(9.8, 0.45, 6.8), mat(0x2f5f9e), { y: 4.8 }));
  office.add(mesh(box(5, 2.8, 0.14), mat(P.glass), { y: 1.6, z: 3.02, cast: false }));
  g.add(office);
  facadeSign(g, sign, { w: 6, h: 0.95, y: 3.9, z: -ld * 0.2 + 3.1, fg: '#2f5f9e' });

  // island platform with a shelter
  g.add(mesh(box(lw * 0.55, 0.35, 4.6), mat(0x2f5f9e), { x: lw * 0.1, y: 3.6, z: ld * 0.16 }));
  for (let i = -2; i <= 2; i++) {
    g.add(mesh(cylinder(0.16, 0.16, 3.6, 8), mat(P.metal), { x: lw * 0.1 + i * (lw * 0.12), y: 1.8, z: ld * 0.16 + 1.9 }));
  }
  g.add(mesh(box(lw * 0.6, 0.35, 5.4), mat(0xe6e2d6), { x: lw * 0.1, y: 0.25, z: ld * 0.16, cast: false }));
  for (const sx of [-1, 1]) {
    const bench = makeBench(rng);
    bench.position.set(lw * 0.1 + sx * 3.4, 0.4, ld * 0.16);
    g.add(bench);
  }
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(0.2, 0.06, 6), mat(0xf0eee4), { x: -lw * 0.3 + i * (lw * 0.3), y: 0.18, z: ld * 0.32, cast: false }));
  }

  const bus = new THREE.Group();
  bus.position.set(lw * 0.05, 0, ld * 0.4);
  bus.add(mesh(roundedBox(9.5, 3, 2.6, 0.5), mat(0xf7f5ef), { y: 1.9 }));
  bus.add(mesh(box(9.6, 0.7, 2.64), mat(0x2f9e6b), { y: 1.2, cast: false }));
  for (const sz of [-1.33, 1.33]) {
    bus.add(mesh(box(7.4, 1.1, 0.06), mat(0x2f4858), { y: 2.5, z: sz, cast: false }));
  }
  for (const sx of [-3.2, 3]) {
    for (const sz of [-1.2, 1.2]) {
      // The bus body runs along X (unlike makeCar, which runs along Z), so the
      // axles lie along Z. Rotating about Z instead would turn the wheels to
      // face along the bus.
      const wheel = mesh(cylinder(0.55, 0.55, 0.34, 8), mat(0x2f3640), { x: sx, y: 0.55, z: sz, cast: false });
      wheel.rotation.x = Math.PI / 2;
      bus.add(wheel);
    }
  }
  bus.rotation.y = 0;
  g.add(bus);
  g.userData.bus = bus;
  g.userData.busHome = bus.position.clone();
  return g;
}

export function buildAirport({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;

  // runway across the back of the lot
  g.add(mesh(box(lw - 2, 0.16, ld * 0.3), mat(0x6f7480), { y: 0.1, z: -ld * 0.28, cast: false }));
  for (let i = 0; i < 7; i++) {
    g.add(mesh(box(2.4, 0.06, 0.4), mat(0xf0eee4), {
      x: -lw * 0.4 + i * (lw * 0.135), y: 0.19, z: -ld * 0.28, cast: false,
    }));
  }
  g.add(mesh(box(lw - 2, 0.14, 2.4), mat(0xb9bcc0), { y: 0.09, z: -ld * 0.09, cast: false }));

  // terminal with a curved roof
  const terminal = new THREE.Group();
  terminal.position.set(0, 0, ld * 0.18);
  terminal.add(mesh(roundedBox(lw * 0.62, 6, 9, 0.4), mat(0xeef2f6), { y: 3 }));
  const roof = new THREE.Mesh(
    new THREE.CylinderGeometry(4.6, 4.6, lw * 0.62, 14, 1, false, 0, Math.PI),
    mat(0x9fb3c8)
  );
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 6;
  terminal.add(roof);
  terminal.add(mesh(box(lw * 0.5, 3.4, 0.16), mat(P.glass), { y: 2, z: 4.52, cast: false }));
  g.add(terminal);
  facadeSign(g, sign, { w: Math.min(lw * 0.4, 10), h: 1.1, y: 5.4, z: ld * 0.18 + 4.6, fg: '#2f5f9e' });

  // control tower
  const tower = new THREE.Group();
  tower.position.set(lw * 0.36, 0, ld * 0.18);
  tower.add(mesh(cylinder(1.1, 1.5, 13, 10), mat(0xe9edf1), { y: 6.5 }));
  tower.add(mesh(cylinder(2.4, 2, 2.6, 10), mat(0x9fb3c8), { y: 14 }));
  const beacon = mesh(sphere(0.4, 8, 6), glow(0xff6b6b, 0.8), { y: 15.6, cast: false });
  tower.add(beacon);
  g.add(tower);

  // a small aircraft on the apron
  const plane = new THREE.Group();
  plane.position.set(-lw * 0.14, 0, -ld * 0.255);
  plane.add(mesh(roundedBox(2.6, 2.6, 12, 1.2), mat(0xf7f9fb), { y: 2.6 }));
  plane.add(mesh(box(13, 0.4, 3), mat(0xe9edf1), { y: 2.6, z: 0.6 }));
  plane.add(mesh(box(5, 0.35, 1.6), mat(0xe9edf1), { y: 3.2, z: -5 }));
  plane.add(mesh(box(0.3, 3, 2.4), mat(0x2f5f9e), { y: 4.4, z: -5.2 }));
  for (const sx of [-3.4, 3.4]) {
    const nacelle = mesh(cylinder(0.8, 0.8, 2.6, 10), mat(0x9fb3c8), { x: sx, y: 2.1, z: 1.4 });
    nacelle.rotation.x = Math.PI / 2;
    plane.add(nacelle);
  }
  for (const [sx, sz] of [[-1, 3], [1, 3], [0, -3]]) {
    plane.add(mesh(cylinder(0.36, 0.36, 1.4, 6), mat(0x2f3640), { x: sx * 1.6, y: 0.7, z: sz }));
  }
  // Keep this compact jet aligned with the X-running apron. At full size its
  // wings cannot clear both the terminal and this small lot, even edge-on.
  plane.scale.setScalar(0.72);
  plane.rotation.y = Math.PI / 2;
  g.add(plane);
  g.userData.plane = plane;
  g.userData.planeHome = plane.position.clone();
  g.userData.planeHeading = plane.rotation.y;

  const windsock = new THREE.Group();
  windsock.position.set(-lw * 0.42, 0, -ld * 0.1);
  windsock.add(mesh(cylinder(0.1, 0.12, 4.4, 6), mat(P.metalDark), { y: 2.2 }));
  const sock = mesh(cylinder(0.55, 0.28, 2, 8), mat(0xff8c42), { y: 4.2, z: 1 });
  sock.rotation.x = Math.PI / 2;
  windsock.add(sock);
  g.add(windsock);

  g.userData.animate = (dt, time) => {
    beacon.material.emissiveIntensity = 0.3 + Math.abs(Math.sin(time * 2.4)) * 0.9;
    sock.rotation.z = Math.sin(time * 0.9) * 0.25;
  };
  return g;
}

export function buildHotel({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const podiumW = Math.min(lw - 7, 14);
  const podiumD = Math.min(ld - 7, 10);
  const podiumH = 4.2;
  const towerW = 9.2;
  const towerD = 7.6;
  const towerH = 14.4;
  const bodyZ = -0.8;
  const front = bodyZ + podiumD / 2;
  const wallMat = mat(0xf6eddc);
  const accentMat = mat(0x8a6340);
  const glassMat = mat(P.glass);

  addBuildingPlinth(g, podiumW, podiumD, { z: bodyZ });
  g.add(mesh(box(podiumW, podiumH, podiumD), wallMat, { y: podiumH / 2, z: bodyZ }));
  addFlatRoofFinish(g, { w: podiumW, d: podiumD, y: podiumH, z: bodyZ, edge: P.cream });
  g.add(mesh(box(towerW, towerH - podiumH, towerD), wallMat, {
    y: podiumH + (towerH - podiumH) / 2, z: bodyZ - 0.7,
  }));
  g.add(mesh(hipRoof(towerW + 0.9, 2.2, towerD + 0.8), accentMat, {
    y: towerH, z: bodyZ - 0.7,
  }));
  addPitchedRoofFinish(g, {
    w: towerW, d: towerD, y: towerH, roofHeight: 2.2, roofMat: accentMat, type: 'hip', z: bodyZ - 0.7,
  });

  // Regular guest-room grids wrap the tall tower on all four sides.
  for (const yy of [5.7, 8.4, 11.1, 13.5]) {
    for (const sx of [-2.8, 0, 2.8]) {
      addFaceWindow(g, { x: sx, y: yy, z: bodyZ + towerD / 2 - 0.68, w: 1.25, h: 1.25, material: glassMat });
      addFaceWindow(g, { x: sx, y: yy, z: bodyZ - towerD / 2 - 0.72, w: 1.25, h: 1.25, material: glassMat });
    }
    for (const sx of [-1, 1]) {
      for (const zz of [-2.35, 0, 2.35]) {
        addSideWindow(g, { x: sx * (towerW / 2 + 0.02), y: yy, z: bodyZ - 0.7 + zz, w: 1.2, h: 1.25, material: glassMat });
      }
    }
  }

  g.add(mesh(box(1.5, 2.7, 0.16), accentMat, {
    y: 1.35, z: front + 0.04, cast: false,
  }));
  for (const sx of [-4.7, 4.7]) {
    addFaceWindow(g, { x: sx, y: 2, z: front + 0.02, w: 2.1, h: 1.45, material: glassMat });
    addFaceWindow(g, { x: sx, y: 2, z: bodyZ - podiumD / 2 - 0.02, w: 2.1, h: 1.35, material: glassMat });
  }
  addSideWindow(g, { x: -podiumW / 2 - 0.02, y: 2, z: bodyZ, w: 2, h: 1.35, material: glassMat });
  g.add(mesh(box(1.1, 2, 0.14), mat(P.metalDark), {
    x: 2.8, y: 1, z: bodyZ - podiumD / 2 - 0.03, cast: false,
  }));
  facadeSign(g, sign, { w: 5.4, h: 0.9, y: 3.45, z: front + 0.08, fg: '#765338' });

  // Porte-cochere and roof fin turn the hotel into the town's unmistakable tall landmark.
  g.add(mesh(box(8, 0.42, 2.5), accentMat, { y: 4.05, z: front + 1.18 }));
  for (const sx of [-3.25, 3.25]) {
    g.add(mesh(cylinder(0.24, 0.24, 4.05, 8), mat(P.metal), {
      x: sx, y: 2.03, z: front + 2.2,
    }));
  }
  // Vertical sign blade on the front corner. This was a free-standing slab held
  // off the wall at mid-tower height, which read as a stray brown panel rather
  // than as part of the building; running it down the corner flush to the wall
  // makes it the tall hotel sign it was meant to be.
  g.add(mesh(box(0.34, 6.2, 1.5), accentMat, {
    x: towerW / 2 + 0.15, y: 9.4, z: bodyZ - 0.7 + towerD / 2 - 1.1, cast: false,
  }));

  const taxi = makeCar(rng);
  const taxiX = Math.min(7.2, lw / 2 - 3.1);
  const taxiZ = Math.min(front + 2.5, ld / 2 - 1.3);
  taxi.position.set(taxiX, 0, taxiZ);
  taxi.rotation.y = Math.PI / 2;
  g.add(taxi);
  addEntranceApproach(g, { front, width: 2.1, depth: 2.1 });
  return g;
}

/**
 * "___'s house" - built from the same house vocabulary as the rest of the town
 * so it belongs on the street, then dressed with the small personal details
 * that make a child point at it: a bike, a mailbox, flowers, a garden tree.
 */
export function buildOwnerHouse({ size, sign, rng }) {
  const g = new THREE.Group();
  const w = 8.5;
  const d = 7.5;
  const h = 6;
  const wall = mat(rng.pick([0xfaf6ec, 0xf3e6cf, 0xc9e6d2, 0xbcd8e8]));
  const roofMat = mat(rng.pick([0x5b86b5, 0xd15b4a, 0x4fa39a]));

  g.add(mesh(box(Math.min(size[0] - 2, w + 6), 0.16, Math.min(size[1] - 2, d + 7)), mat(0x93d762), { y: 0.08, z: 1, cast: false }));
  addBuildingPlinth(g, w, d);
  g.add(mesh(box(w, h, d), wall, { y: h / 2 }));
  g.add(mesh(gableRoof(w + 1.4, 2.4, d + 1.2), roofMat, { y: h }));
  addPitchedRoofFinish(g, { w: w + 0.5, d: d + 0.4, y: h, roofHeight: 2.4, roofMat });
  g.add(mesh(box(1.2, 2.2, 0.16), mat(P.woodDark), { y: 1.1, z: d / 2 + 0.02, cast: false }));
  g.add(mesh(box(2.6, 0.2, 1.4), roofMat, { y: 2.6, z: d / 2 + 0.6 }));
  for (const sx of [-1, 1]) {
    g.add(mesh(box(1.5, 1.3, 0.12), mat(P.glass), { x: sx * 2.6, y: 1.7, z: d / 2 + 0.02, cast: false }));
    g.add(mesh(box(1.5, 1.3, 0.12), mat(P.glass), { x: sx * 2.2, y: 4.4, z: d / 2 + 0.02, cast: false }));
    g.add(mesh(box(1.5, 1.3, 0.12), mat(P.glass), { x: sx * 2.2, y: 4.4, z: -d / 2 - 0.02, cast: false }));
    g.add(mesh(box(0.12, 1.3, 1.5), mat(P.glass), { x: sx * (w / 2 + 0.02), y: 3.4, cast: false }));
  }
  g.add(mesh(box(1, 2.2, 1), mat(0xb0aa9a), { x: -w * 0.3, y: h + 1.6, z: -1 }));

  const bike = makeBicycle(rng);
  bike.position.set(w * 0.44, 0, d / 2 + 1.6);
  bike.rotation.y = 1.2;
  g.add(bike);
  // mailbox with the family name on it
  const gardenFront = size[1] / 2 - 0.5;
  g.add(mesh(cylinder(0.09, 0.09, 1.2, 6), mat(P.woodDark), { x: -w * 0.42, y: 0.6, z: gardenFront, cast: false }));
  g.add(mesh(box(0.7, 0.5, 0.5), mat(0xd34b3f), { x: -w * 0.42, y: 1.35, z: gardenFront, cast: false }));
  const tree = makeTree(rng, { scale: 0.65 });
  tree.position.set(Math.min(w * 0.65, size[0] / 2 - 1), 0, -1.5);
  g.add(tree);
  for (let i = 0; i < 5; i++) {
    g.add(mesh(sphere(0.3, 6, 4), mat(rng.pick([0xff8fa3, 0xffd166, 0xc490e4])), {
      x: -w * 0.2 + i * 1.1, y: 0.35, z: gardenFront, cast: false,
    }));
  }
  // Clear of the porch roof (top 2.7) and below the upper windows (from 3.75).
  const plate = signPlane(sign, 3, 0.6, { bg: 'transparent', fg: '#3d5a6c' });
  plate.position.set(w * 0.2, 3.25, d / 2 + 0.12);
  g.add(plate);
  g.add(mesh(box(3.1, 0.7, 0.08), mat(0xffffff), { x: w * 0.2, y: 3.25, z: d / 2 + 0.04, cast: false }));
  return g;
}

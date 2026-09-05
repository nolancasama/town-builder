import * as THREE from 'three';
import {
  PALETTE as P, mat, glow, roundedBox, box, cylinder, sphere, mesh, signPlane,
} from '../core/materials.js';
import { makeTree, makeBush, makeBench, makeFenceRun, makeCar, makeStreetLamp, gableRoof, hipRoof } from '../world/props.js';
import { WORLD, LANDMARK_LOTS, ROAD_SEGMENTS, ROAD_WIDTH, RAILWAY } from '../config/town.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * PROCEDURAL LANDMARK MODELS
 * --------------------------
 * Stand-ins for real GLB assets - but deliberately *characterful* stand-ins:
 * each one carries the silhouette cues a child needs to recognise the word
 * (a cross for the hospital, floodlights for the stadium, steps and columns for
 * the museum). Swapping in `assets/buildings/<name>.glb` replaces them with no
 * other code change.
 *
 * Conventions every builder follows:
 *   - origin sits on the ground at the centre of the lot
 *   - the entrance faces local +Z
 *   - optional `group.userData.animate(dt, time)` drives any moving parts
 */

/* ---------------------------- shared helpers ---------------------------- */

/** Grid of windows across a facade. Returns one merged-ish group of planes. */
export function windowGrid(group, { w, h, z, cols, rows, y0 = 2.2, stepY = 3, color = P.glass, ww = 1.5, wh = 1.4 }) {
  const m = mat(color);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -w / 2 + (w / (cols + 1)) * (c + 1);
      group.add(mesh(box(ww, wh, 0.14), m, { x, y: y0 + r * stepY, z, cast: false }));
    }
  }
}

export function facadeSign(group, text, { w = 6, h = 0.9, y = 5, z = 0, fg = '#3d5a6c', bg = '#ffffff' } = {}) {
  const backer = mesh(box(w + 0.4, h + 0.35, 0.22), mat(0xffffff), { y, z, cast: false });
  group.add(backer);
  const plate = signPlane(text, w, h, { bg, fg });
  plate.position.set(0, y, z + 0.13);
  group.add(plate);
}

export function steps(group, { w, depth = 2.4, count = 3, z, color = P.concrete }) {
  const m = mat(color);
  for (let i = 0; i < count; i++) {
    const h = 0.22;
    group.add(mesh(box(w - i * 0.5, h * (count - i), depth + i * 0.7), m, {
      y: (h * (count - i)) / 2,
      z: z + i * 0.35,
      cast: false,
    }));
  }
}

/** Flag on a pole - waves via userData.animate. */
export function flagPole(height = 9, color = P.red) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.08, 0.1, height, 6), mat(P.metal), { y: height / 2 }));
  const flagGeo = new THREE.PlaneGeometry(2.4, 1.5, 8, 1);
  const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
  flag.position.set(1.2, height - 1.1, 0);
  g.add(flag);
  const base = flagGeo.attributes.position.array.slice();
  g.userData.animate = (dt, time) => {
    const pos = flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.setZ(i, Math.sin(time * 4 + x * 2.2) * 0.22 * (x + 1.2));
    }
    pos.needsUpdate = true;
  };
  return g;
}

/* ------------------------------- SCHOOL ------------------------------- */

export function buildSchool({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = lw - 4;
  const bodyD = 8;
  const h = 9.5;
  const wall = mat(P.wallCream);
  const trim = mat(P.roofBlue);

  // long three-storey block set at the back of the lot
  const bz = -ld / 2 + bodyD / 2 + 2;
  g.add(mesh(roundedBox(w, h, bodyD, 0.2), wall, { y: h / 2, z: bz }));
  g.add(mesh(box(w + 0.8, 0.5, bodyD + 0.8), trim, { y: h + 0.2, z: bz }));
  for (let i = 0; i < 3; i++) {
    g.add(mesh(box(w - 0.6, 0.22, bodyD + 0.6), trim, { y: 3.05 + i * 3, z: bz, cast: false }));
  }
  windowGrid(g, { w: w - 1.5, h, z: bz + bodyD / 2 + 0.02, cols: 8, rows: 3, y0: 1.9, stepY: 3, ww: 1.7, wh: 1.5 });

  // entrance porch
  const porch = new THREE.Group();
  porch.position.z = bz + bodyD / 2;
  porch.add(mesh(roundedBox(6, 3.6, 3.4, 0.18), mat(P.wallWhite), { y: 1.8, z: 1.7 }));
  porch.add(mesh(box(7, 0.35, 4.2), trim, { y: 3.75, z: 1.8 }));
  porch.add(mesh(box(3.2, 2.6, 0.14), mat(P.glass), { y: 1.3, z: 3.42, cast: false }));
  g.add(porch);

  // clock above the entrance
  const clockFace = mesh(cylinder(1, 1, 0.2, 16), mat(0xffffff), { y: h - 1.4, z: bz + bodyD / 2 + 0.1 });
  clockFace.rotation.x = Math.PI / 2;
  g.add(clockFace);
  g.add(mesh(box(0.1, 0.7, 0.1), mat(0x33414d), { y: h - 1.1, z: bz + bodyD / 2 + 0.22, cast: false }));

  facadeSign(g, sign, { w: 5.5, h: 0.9, y: 5.1, z: bz + bodyD / 2 + 2.9 });

  // schoolyard: leave the compact dirt play area uncluttered. The former flat
  // terracotta ring was too small to read as a running track at town scale.
  const yard = mesh(box(lw - 3, 0.14, ld - bodyD - 6), mat(0xd8c39a), { y: 0.09, z: 3.5, cast: false });
  g.add(yard);

  // fence around the lot with a gate at the front
  const fenceColor = 0x9fb3c8;
  const front = ld / 2 - 0.6;
  for (const [x, len, ry] of [
    [-lw / 2 + 0.6, ld - 1.2, Math.PI / 2],
    [lw / 2 - 0.6, ld - 1.2, Math.PI / 2],
  ]) {
    const f = makeFenceRun(len, { height: 1.5, color: fenceColor });
    f.position.set(x, 0, 0);
    f.rotation.y = ry;
    g.add(f);
  }
  for (const sx of [-1, 1]) {
    const f = makeFenceRun(lw / 2 - 3.5, { height: 1.5, color: fenceColor });
    f.position.set(sx * (lw / 4 + 1.7), 0, front);
    g.add(f);
  }
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.35, 2.6, 0.35), mat(fenceColor), { x: sx * 3, y: 1.3, z: front }));
  }

  const pole = flagPole(9, P.red);
  pole.position.set(-lw / 2 + 4, 0, 4);
  g.add(pole);

  for (let i = 0; i < 3; i++) {
    const t = makeTree(rng, { scale: 0.9 });
    t.position.set(lw / 2 - rng.range(2.5, 4.5), 0, -ld / 2 + 4 + i * 5);
    g.add(t);
  }

  g.userData.animate = (dt, time) => pole.userData.animate(dt, time);
  return g;
}

/* ------------------------------- LIBRARY ------------------------------ */

export function buildLibrary({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = lw - 4;
  const d = ld - 6;
  const h = 8;
  const wall = mat(P.wallSand);
  const trim = mat(P.roofBrown);

  g.add(mesh(roundedBox(w, h, d, 0.22), wall, { y: h / 2, z: -1 }));
  g.add(mesh(box(w + 1.2, 0.6, d + 1.2), trim, { y: h + 0.3, z: -1 }));
  // shallow gable over the entrance bay
  const bay = mesh(roundedBox(w * 0.45, h + 1.2, 2.4, 0.2), mat(P.wallWhite), { y: (h + 1.2) / 2, z: d / 2 - 1 });
  g.add(bay);
  const pediment = mesh(gableRoof(w * 0.5, 1.7, 2.8), trim, { y: h + 1.2, z: d / 2 - 1 });
  pediment.rotation.y = Math.PI / 2;
  pediment.scale.set(2.8 / (w * 0.5), 1, (w * 0.5) / 2.8);
  g.add(pediment);

  // tall reading-room windows
  const glassMat = mat(P.glass);
  const front = d / 2 - 1 + 1.22;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = sx * (w * 0.18 + i * w * 0.16);
      g.add(mesh(box(1.9, 4.6, 0.14), glassMat, { x, y: 4, z: d / 2 - 1 + 0.02, cast: false }));
      g.add(mesh(box(2.2, 0.2, 0.18), trim, { x, y: 6.45, z: d / 2 - 1 + 0.03, cast: false }));
    }
  }
  // entrance doors
  g.add(mesh(box(2.8, 3, 0.16), mat(P.woodDark), { y: 1.5, z: front, cast: false }));
  windowGrid(g, { w: w - 2, h, z: -1 - d / 2 - 0.02, cols: 5, rows: 2, y0: 2.4, stepY: 3.2 });

  facadeSign(g, sign, { w: 5.6, h: 1, y: h + 0.6, z: front - 1.15 });

  // wide steps and a low balustrade
  steps(g, { w: w * 0.55, depth: 2.2, count: 4, z: front - 0.5 });
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.5, 1.1, 3.4), mat(P.concrete), { x: sx * w * 0.3, y: 0.55, z: front + 0.3 }));
    g.add(mesh(sphere(0.42, 8, 6), mat(P.concrete), { x: sx * w * 0.3, y: 1.35, z: front + 0.3 }));
  }

  // a giant book sculpture by the door - a friendly visual cue
  const bookA = mesh(box(2.2, 0.3, 1.5), mat(P.red), { x: -w * 0.38, y: 1.05, z: front + 0.8 });
  bookA.rotation.z = 0.12;
  const bookB = mesh(box(2.2, 0.3, 1.5), mat(P.blue), { x: -w * 0.38, y: 1.35, z: front + 0.8 });
  bookB.rotation.z = -0.1;
  g.add(bookA, bookB);

  for (let i = 0; i < 2; i++) {
    const t = makeTree(rng, { scale: 0.85 });
    t.position.set((i ? 1 : -1) * (lw / 2 - 3), 0, front + 0.2);
    g.add(t);
  }
  const bench = makeBench(rng);
  bench.position.set(w * 0.34, 0, front + 0.8);
  bench.rotation.y = Math.PI;
  g.add(bench);
  return g;
}

/* ------------------------------- HOSPITAL ----------------------------- */

export function buildHospital({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const towerW = lw * 0.5;
  const towerH = 15;
  const wingH = 7;
  const wall = mat(P.wallWhite);
  const accent = mat(0x7fb2d9);

  // tower + lower wing
  g.add(mesh(roundedBox(towerW, towerH, 9, 0.25), wall, { y: towerH / 2, z: -2 }));
  g.add(mesh(box(towerW + 0.9, 0.6, 9.6), accent, { y: towerH + 0.3, z: -2 }));
  g.add(mesh(roundedBox(lw - 4, wingH, 7, 0.2), wall, { x: 0, y: wingH / 2, z: 4 }));
  g.add(mesh(box(lw - 3.4, 0.5, 7.5), accent, { y: wingH + 0.25, z: 4 }));

  // banded windows
  for (let r = 0; r < 4; r++) {
    g.add(mesh(box(towerW - 1.4, 1.6, 0.16), mat(P.glass), { y: 3 + r * 3.2, z: -2 + 4.55, cast: false }));
    g.add(mesh(box(towerW - 1.4, 1.6, 0.16), mat(P.glass), { y: 3 + r * 3.2, z: -2 - 4.55, cast: false }));
  }
  windowGrid(g, { w: lw - 6, h: wingH, z: 7.55, cols: 5, rows: 2, y0: 2.1, stepY: 3 });

  // the unmistakable red cross, on the facade and on the roof
  const crossMat = mat(P.red);
  const crossOnTower = new THREE.Group();
  crossOnTower.add(mesh(box(3.4, 1.1, 0.2), crossMat, { cast: false }));
  crossOnTower.add(mesh(box(1.1, 3.4, 0.2), crossMat, { cast: false }));
  crossOnTower.position.set(0, towerH - 3, 2.62);
  g.add(crossOnTower);
  const roofCross = new THREE.Group();
  roofCross.add(mesh(box(2.6, 0.9, 0.6), crossMat));
  roofCross.add(mesh(box(0.9, 2.6, 0.6), crossMat));
  roofCross.position.set(0, towerH + 1.9, -2);
  g.add(roofCross);

  facadeSign(g, sign, { w: 6, h: 1, y: wingH + 1.2, z: 7.4 });

  // ambulance bay: canopy, marked apron, an ambulance parked under it
  const bayX = lw / 2 - 5;
  const canopy = mesh(box(9, 0.4, 4), mat(P.concrete), { x: bayX, y: 4.4, z: 6.2 });
  g.add(canopy);
  for (const sz of [4.5, 7.9]) {
    g.add(mesh(cylinder(0.24, 0.24, 4.4, 8), mat(P.metalDark), { x: bayX + 3.8, y: 2.2, z: sz }));
  }
  g.add(mesh(box(9, 0.14, 4), mat(0xcfd6dd), { x: bayX, y: 0.09, z: 6.2, cast: false }));
  const ambulance = makeCar(rng);
  ambulance.position.set(bayX, 0, 6);
  ambulance.rotation.y = Math.PI / 2;
  g.add(ambulance);
  g.add(mesh(box(1.6, 0.5, 0.12), crossMat, { x: bayX, y: 5.05, z: 8.15, cast: false }));

  steps(g, { w: 5, depth: 1.8, count: 2, z: 7.2 });
  g.add(mesh(box(3.4, 3, 0.16), mat(P.glass), { y: 1.6, z: 7.58, cast: false }));

  const bush = makeBush(rng, 1.1);
  bush.position.set(-lw / 2 + 3, 0, 8);
  g.add(bush);
  return g;
}

/* --------------------------------- PARK -------------------------------- */

export function buildPark({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;

  // lawn
  g.add(mesh(box(lw - 1, 0.2, ld - 1), mat(0x93d762), { y: 0.12, cast: false }));

  // gravel paths: one along the length, one crossing to the entrance
  const path = mat(0xdcc9a0);
  g.add(mesh(box(lw - 3, 0.1, 2.6), path, { y: 0.23, z: -1, cast: false }));
  g.add(mesh(box(2.6, 0.1, ld - 3), path, { x: -lw * 0.18, y: 0.23, cast: false }));

  // pond with a fountain
  const pondX = lw * 0.24;
  const pondZ = -ld * 0.16;
  const rim = mesh(cylinder(4.3, 4.3, 0.5, 18), mat(P.concrete), { x: pondX, y: 0.25, z: pondZ, cast: false });
  g.add(rim);
  const water = mesh(cylinder(3.8, 3.8, 0.42, 18), mat(P.water), { x: pondX, y: 0.36, z: pondZ, cast: false });
  g.add(water);
  const fountain = new THREE.Group();
  fountain.position.set(pondX, 0.5, pondZ);
  fountain.add(mesh(cylinder(0.9, 1.1, 1.2, 10), mat(P.concreteDark), { y: 0.6 }));
  fountain.add(mesh(cylinder(1.7, 0.2, 0.35, 12), mat(P.concrete), { y: 1.35 }));
  const jet = mesh(cylinder(0.16, 0.34, 2.4, 8), mat(0xdff3fb, { transparent: true, opacity: 0.75 }), { y: 2.6, cast: false });
  fountain.add(jet);
  const ripple = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })
  );
  ripple.rotation.x = -Math.PI / 2;
  ripple.position.y = 0.02;
  fountain.add(ripple);
  g.add(fountain);

  // playground: slide, swings, sandbox
  const playX = -lw * 0.26;
  const playZ = ld * 0.2;
  g.add(mesh(box(7, 0.16, 6), mat(0xe8d9a8), { x: playX, y: 0.2, z: playZ, cast: false }));
  const slide = new THREE.Group();
  slide.position.set(playX, 0, playZ);
  slide.add(mesh(box(1.6, 0.2, 1.6), mat(P.blue), { y: 2.4 }));
  for (const [sx, sz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
    slide.add(mesh(box(0.16, 2.4, 0.16), mat(P.metalDark), { x: sx, y: 1.2, z: sz }));
  }
  const ramp = mesh(box(1.1, 0.14, 3.6), mat(P.yellow), { y: 1.5, z: 1.9 });
  ramp.rotation.x = 0.55;
  slide.add(ramp);
  g.add(slide);

  // greenery, benches, lamps, flower beds
  for (let i = 0; i < 9; i++) {
    const t = makeTree(rng, { scale: rng.range(0.9, 1.3) });
    const tx = rng.range(-lw / 2 + 4, lw / 2 - 4);
    const tz = rng.range(-ld / 2 + 2, ld / 2 - 2);
    if (Math.hypot(tx - pondX, tz - pondZ) < 6 || Math.hypot(tx - playX, tz - playZ) < 6) continue;
    t.position.set(tx, 0.1, tz);
    g.add(t);
  }
  // Benches line the main path and face it. `makeBench(rng)` would randomise
  // the facing, so it is called without one and rotated deliberately.
  const pathNorth = -ld * 0.13;
  const pathSouth = ld * 0.046;
  for (const [bx, bz, ry] of [
    [-lw * 0.34, pathNorth, 0],
    [-lw * 0.054, pathNorth, 0],
    [-lw * 0.018, pathSouth, Math.PI],
    [lw * 0.286, pathSouth, Math.PI],
  ]) {
    const b = makeBench();
    b.position.set(bx, 0.22, bz);
    b.rotation.y = ry;
    g.add(b);
  }
  for (const sx of [-1, 1]) {
    const lamp = makeStreetLamp();
    lamp.position.set(sx * lw * 0.3, 0.2, ld * 0.02);
    g.add(lamp);
  }
  const flowerColors = [0xff8fa3, 0xffd166, 0xc490e4, 0xffffff];
  for (let i = 0; i < 12; i++) {
    const fx = rng.range(-lw / 2 + 2, lw / 2 - 2);
    const fz = rng.range(-ld / 2 + 2, ld / 2 - 2);
    g.add(mesh(sphere(0.34, 6, 4), mat(rng.pick(flowerColors)), { x: fx, y: 0.42, z: fz, cast: false }));
  }

  // entrance arch with the sign
  const arch = new THREE.Group();
  arch.position.z = ld / 2 - 1;
  arch.position.x = -lw * 0.18;
  for (const sx of [-2.4, 2.4]) arch.add(mesh(cylinder(0.22, 0.26, 4, 8), mat(P.woodDark), { x: sx, y: 2 }));
  arch.add(mesh(box(5.6, 0.4, 0.5), mat(P.woodDark), { y: 4.1 }));
  const plate = signPlane(sign, 4.4, 0.8, { bg: 'transparent', fg: '#3d5a6c' });
  plate.position.set(0, 4.1, 0.3);
  arch.add(plate);
  g.add(arch);

  // low hedge boundary
  for (const sx of [-1, 1]) {
    g.add(mesh(box(0.9, 0.9, ld - 2), mat(P.leafDark), { x: sx * (lw / 2 - 0.8), y: 0.55, cast: false }));
  }
  g.add(mesh(box(lw - 2, 0.9, 0.9), mat(P.leafDark), { z: -ld / 2 + 0.8, y: 0.55, cast: false }));

  g.userData.animate = (dt, time) => {
    const s = 1 + Math.sin(time * 3) * 0.08;
    jet.scale.set(s, 1 + Math.sin(time * 2.2) * 0.06, s);
    const k = (time % 2.4) / 2.4;
    ripple.scale.setScalar(0.5 + k * 1.6);
    ripple.material.opacity = 0.45 * (1 - k);
  };
  return g;
}

/* ------------------------------- STATION ------------------------------- */

/**
 * The station sits under an elevated railway - a very familiar shape in Japan,
 * and it also lets the line sail over the streets instead of awkwardly stopping
 * at them. A commuter train arrives, waits at the platform, and departs on a loop.
 *
 * The track runs along local X; pier positions are chosen to clear the roads
 * that the viaduct crosses.
 */
export function buildStation({ size, sign, rng, lot }) {
  const g = new THREE.Group();
  const [, ld] = size;
  // The line follows the station's local X axis. This fixed station faces west,
  // so its local X endpoints map exactly to the north/south terrain edges.
  const authoredLot = lot || LANDMARK_LOTS.find((candidate) => candidate.reservedFor === 'station');
  const stationWorldZ = authoredLot?.pos?.[1] ?? 20;
  const TRACK_START = -WORLD.size / 2 - stationWorldZ;
  const TRACK_END = WORLD.size / 2 - stationWorldZ;
  // The railway is one straight, level line in an authored eastern corridor.
  const DECK_Y = RAILWAY.deckY;
  const TRACK_Z = RAILWAY.trackOffsetZ;
  const DECK_WIDTH = RAILWAY.deckWidth;
  const DECK_THICKNESS = RAILWAY.deckThickness;
  const PIER_Z = RAILWAY.pierOffsetZ;

  // --- viaduct deck + piers ---
  const trackStructure = new THREE.Group();
  trackStructure.name = 'station-track-structure';

  const deckParts = [];
  const barrierParts = [];
  const railParts = [];
  const clearanceSegments = [];
  const addTrackBox = (list, name, x1, x2, h, d, z, yOffset) => {
    const geometry = new THREE.BoxGeometry(x2 - x1, h, d);
    const transform = new THREE.Matrix4().makeTranslation(
      (x1 + x2) / 2, DECK_Y + yOffset, z
    );
    geometry.applyMatrix4(transform);
    geometry.computeBoundingBox();
    clearanceSegments.push({ name, bounds: geometry.boundingBox.clone() });
    list.push(geometry);
  };
  for (let x1 = TRACK_START; x1 < TRACK_END; x1 += 4) {
    const x2 = Math.min(TRACK_END, x1 + 4);
    addTrackBox(deckParts, 'station-track-deck', x1, x2, DECK_THICKNESS, DECK_WIDTH, TRACK_Z, -DECK_THICKNESS / 2);
    for (const side of [-1, 1]) {
      addTrackBox(
        barrierParts, 'station-track-barrier', x1, x2, 0.65, 0.25,
        TRACK_Z + side * (DECK_WIDTH / 2 - 0.125), 0.325
      );
    }
    for (const railZ of [-0.7, 0.7]) {
      addTrackBox(railParts, 'station-track-rail', x1, x2, 0.18, 0.18, TRACK_Z + railZ, 0.27);
    }
  }
  const deck = new THREE.Mesh(mergeGeometries(deckParts, false), mat(P.concrete));
  deck.name = 'station-track-deck';
  deck.castShadow = true;
  deck.receiveShadow = true;
  trackStructure.add(deck);
  const barriers = new THREE.Mesh(mergeGeometries(barrierParts, false), mat(P.concrete));
  barriers.name = 'station-track-barriers';
  barriers.castShadow = false;
  barriers.receiveShadow = true;
  trackStructure.add(barriers);
  const rails = new THREE.Mesh(mergeGeometries(railParts, false), mat(P.metal));
  rails.name = 'station-track-rails';
  rails.castShadow = false;
  rails.receiveShadow = false;
  trackStructure.add(rails);
  [...deckParts, ...barrierParts, ...railParts].forEach((geometry) => geometry.dispose());

  const pierClearOfLotsAndRoads = (lx) => {
    const angle = authoredLot?.rot || 0;
    const worldX = (authoredLot?.pos?.[0] ?? 67) + lx * Math.cos(angle) + PIER_Z * Math.sin(angle);
    const worldZ = stationWorldZ - lx * Math.sin(angle) + PIER_Z * Math.cos(angle);
    for (const candidate of LANDMARK_LOTS) {
      if (candidate.id === authoredLot?.id) continue;
      const dx = worldX - candidate.pos[0];
      const dz = worldZ - candidate.pos[1];
      const c = Math.cos(candidate.rot);
      const s = Math.sin(candidate.rot);
      const localX = c * dx - s * dz;
      const localZ = s * dx + c * dz;
      if (
        Math.abs(localX) < candidate.size[0] / 2 + 1.7
        && Math.abs(localZ) < candidate.size[1] / 2 + 1.7
      ) return false;
    }
    for (const road of ROAD_SEGMENTS) {
      const ax = road.a[0];
      const az = road.a[1];
      const bx = road.b[0];
      const bz = road.b[1];
      const vx = bx - ax;
      const vz = bz - az;
      const lenSq = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((worldX - ax) * vx + (worldZ - az) * vz) / lenSq));
      const distance = Math.hypot(worldX - (ax + vx * t), worldZ - (az + vz * t));
      if (distance < (ROAD_WIDTH[road.w] || ROAD_WIDTH.minor) / 2 + 1.7) return false;
    }
    return true;
  };

  const piers = new THREE.Group();
  piers.name = 'station-track-piers';
  for (let lx = Math.ceil((TRACK_START + 5) / 11) * 11; lx < TRACK_END - 5; lx += 11) {
    if (!pierClearOfLotsAndRoads(lx)) continue;
    const pierHeight = DECK_Y - DECK_THICKNESS;
    const pier = mesh(box(2.2, pierHeight, 1.8), mat(P.concreteDark), {
      x: lx, y: pierHeight / 2, z: PIER_Z,
    });
    pier.name = 'station-track-pier';
    piers.add(pier);
  }
  trackStructure.add(piers);

  // --- rails + sleepers ---
  const sleeperCount = Math.floor((TRACK_END - TRACK_START) / 1.6) + 1;
  const sleepers = new THREE.InstancedMesh(box(0.5, 0.16, 2.9), mat(P.sleeper), sleeperCount);
  sleepers.castShadow = false;
  sleepers.receiveShadow = false;
  const mtx = new THREE.Matrix4();
  const sleeperPosition = new THREE.Vector3();
  const sleeperRotation = new THREE.Quaternion();
  const unitScale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < sleeperCount; i++) {
    const x = Math.min(TRACK_END, TRACK_START + i * 1.6);
    sleeperPosition.set(x, DECK_Y + 0.1, TRACK_Z);
    mtx.compose(sleeperPosition, sleeperRotation, unitScale);
    sleepers.setMatrixAt(i, mtx);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  trackStructure.add(sleepers);
  trackStructure.userData.clearanceSegments = clearanceSegments;
  g.add(trackStructure);

  // --- platform + canopy on the town side of the track ---
  g.add(mesh(box(26, 0.4, 4), mat(0xe3e0d6), { z: 2.4, y: DECK_Y + 0.3, cast: false }));
  g.add(mesh(box(24, 0.35, 5.6), mat(P.roofTeal), { z: 2.4, y: DECK_Y + 4.4 }));
  for (const lx of [-9, -3, 3, 9]) {
    g.add(mesh(cylinder(0.16, 0.16, 3.9, 8), mat(P.metalDark), { x: lx, z: 4.2, y: DECK_Y + 2.3 }));
  }
  g.add(mesh(box(24, 0.06, 0.35), mat(P.yellow), { z: 0.7, y: DECK_Y + 0.52, cast: false }));
  for (const lx of [-7, 7]) {
    const b = makeBench(rng);
    b.position.set(lx, DECK_Y + 0.5, 3.4);
    b.rotation.y = Math.PI;
    g.add(b);
  }

  // --- station house at ground level, entrance facing local +Z ---
  const houseW = 13;
  const houseD = 8;
  const houseH = 5.4;
  const houseZ = ld / 2 - houseD / 2 - 1;
  const house = new THREE.Group();
  house.position.set(-1, 0, houseZ);
  house.add(mesh(roundedBox(houseW, houseH, houseD, 0.2), mat(P.wallCream), { y: houseH / 2 }));
  house.add(mesh(hipRoof(houseW + 1.4, 2, houseD + 1.2), mat(P.roofTeal), { y: houseH }));
  house.add(mesh(box(4.6, 3.2, 0.16), mat(P.glass), { y: 1.7, z: houseD / 2 + 0.02, cast: false }));
  for (const sx of [-1, 1]) {
    house.add(mesh(box(2, 1.6, 0.14), mat(P.glass), { x: sx * 4.4, y: 2.7, z: houseD / 2 + 0.02, cast: false }));
  }
  const clock = mesh(cylinder(0.85, 0.85, 0.22, 14), mat(0xffffff), { y: houseH + 1.2, z: houseD / 2 - 0.6 });
  clock.rotation.x = Math.PI / 2;
  house.add(clock);
  house.add(mesh(box(0.09, 0.6, 0.09), mat(0x33414d), { y: houseH + 1.45, z: houseD / 2 - 0.45, cast: false }));
  g.add(house);
  facadeSign(g, sign, { w: 5.6, h: 0.95, y: houseH - 0.6, z: houseZ + houseD / 2 + 0.05 });

  // A compact enclosed lift/stair core keeps the elevated platform visibly
  // connected to the ground-level concourse without a long staircase spilling
  // across neighbouring streets and lots.
  const accessZ = houseZ - 3.5;
  g.add(mesh(box(4.6, DECK_Y - 0.5, 5.2), mat(P.concrete), {
    x: 8, y: (DECK_Y - 0.5) / 2, z: accessZ,
  }));
  for (let y = 2.4; y < DECK_Y - 1; y += 4.4) {
    g.add(mesh(box(2.2, 1.8, 0.12), mat(P.glass), {
      x: 8, y, z: accessZ + 2.66, cast: false,
    }));
  }
  g.add(mesh(box(5.2, 0.45, 5.8), mat(P.roofTeal), {
    x: 8, y: DECK_Y - 0.25, z: accessZ,
  }));

  // --- the commuter train ---
  const train = new THREE.Group();
  const carLen = 9;
  const bodyMat = mat(0xf2f4f6);
  const stripeMat = mat(0x3fa96b);
  const winMat = mat(0x2f4858);
  for (let c = 0; c < 3; c++) {
    const car = new THREE.Group();
    car.position.x = (c - 1) * (carLen + 0.6);
    car.add(mesh(roundedBox(carLen, 2.7, 2.9, 0.55), bodyMat, { y: 1.55 }));
    car.add(mesh(box(carLen - 0.4, 0.45, 3.02), stripeMat, { y: 1.2, cast: false }));
    for (const sz of [-1.47, 1.47]) {
      car.add(mesh(box(carLen - 2.2, 1, 0.08), winMat, { z: sz, y: 2.1, cast: false }));
    }
    train.add(car);
  }
  train.position.set(0, DECK_Y + 0.45, TRACK_Z);
  g.add(train);

  const RUN_IN = TRACK_START - 16;
  const RUN_OUT = TRACK_END + 16;
  let phase = 'waiting';
  let timer = 3;
  train.position.x = RUN_IN;
  train.visible = false;

  const alignTrainToTrack = () => {
    train.position.y = DECK_Y + 0.4;
    train.rotation.z = 0;
  };
  alignTrainToTrack();

  g.userData.animate = (dt) => {
    if (phase === 'waiting') {
      timer -= dt;
      if (timer <= 0) {
        phase = 'arriving';
        train.position.x = RUN_IN;
        train.visible = true;
      }
    } else if (phase === 'arriving') {
      const remaining = -0.4 - train.position.x;
      train.position.x += Math.max(3, remaining * 1.3) * dt;
      if (train.position.x >= -0.4) {
        train.position.x = -0.4;
        phase = 'stopped';
        timer = 5;
      }
    } else if (phase === 'stopped') {
      timer -= dt;
      if (timer <= 0) phase = 'departing';
    } else {
      train.position.x += Math.min(18, 3 + (train.position.x + 0.4) * 1.2) * dt;
      if (train.position.x > RUN_OUT) {
        phase = 'waiting';
        timer = rng.range(7, 13);
        train.position.x = RUN_IN;
        train.visible = false;
      }
    }
    alignTrainToTrack();
  };

  g.userData.train = train;
  g.userData.deckY = DECK_Y;
  /**
   * Bring the next train in now. The speaking tour uses this rather than
   * spawning a second train - there is only ever one train on this line.
   */
  g.userData.callTrain = () => {
    if (phase === 'waiting') {
      phase = 'arriving';
      train.position.x = RUN_IN;
      train.visible = true;
    } else if (phase === 'stopped') {
      timer = Math.max(timer, 4);
    }
  };
  return g;
}

/* ------------------------------- MUSEUM -------------------------------- */

export function buildMuseum({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = lw - 4;
  const d = ld - 6;
  const h = 9;
  const stone = mat(0xf0ebdd);
  const stoneDark = mat(0xd9d1bd);

  // plinth + main block
  g.add(mesh(box(w + 2.4, 1.2, d + 2.4), stoneDark, { y: 0.6, z: -1, cast: false }));
  g.add(mesh(roundedBox(w, h, d, 0.15), stone, { y: h / 2 + 1.2, z: -1 }));
  g.add(mesh(box(w + 1.6, 0.7, d + 1.6), stoneDark, { y: h + 1.55, z: -1 }));

  // colonnade across the front
  const frontZ = d / 2 - 1 + 1.6;
  const cols = 6;
  for (let i = 0; i < cols; i++) {
    const x = -w / 2 + (w / (cols - 1)) * i;
    g.add(mesh(cylinder(0.62, 0.7, h - 0.6, 12), stone, { x, y: (h - 0.6) / 2 + 1.2, z: frontZ }));
    g.add(mesh(box(1.7, 0.35, 1.7), stoneDark, { x, y: h + 0.75, z: frontZ, cast: false }));
    g.add(mesh(box(1.8, 0.3, 1.8), stoneDark, { x, y: 1.35, z: frontZ, cast: false }));
  }
  // entablature + pediment
  g.add(mesh(box(w + 3, 0.9, 3), stoneDark, { y: h + 1.6, z: frontZ }));
  const ped = mesh(gableRoof(w + 3, 2.6, 3), stone, { y: h + 2.05, z: frontZ });
  g.add(ped);

  // dome
  const dome = mesh(sphere(4.2, 16, 10), mat(P.roofTeal), { y: h + 1.9, z: -1 });
  dome.scale.y = 0.62;
  g.add(dome);
  g.add(mesh(cylinder(4.4, 4.6, 1.1, 16), stoneDark, { y: h + 1.9, z: -1 }));
  g.add(mesh(sphere(0.5, 8, 6), mat(P.yellow), { y: h + 5.1, z: -1, cast: false }));

  facadeSign(g, sign, { w: 6.4, h: 1.05, y: h + 1.6, z: frontZ + 1.6, bg: '#f7f3e8' });
  windowGrid(g, { w: w - 2, h, z: -1 - d / 2 - 0.02, cols: 4, rows: 2, y0: 3.4, stepY: 3.4, color: 0x9fc4d6 });

  // grand steps + banners
  steps(g, { w: w * 0.8, depth: 3, count: 5, z: frontZ - 2, color: 0xe7e0cf });
  for (const sx of [-1, 1]) {
    const pole = mesh(cylinder(0.12, 0.12, 7, 6), mat(P.metalDark), { x: sx * (w / 2 + 1), y: 3.5, z: frontZ + 0.8 });
    g.add(pole);
    const banner = mesh(box(0.1, 3.4, 1.5), mat(sx > 0 ? P.red : P.blue), { x: sx * (w / 2 + 1), y: 4.4, z: frontZ + 1.4, cast: false });
    g.add(banner);
  }
  // a sculpture on the forecourt
  const art = new THREE.Group();
  art.position.set(-w * 0.38, 0, frontZ + 0.8);
  art.add(mesh(box(2, 0.8, 2), stoneDark, { y: 0.4, cast: false }));
  const twist = mesh(box(0.9, 3.4, 0.9), mat(P.orange), { y: 2.4 });
  twist.rotation.y = 0.6;
  twist.rotation.z = 0.18;
  art.add(twist);
  g.add(art);

  const treeSpots = [[w / 2 - 1.8, -4], [w / 2 - 1.4, 0], [w / 2 - 1.8, 4]];
  for (let i = 0; i < treeSpots.length; i++) {
    const t = makeTree(rng, { scale: 0.8, kind: 'tall' });
    t.position.set(treeSpots[i][0], 0, treeSpots[i][1]);
    g.add(t);
  }
  return g;
}

/* ---------------------------- SHOPPING MALL ---------------------------- */

export function buildMall({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const w = lw - 3;
  const d = ld - 6;
  const h = 11;
  const body = mat(0xeef1f4);
  const accent = mat(0xef7d57);

  g.add(mesh(roundedBox(w, h, d, 0.3), body, { y: h / 2, z: -1.5 }));
  g.add(mesh(box(w + 1, 0.8, d + 1), accent, { y: h + 0.4, z: -1.5 }));

  // glass atrium: a barrel vault along the roof
  const vault = new THREE.Mesh(
    new THREE.CylinderGeometry(3.6, 3.6, w * 0.55, 14, 1, false, 0, Math.PI),
    mat(0xbfe4f2, { transparent: true, opacity: 0.85 })
  );
  vault.rotation.z = Math.PI / 2;
  vault.position.set(0, h + 0.7, -1.5);
  g.add(vault);

  // full-height glazed front with mullions
  const frontZ = -1.5 + d / 2;
  g.add(mesh(box(w * 0.8, h - 2.4, 0.3), mat(P.glass), { y: (h - 2.4) / 2 + 0.6, z: frontZ + 0.05, cast: false }));
  for (let i = -3; i <= 3; i++) {
    g.add(mesh(box(0.3, h - 2, 0.45), body, { x: i * (w * 0.11), y: (h - 2) / 2 + 0.6, z: frontZ + 0.12, cast: false }));
  }
  g.add(mesh(box(w * 0.82, 0.4, 0.5), accent, { y: h - 1.9, z: frontZ + 0.14, cast: false }));

  // entrance canopy
  const canopy = mesh(box(w * 0.5, 0.5, 4.4), accent, { y: 5, z: frontZ + 2.2 });
  g.add(canopy);
  for (const sx of [-1, 1]) {
    g.add(mesh(cylinder(0.2, 0.2, 5, 8), mat(P.metalDark), { x: sx * w * 0.22, y: 2.5, z: frontZ + 3.9 }));
  }

  // big vertical sign pylon - malls always shout
  const pylon = new THREE.Group();
  pylon.position.set(w / 2 + 0.5, 0, frontZ + 0.5);
  pylon.add(mesh(box(1.6, 13, 1.2), body, { y: 6.5 }));
  const pylonSign = signPlane('MALL', 1.4, 6, { bg: 'transparent', fg: '#ef7d57' });
  pylonSign.position.set(0, 8, 0.65);
  pylon.add(pylonSign);
  g.add(pylon);

  facadeSign(g, sign, { w: 7.5, h: 1.2, y: h - 1.2, z: frontZ + 0.3, fg: '#ef7d57' });

  // rooftop plant
  for (let i = 0; i < 4; i++) {
    g.add(mesh(box(2.2, 1.2, 2), mat(P.metal), {
      x: -w / 2 + 3 + i * 3.4, y: h + 1.4, z: -1.5 - d / 2 + 2.6,
    }));
  }

  // car park with a few parked cars
  const lotZ = frontZ + 2.9;
  g.add(mesh(box(w, 0.14, 2.8), mat(0x9aa2ab), { y: 0.09, z: lotZ, cast: false }));
  for (let i = 0; i < 5; i++) {
    g.add(mesh(box(0.18, 0.06, 2.2), mat(0xe8e8e0), { x: -w / 2 + 3 + i * 4, y: 0.18, z: lotZ, cast: false }));
  }
  for (let i = 0; i < 3; i++) {
    if (rng.chance(0.25)) continue;
    const car = makeCar(rng);
    car.position.set(-w / 2 + 5 + i * 7, 0, lotZ);
    car.rotation.y = Math.PI / 2;
    g.add(car);
  }
  return g;
}

/* ------------------------------- STADIUM ------------------------------- */

/**
 * The last and biggest reward. An elliptical bowl built from scaled cylinders
 * (cheap, and the ellipse is what makes it read as a stadium rather than a
 * drum), a striped pitch, four floodlight towers and an instanced crowd.
 */
export function buildStadium({ size, sign, rng }) {
  const g = new THREE.Group();
  const [lw, ld] = size;
  const rx = lw / 2 - 2;
  const rz = ld / 2 - 2;

  const concourse = mat(0xe6e0d2);
  const seatMat = mat(0x3f7fbf);
  const seatMat2 = mat(0xe07a4e);

  // outer concourse wall
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 7, 40, 1, true),
    concourse
  );
  wall.material.side = THREE.DoubleSide;
  wall.scale.set(rx, 1, rz);
  wall.position.y = 3.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  g.add(wall);

  // seating bowl: slopes inward as it goes down
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 0.66, 8, 40, 1, true),
    seatMat
  );
  bowl.material.side = THREE.DoubleSide;
  bowl.scale.set(rx * 0.98, 1, rz * 0.98);
  bowl.position.y = 4.4;
  g.add(bowl);
  const bowlLower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.58, 3.4, 40, 1, true), seatMat2);
  bowlLower.material.side = THREE.DoubleSide;
  bowlLower.scale.set(rx * 0.98, 1, rz * 0.98);
  bowlLower.position.y = 1.3;
  g.add(bowlLower);

  // roof lip
  const roof = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.1, 44), mat(0xf5f2e9, { side: THREE.DoubleSide }));
  roof.rotation.x = -Math.PI / 2;
  roof.scale.set(rx, rz, 1);
  roof.position.y = 8.6;
  roof.castShadow = true;
  g.add(roof);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.1, 44, 1, true), mat(0xd9d3c4, { side: THREE.DoubleSide }));
  lip.scale.set(rx, 1, rz);
  lip.position.y = 9.1;
  g.add(lip);

  // pitch: grass ellipse with mown stripes and white markings
  const pitch = new THREE.Mesh(new THREE.CircleGeometry(1, 40), mat(0x4fae4a));
  pitch.rotation.x = -Math.PI / 2;
  pitch.scale.set(rx * 0.62, rz * 0.66, 1);
  pitch.position.y = 0.3;
  pitch.receiveShadow = true;
  g.add(pitch);
  for (let i = -3; i <= 3; i++) {
    const stripe = mesh(box(rx * 0.15, 0.06, rz * 1.2), mat(0x59bd52), { x: i * rx * 0.16, y: 0.34, cast: false });
    stripe.visible = i % 2 === 0;
    g.add(stripe);
  }
  const centre = new THREE.Mesh(new THREE.RingGeometry(1.6, 1.85, 24), mat(0xffffff, { side: THREE.DoubleSide }));
  centre.rotation.x = -Math.PI / 2;
  centre.position.y = 0.38;
  g.add(centre);

  // instanced crowd on the seating deck
  const crowdCount = 420;
  const crowd = new THREE.InstancedMesh(sphere(0.34, 5, 4), new THREE.MeshLambertMaterial({ vertexColors: false }), crowdCount);
  crowd.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(crowdCount * 3), 3);
  crowd.castShadow = false;
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color();
  const crowdSeed = [];
  for (let i = 0; i < crowdCount; i++) {
    const a = (i / crowdCount) * Math.PI * 2 + rng.range(-0.02, 0.02);
    const tier = rng();
    const rr = 0.76 + tier * 0.2;
    const y = 2.2 + tier * 5.4;
    const x = Math.cos(a) * rx * rr;
    const z = Math.sin(a) * rz * rr;
    m4.makeTranslation(x, y, z);
    crowd.setMatrixAt(i, m4);
    col.setHSL(rng(), 0.55, 0.62);
    crowd.setColorAt(i, col);
    crowdSeed.push({ x, y, z, phase: rng.range(0, Math.PI * 2) });
  }
  crowd.instanceMatrix.needsUpdate = true;
  if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
  g.add(crowd);

  // floodlight towers
  const lampLights = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const tower = new THREE.Group();
    tower.position.set(sx * rx * 0.78, 0, sz * rz * 0.82);
    tower.add(mesh(cylinder(0.35, 0.5, 17, 8), mat(P.metalDark), { y: 8.5 }));
    const head = mesh(box(4.4, 2.4, 0.8), mat(P.metal), { y: 17.6 });
    head.lookAt(new THREE.Vector3(0, 6, 0).sub(tower.position));
    tower.add(head);
    const lamps = mesh(box(4.2, 2.2, 0.3), glow(0xfff8d8, 0.85), { y: 17.6, cast: false });
    lamps.rotation.copy(head.rotation);
    lamps.position.copy(head.position);
    lamps.translateZ(0.5);
    tower.add(lamps);
    lampLights.push(lamps);
    g.add(tower);
  }

  // entrance block, ticket booths and the big sign
  const frontZ = rz - 0.65;
  const gate = new THREE.Group();
  gate.position.set(0, 0, frontZ);
  gate.add(mesh(roundedBox(16, 9, 4.5, 0.3), mat(0xf5f2e9), { y: 4.5 }));
  gate.add(mesh(box(17, 0.7, 5.2), mat(0xd9d3c4), { y: 9.2 }));
  for (let i = -2; i <= 2; i++) {
    gate.add(mesh(box(2.2, 4.2, 0.4), mat(0x3f4c5a), { x: i * 3, y: 2.1, z: 2.3, cast: false }));
  }
  g.add(gate);
  facadeSign(g, sign, { w: 11, h: 1.5, y: 7.2, z: frontZ + 2.45, fg: '#28527a' });

  // scoreboard
  const board = new THREE.Group();
  board.position.set(0, 0, -rz + 1.5);
  board.add(mesh(box(1, 12, 1), mat(P.metalDark), { y: 6 }));
  board.add(mesh(box(9, 4.4, 0.8), mat(0x2b3542), { y: 13.4 }));
  board.add(mesh(box(8, 3.4, 0.2), glow(0x86e8ff, 0.5), { y: 13.4, z: 0.5, cast: false }));
  g.add(board);

  let flicker = 0;
  let cheer = 0;
  g.userData.animate = (dt, time) => {
    // the crowd breathes: a slow mexican-wave bob, louder just after a cheer
    if (cheer > 0) cheer = Math.max(0, cheer - dt);
    flicker += dt;
    if (flicker < 0.05) return;
    flicker = 0;
    const lift = 0.16 + (cheer > 0 ? 0.75 * (cheer / 4) : 0);
    const speed = cheer > 0 ? 7 : 3;
    for (let i = 0; i < crowdCount; i += 1) {
      const s = crowdSeed[i];
      const bob = Math.abs(Math.sin(time * speed + s.phase + s.x * 0.08)) * lift;
      m4.makeTranslation(s.x, s.y + bob, s.z);
      crowd.setMatrixAt(i, m4);
    }
    crowd.instanceMatrix.needsUpdate = true;
    const pulse = 0.75 + Math.sin(time * 1.6) * 0.1 + (cheer > 0 ? 0.9 : 0);
    for (const l of lampLights) l.material.emissiveIntensity = pulse;
  };

  /** Said something true about the stadium? The place erupts. */
  g.userData.react = () => {
    cheer = 4;
  };

  g.userData.crowd = crowd;
  return g;
}

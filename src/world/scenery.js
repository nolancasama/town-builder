import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE as P, mat, box, cylinder, mesh, signPlane } from '../core/materials.js';
import { WORLD, LANDMARK_LOTS } from '../config/town.js';
import {
  makeHouse, makeShop, makeTree, makeBush, makeUtilityPole,
  makeStreetLamp, makeVendingMachine, makeFenceRun, makeBicycle,
} from './props.js';

/**
 * Keeps track of ground that is already spoken for, so procedurally placed
 * scenery never lands on a road, a paddy or a landmark lot.
 */
export class Occupancy {
  constructor(graph) {
    this.rects = [];
    this.graph = graph;
  }

  /** Reserve an axis-aligned area (rotation is snapped to the nearest quarter). */
  addRect(x, z, w, d, rot = 0) {
    const swap = Math.abs(Math.round(rot / (Math.PI / 2))) % 2 === 1;
    this.rects.push({ x, z, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 });
  }

  add(x, z, r) {
    this.addRect(x, z, r * 2, r * 2);
  }

  /**
   * Would something of radius r at (x, z) overlap a reserved area, leave the
   * flat ground, or come closer than `roadClearance` to the edge of a road?
   * (Road clearance is absolute, not added to r: buildings are allowed to sit
   * close to a kerb, which is exactly what makes a street frontage look right.)
   */
  blocked(x, z, r, roadClearance = 2) {
    if (Math.hypot(x, z) > WORLD.flatRadius - 2) return true;
    if (this.graph.distanceToRoad(x, z) < roadClearance) return true;
    for (const it of this.rects) {
      const dx = Math.abs(x - it.x) - it.hw;
      const dz = Math.abs(z - it.z) - it.hd;
      if (dx < r && dz < r) {
        if (dx < 0 || dz < 0) return true;
        if (dx * dx + dz * dz < r * r) return true;
      }
    }
    return false;
  }
}

const SHOP_LABELS = ['MARKET', 'BAKERY', 'CAFE', 'RAMEN', 'FLOWERS', 'BOOKS', 'CYCLES', 'POST'];

/**
 * Fills the blocks between the roads with houses, shops, trees and street
 * furniture. Buildings are laid out along road frontages (which is what makes a
 * town read as a town) with random gaps so the grid never feels stamped.
 */
const SIDEWALK = 2.2;

export function createScenery(scene, rng, graph, occ) {
  const group = new THREE.Group();
  group.name = 'scenery';
  const buildings = new THREE.Group();
  const props = new THREE.Group();
  group.add(buildings, props);

  let shopLabel = 0;
  const stats = { attempts: 0, skipped: 0, blockedRoad: 0, blockedRect: 0, placed: 0 };

  for (const e of graph.edges) {
    // space plots evenly along the frontage, keeping clear of the junctions
    const spacing = e.cls === 'main' ? 9 : 8;
    const usable = Math.max(4, e.length - 7);
    const count = Math.max(1, Math.round(usable / spacing));
    for (let i = 0; i < count; i++) {
      const t = 3.5 + usable * ((i + 0.5) / count) + rng.range(-1, 1);

      for (const side of [-1, 1]) {
        stats.attempts++;
        if (rng.chance(e.cls === 'lane' ? 0.3 : 0.1)) { stats.skipped++; continue; } // leave gaps

        const setback = e.width / 2 + SIDEWALK + rng.range(2.6, 4.2);
        const x = e.a.pos.x + e.dir.x * t + e.right.x * side * setback;
        const z = e.a.pos.y + e.dir.y * t + e.right.y * side * setback;
        if (occ.blocked(x, z, 3.4, 2.2)) {
          if (occ.graph.distanceToRoad(x, z) < 2.2) stats.blockedRoad++; else stats.blockedRect++;
          continue;
        }

        // face the road: the building front (+Z) points back toward the centre line
        const facing = Math.atan2(-e.right.x * side, -e.right.y * side);

        const isShopArea = e.cls === 'main' && rng.chance(0.55);
        const b = isShopArea
          ? makeShop(rng, rng.chance(0.7) ? SHOP_LABELS[shopLabel++ % SHOP_LABELS.length] : null)
          : makeHouse(rng);
        b.position.set(x, 0, z);
        b.rotation.y = facing;
        buildings.add(b);
        stats.placed++;
        occ.addRect(x, z, (b.userData.footprint || 7) + 0.8, (b.userData.footprint || 7) + 0.8);

        // garden extras
        if (rng.chance(0.45)) {
          const gx = x + Math.sin(facing + 1.57) * rng.range(3.5, 5);
          const gz = z + Math.cos(facing + 1.57) * rng.range(3.5, 5);
          if (!occ.blocked(gx, gz, 1.4)) {
            props.add(placeAt(makeTree(rng, { scale: 0.85 }), gx, gz));
            occ.add(gx, gz, 1.4);
          }
        }
        if (rng.chance(0.3)) {
          const bx = x + Math.sin(facing) * rng.range(3.2, 4.2);
          const bz = z + Math.cos(facing) * rng.range(3.2, 4.2);
          props.add(placeAt(makeBicycle(rng), bx, bz, rng.range(0, 6.28)));
        }
      }
    }
  }

  // Back-lot infill: the frontage pass alone leaves block interiors hollow, so
  // a scatter pass drops extra houses anywhere that is still free but close
  // enough to a street to be plausible.
  for (let i = 0; i < 260; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng()) * 62;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const toRoad = graph.distanceToRoad(x, z);
    if (toRoad > 15 || toRoad < 2.5) continue;
    if (occ.blocked(x, z, 3.6, 2.5)) continue;
    const b = rng.chance(0.12) ? makeShop(rng) : makeHouse(rng);
    b.position.set(x, 0, z);
    b.rotation.y = rng.range(0, Math.PI * 2);
    buildings.add(b);
    stats.placed++;
    occ.addRect(x, z, (b.userData.footprint || 7) + 0.8, (b.userData.footprint || 7) + 0.8);
    if (rng.chance(0.4)) {
      const t = makeTree(rng, { scale: 0.8 });
      const tx = x + rng.range(-6, 6);
      const tz = z + rng.range(-6, 6);
      if (!occ.blocked(tx, tz, 1.6, 1.6)) {
        props.add(placeAt(t, tx, tz));
        occ.add(tx, tz, 1.6);
      }
    }
  }

  // Street furniture: the odd utility pole, lamps along the busier streets.
  for (const e of graph.edges) {
    const step = e.cls === 'main' ? 22 : 26;
    for (let t = 10; t < e.length - 8; t += step) {
      const side = rng.sign();
      const off = e.width / 2 + SIDEWALK * 0.55;
      const x = e.a.pos.x + e.dir.x * t + e.right.x * side * off;
      const z = e.a.pos.y + e.dir.y * t + e.right.y * side * off;
      if (occ.blocked(x, z, 0.7, 0.1)) continue;
      if (e.cls === 'lane' || rng.chance(0.45)) {
        props.add(placeAt(makeUtilityPole(rng), x, z, rng.range(0, 3.14)));
      } else {
        props.add(placeAt(makeStreetLamp(), x, z, Math.atan2(-e.right.x * side, -e.right.y * side)));
      }
    }
  }

  for (const node of graph.nodes) {
    if (node.edges.length < 3 || rng.chance(0.5)) continue;
    const e = node.edges[0];
    const x = node.pos.x + e.right.x * (e.width / 2 + 2.6) * rng.sign();
    const z = node.pos.y + e.right.y * (e.width / 2 + 2.6) * rng.sign();
    props.add(placeAt(makeVendingMachine(rng), x, z, rng.range(0, 6.28)));
  }

  scene.add(group);
  return { group, buildings, props, stats };
}

function placeAt(obj, x, z, ry = 0) {
  obj.position.set(x, 0, z);
  obj.rotation.y += ry;
  return obj;
}

/* ------------------------------------------------------------------ *
 * Instanced tree scatter
 * ------------------------------------------------------------------ */

/**
 * Hundreds of trees would be hundreds of draw calls, so a few prototype trees
 * are merged per material and then drawn with InstancedMesh. The whole tree
 * population of the map ends up costing about a dozen draw calls, and the sway
 * shader still works because it reads the instance matrix.
 */
export function createTreeScatter(scene, rng, occ, attempts = 420) {
  const group = new THREE.Group();
  group.name = 'trees';

  const protos = [];
  for (let i = 0; i < 6; i++) {
    const proto = makeTree(rng, { scale: 1, kind: i < 3 ? 'round' : i < 5 ? 'pine' : 'tall' });
    proto.updateMatrixWorld(true);
    const byMaterial = new Map();
    proto.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (!byMaterial.has(o.material)) byMaterial.set(o.material, []);
      byMaterial.get(o.material).push(g);
    });
    protos.push(byMaterial);
  }

  // choose positions first so we know how many instances each prototype needs
  const buckets = protos.map(() => []);
  for (let i = 0; i < attempts; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng()) * (WORLD.flatRadius - 4);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (occ.blocked(x, z, 2.2, 2.6)) continue;
    occ.add(x, z, 2.2);
    buckets[rng.int(0, protos.length - 1)].push({
      x, z,
      ry: rng.range(0, Math.PI * 2),
      s: rng.range(0.8, 1.35),
    });
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  protos.forEach((byMaterial, pi) => {
    const spots = buckets[pi];
    if (!spots.length) return;
    byMaterial.forEach((geos, material) => {
      const merged = mergeGeometries(geos);
      const inst = new THREE.InstancedMesh(merged, material, spots.length);
      inst.castShadow = true;
      inst.receiveShadow = false;
      spots.forEach((s, i) => {
        pos.set(s.x, 0, s.z);
        q.setFromAxisAngle(up, s.ry);
        scl.setScalar(s.s);
        m.compose(pos, q, scl);
        inst.setMatrixAt(i, m);
      });
      inst.instanceMatrix.needsUpdate = true;
      group.add(inst);
    });
  });

  scene.add(group);
  return group;
}


/* ------------------------------------------------------------------ *
 * Empty landmark lots
 * ------------------------------------------------------------------ */

/**
 * Dresses every reserved lot as a plausible piece of undeveloped land: a gravel
 * pad, weeds, a low site fence. It reads as "nothing here yet" rather than as a
 * glowing marker, which is what keeps the opening town looking like a town.
 *
 * Each lot also carries a hidden highlight ring the construction sequence pulses.
 */
export function createLotDressings(scene, rng, occ) {
  const dressings = new Map();
  const gravelMat = mat(0xd3c39c);
  const dirtMat = mat(0xc2ab84);

  for (const lot of LANDMARK_LOTS) {
    const [cx, cz] = lot.pos;
    const [w, d] = lot.size;
    const group = new THREE.Group();
    group.name = `lot:${lot.id}`;
    group.position.set(cx, 0, cz);
    group.rotation.y = lot.rot;

    // A couple of scruffy bare patches rather than one big pad - it should read
    // as land nobody has got round to using, not as a marked-out building site.
    const patches = rng.int(2, 3);
    for (let i = 0; i < patches; i++) {
      const pw = rng.range(w * 0.28, w * 0.5);
      const pd = rng.range(d * 0.3, d * 0.55);
      const patch = mesh(box(pw, 0.12, pd), i === 0 ? gravelMat : dirtMat, {
        x: rng.range(-w / 2 + pw / 2, w / 2 - pw / 2),
        y: 0.07,
        z: rng.range(-d / 2 + pd / 2, d / 2 - pd / 2),
        cast: false,
      });
      patch.rotation.y = rng.range(-0.35, 0.35);
      group.add(patch);
    }

    // weeds, and the occasional forgotten object
    const weeds = Math.round((w * d) / 34);
    for (let i = 0; i < weeds; i++) {
      const bush = makeBush(rng, rng.range(0.45, 0.9));
      bush.position.set(rng.range(-w / 2 + 1.5, w / 2 - 1.5), 0.05, rng.range(-d / 2 + 1.5, d / 2 - 1.5));
      group.add(bush);
    }
    if (rng.chance(0.5)) {
      const t = makeTree(rng, { scale: rng.range(0.7, 1) });
      t.position.set(rng.range(-w / 2 + 2, w / 2 - 2), 0, rng.range(-d / 2 + 2, d / 2 - 2));
      group.add(t);
    }
    if (rng.chance(0.45)) {
      const crate = mesh(box(1.3, 1.1, 1.3), mat(P.wood), {
        x: rng.range(-w / 4, w / 4), y: 0.6, z: rng.range(-d / 4, d / 4),
      });
      crate.rotation.y = rng.range(0, 1.5);
      group.add(crate);
    }

    // a short run of site fence along one edge only
    if (rng.chance(0.7)) {
      const alongWidth = rng.chance(0.5);
      const span = (alongWidth ? w : d) * rng.range(0.45, 0.8);
      const fence = makeFenceRun(span, { height: 1.0, color: 0xb9b19c });
      if (alongWidth) {
        fence.position.set(rng.range(-w / 4, w / 4), 0, (rng.chance(0.5) ? -1 : 1) * (d / 2 - 0.7));
      } else {
        fence.position.set((rng.chance(0.5) ? -1 : 1) * (w / 2 - 0.7), 0, rng.range(-d / 4, d / 4));
        fence.rotation.y = Math.PI / 2;
      }
      group.add(fence);
    }

    // hidden highlight ring, pulsed while the building goes up
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(Math.max(w, d) * 0.34, Math.max(w, d) * 0.42, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe08a,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        toneMapped: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.24;
    ring.visible = false;
    group.add(ring);

    scene.add(group);
    occ.addRect(cx, cz, w, d, lot.rot);
    dressings.set(lot.id, { lot, group, ring });
  }

  return dressings;
}

/** Pedestrian-visible entrance marker used when a landmark is finished. */
export function makeEntranceSign(text) {
  const g = new THREE.Group();
  g.add(mesh(cylinder(0.09, 0.09, 2.2, 6), mat(P.metalDark), { y: 1.1 }));
  const plate = signPlane(text, 2.6, 0.62, { bg: '#ffffff', fg: '#3d5a6c' });
  plate.position.set(0, 2.1, 0.06);
  g.add(plate);
  const backer = mesh(box(2.7, 0.7, 0.08), mat(0xffffff), { y: 2.1, cast: false });
  g.add(backer);
  return g;
}

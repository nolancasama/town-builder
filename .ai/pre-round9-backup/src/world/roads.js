import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE as P, mat } from '../core/materials.js';

/**
 * ROADS
 * -----
 * Every road surface, kerb, sidewalk, lane marking and crossing is merged into
 * four meshes (one per material), so the whole street network costs four draw
 * calls no matter how complicated the layout data gets.
 *
 * Layering (top surface heights): carriageway 0.14, kerb 0.30, sidewalk 0.28.
 * Sidewalks are two strips beside the road rather than one pad underneath it,
 * and they stop short of each junction so the crossings stay readable.
 */

export const SIDEWALK_BY_CLASS = { main: 2.6, minor: 2.2, lane: 1.6 };
const ROAD_TOP = 0.14;
const WALK_TOP = 0.28;

function slab(list, w, h, d, x, y, z, angle) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(angle).setPosition(x, y, z));
  list.push(g);
}

function disc(list, radius, h, x, y, z) {
  const g = new THREE.CylinderGeometry(radius, radius, h, 16);
  g.translate(x, y, z);
  list.push(g);
}

function mergeInto(scene, list, material, name, receive = true) {
  if (!list.length) return null;
  const merged = mergeGeometries(list, false);
  list.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = false;
  mesh.receiveShadow = receive;
  mesh.name = name;
  scene.add(mesh);
  return mesh;
}

export function createRoads(scene, graph) {
  const asphalt = [];
  const walk = [];
  const kerb = [];
  const paint = [];

  for (const e of graph.edges) {
    const cx = (e.a.pos.x + e.b.pos.x) / 2;
    const cz = (e.a.pos.y + e.b.pos.y) / 2;
    const angle = Math.atan2(e.dir.x, e.dir.y);
    const len = e.length;
    const w = e.width;

    // carriageway, over-long so junction corners fill in
    slab(asphalt, w, ROAD_TOP + 0.4, len + w, cx, (ROAD_TOP - 0.4) / 2, cz, angle);

    // sidewalk + kerb strips down each side, trimmed back from the junctions
    const SIDEWALK_W = SIDEWALK_BY_CLASS[e.cls] || 2.2;
    const trim = Math.min(len * 0.34, w * 0.75 + 2.5);
    const walkLen = Math.max(2, len - trim * 2);
    for (const side of [-1, 1]) {
      const ox = e.right.x * side;
      const oz = e.right.y * side;
      const walkOff = w / 2 + SIDEWALK_W / 2;
      slab(walk, SIDEWALK_W, WALK_TOP, walkLen, cx + ox * walkOff, WALK_TOP / 2, cz + oz * walkOff, angle);
      const kerbOff = w / 2 + 0.16;
      slab(kerb, 0.32, WALK_TOP + 0.03, walkLen, cx + ox * kerbOff, (WALK_TOP + 0.03) / 2, cz + oz * kerbOff, angle);
    }

    // centre line: dashes on the main roads only
    if (e.cls === 'main') {
      const step = 5;
      const n = Math.floor((len - 8) / step);
      for (let i = 0; i <= n; i++) {
        const t = 4 + i * step;
        slab(
          paint, 0.26, 0.06, 2.4,
          e.a.pos.x + e.dir.x * t, ROAD_TOP + 0.01, e.a.pos.y + e.dir.y * t, angle
        );
      }
    }

    // edge lines
    for (const side of [-1, 1]) {
      const ox = e.right.x * side * (w / 2 - 0.5);
      const oz = e.right.y * side * (w / 2 - 0.5);
      slab(paint, 0.14, 0.06, walkLen, cx + ox, ROAD_TOP + 0.01, cz + oz, angle);
    }
  }

  // Junctions: a disc of asphalt fills the crossing, with zebra stripes on the
  // approaches so pedestrians visibly cross where they should. Keep the fill
  // exactly within the widest carriageway: the previous extra 0.5 units made
  // junctions beside a lot bulge through its perimeter walk.
  for (const node of graph.nodes) {
    const maxW = Math.max(...node.edges.map((e) => e.width));
    disc(asphalt, maxW / 2, ROAD_TOP + 0.4, node.pos.x, (ROAD_TOP - 0.4) / 2, node.pos.y);

    if (node.edges.length >= 3) {
      for (const e of node.edges) {
        if (e.cls === 'lane') continue;
        const away = e.a === node ? 1 : -1;
        const dx = e.dir.x * away;
        const dz = e.dir.y * away;
        const base = maxW / 2 + 1.8;
        for (let s = -1; s <= 1; s++) {
          slab(
            paint, 0.8, 0.06, e.width - 1.4,
            node.pos.x + dx * base + e.right.x * s * 1.5 * away,
            ROAD_TOP + 0.012,
            node.pos.y + dz * base + e.right.y * s * 1.5 * away,
            Math.atan2(dx, dz) + Math.PI / 2
          );
        }
      }
    }
  }

  mergeInto(scene, walk, mat(P.sidewalk), 'sidewalks');
  mergeInto(scene, kerb, mat(P.kerb), 'kerbs');
  mergeInto(scene, asphalt, mat(P.asphalt), 'roads');
  mergeInto(scene, paint, mat(P.asphaltLine), 'road-paint', false);

  return { ROAD_TOP, WALK_TOP };
}

/**
 * Give one developed landmark plot a continuous walk around its building pad,
 * plus a short spur to the configured road-side entrance. Geometry uses the
 * same height and material as road sidewalks. Undeveloped plots deliberately
 * do not call this: they remain visually unclaimed open ground.
 */
export function createLotSidewalk(scene, lot, width = SIDEWALK_BY_CLASS.lane) {
  const walk = [];
  const [w, d] = lot.size;
  const [cx, cz] = lot.pos;
  const angle = lot.rot || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // Transform local slab centres into world space. End strips span the full
  // width; side strips stop at them, avoiding coplanar overlap at corners.
  const localSlab = (sw, sd, lx, lz) => {
    const x = cx + lx * cos + lz * sin;
    const z = cz - lx * sin + lz * cos;
    slab(walk, sw, WALK_TOP, sd, x, WALK_TOP / 2, z, angle);
  };
  localSlab(w, width, 0, d / 2 - width / 2);
  localSlab(w, width, 0, -d / 2 + width / 2);
  localSlab(width, Math.max(0.1, d - width * 2), w / 2 - width / 2, 0);
  localSlab(width, Math.max(0.1, d - width * 2), -w / 2 + width / 2, 0);

  // Meet the road sidewalk at the supplied entrance. Find the rectangular
  // boundary along the centre-to-entrance ray, then bridge only the gap
  // outside the perimeter ring (no overlapping top faces).
  const ex = lot.entrance[0] - cx;
  const ez = lot.entrance[1] - cz;
  const lx = ex * cos - ez * sin;
  const lz = ex * sin + ez * cos;
  const tx = Math.abs(lx) > 1e-5 ? (w / 2) / Math.abs(lx) : Infinity;
  const tz = Math.abs(lz) > 1e-5 ? (d / 2) / Math.abs(lz) : Infinity;
  const t = Math.min(1, tx, tz);
  const bx = cx + (lx * t) * cos + (lz * t) * sin;
  const bz = cz - (lx * t) * sin + (lz * t) * cos;
  const dx = lot.entrance[0] - bx;
  const dz = lot.entrance[1] - bz;
  const len = Math.hypot(dx, dz);
  if (len > 0.05) {
    slab(
      walk, width, WALK_TOP, len,
      bx + dx / 2, WALK_TOP / 2, bz + dz / 2,
      Math.atan2(dx, dz)
    );
  }

  return mergeInto(scene, walk, mat(P.sidewalk), `lot-sidewalk:${lot.id}`);
}

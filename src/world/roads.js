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

/** Distance from a point to a road edge's centreline segment. */
function distanceToEdge(px, pz, e) {
  const ax = e.a.pos.x;
  const az = e.a.pos.y;
  const dx = e.b.pos.x - ax;
  const dz = e.b.pos.y - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
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

function frontagePrism(points, height) {
  const positions = [];
  for (const y of [0, height]) {
    for (const point of points) positions.push(point.x, y, point.z);
  }
  const indices = [
    // bottom, top
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    // vertical sides
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function closestEdgeToEntrance(lot, graph) {
  if (Number.isInteger(lot.frontageRoad) && graph.edges[lot.frontageRoad]) {
    return graph.edges[lot.frontageRoad];
  }
  const [x, z] = lot.entrance;
  let closest = null;
  let closestDistance = Infinity;
  for (const edge of graph.edges) {
    const apX = x - edge.a.pos.x;
    const apZ = z - edge.a.pos.y;
    const t = THREE.MathUtils.clamp(apX * edge.dir.x + apZ * edge.dir.y, 0, edge.length);
    const distance = Math.hypot(
      x - (edge.a.pos.x + edge.dir.x * t),
      z - (edge.a.pos.y + edge.dir.y * t)
    );
    if (distance < closestDistance) {
      closest = edge;
      closestDistance = distance;
    }
  }
  return closest;
}

/**
 * Exact shared geometry for a developed lot's street frontage. The building
 * edge fans into the finite road-side sidewalk strip; the far edge sits on the
 * sidewalk's outer boundary, so equal-height top faces touch but never overlap.
 */
export function lotFrontagePoints(lot, graph) {
  const edge = closestEdgeToEntrance(lot, graph);
  if (!edge) return null;

  const [cx, cz] = lot.pos;
  const [width, depth] = lot.buildSize || lot.size;
  const angle = lot.rot || 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const frontX = sin;
  const frontZ = cos;
  const tangentX = cos;
  const tangentZ = -sin;
  const frontDistance = depth / 2 + (lot.buildingOffset || 0);
  const frontCentre = {
    x: cx + frontX * frontDistance,
    z: cz + frontZ * frontDistance,
  };
  const buildingLeft = {
    x: frontCentre.x - tangentX * width / 2,
    z: frontCentre.z - tangentZ * width / 2,
  };
  const buildingRight = {
    x: frontCentre.x + tangentX * width / 2,
    z: frontCentre.z + tangentZ * width / 2,
  };

  const signedSide = Math.sign(
    (cx - edge.a.pos.x) * edge.right.x + (cz - edge.a.pos.y) * edge.right.y
  ) || 1;
  const normalX = edge.right.x * signedSide;
  const normalZ = edge.right.y * signedSide;
  const sidewalkWidth = SIDEWALK_BY_CLASS[edge.cls] || SIDEWALK_BY_CLASS.minor;
  const outerLateral = edge.width / 2 + sidewalkWidth;
  const rayDotNormal = frontX * normalX + frontZ * normalZ;
  if (Math.abs(rayDotNormal) < 1e-5) return null;

  const trim = Math.min(edge.length * 0.34, edge.width * 0.75 + 2.5);
  const minAlong = trim;
  const maxAlong = edge.length - trim;
  const roadPointFor = (point) => {
    const signedDistance = (point.x - edge.a.pos.x) * normalX
      + (point.z - edge.a.pos.y) * normalZ;
    const rayDistance = (outerLateral - signedDistance) / rayDotNormal;
    const hitX = point.x + frontX * rayDistance;
    const hitZ = point.z + frontZ * rayDistance;
    const along = THREE.MathUtils.clamp(
      (hitX - edge.a.pos.x) * edge.dir.x + (hitZ - edge.a.pos.y) * edge.dir.y,
      minAlong,
      maxAlong
    );
    return {
      x: edge.a.pos.x + edge.dir.x * along + normalX * outerLateral,
      z: edge.a.pos.y + edge.dir.y * along + normalZ * outerLateral,
      along,
    };
  };

  const roadLeft = roadPointFor(buildingLeft);
  const roadRight = roadPointFor(buildingRight);
  const roadAlong = (roadLeft.along + roadRight.along) / 2;
  const roadEdgeCenter = {
    x: edge.a.pos.x + edge.dir.x * roadAlong + normalX * outerLateral,
    z: edge.a.pos.y + edge.dir.y * roadAlong + normalZ * outerLateral,
  };
  const sidewalkLateral = edge.width / 2 + sidewalkWidth / 2;
  const sidewalkCenter = {
    x: edge.a.pos.x + edge.dir.x * roadAlong + normalX * sidewalkLateral,
    z: edge.a.pos.y + edge.dir.y * roadAlong + normalZ * sidewalkLateral,
  };
  const door = {
    x: frontCentre.x + frontX * 0.45,
    z: frontCentre.z + frontZ * 0.45,
  };

  return {
    edge,
    buildingLeft,
    buildingRight,
    roadLeft,
    roadRight,
    roadEdgeCenter,
    sidewalkCenter,
    door,
  };
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

    // Sidewalk + kerb strips down each side, retreating from each junction by
    // enough to clear the widest road meeting there. Trimming by a fraction of
    // this edge's own length (the previous rule) left short edges' walks lying
    // across the crossing carriageway.
    const SIDEWALK_W = SIDEWALK_BY_CLASS[e.cls] || 2.2;
    // Find where each side's walk can actually start and stop. A width-based
    // trim is not enough: at an acute junction the laterally-offset strip stays
    // near the crossing road far along the edge, which is how walks ended up
    // lying across a street. Test the real clearance instead.
    const walkOff = w / 2 + SIDEWALK_W / 2;
    const clearAt = (along, side) => {
      const ox = e.right.x * side;
      const oz = e.right.y * side;
      for (const v of [-0.5, 0, 0.5]) {
        const lat = walkOff + SIDEWALK_W * v;
        const px = e.a.pos.x + e.dir.x * along + ox * lat;
        const pz = e.a.pos.y + e.dir.y * along + oz * lat;
        for (const other of graph.edges) {
          if (other === e) continue;
          if (distanceToEdge(px, pz, other) < other.width / 2 + 0.3) return false;
        }
      }
      return true;
    };

    for (const side of [-1, 1]) {
      const step = 0.25;
      let startAlong = 0;
      while (startAlong < len && !clearAt(startAlong, side)) startAlong += step;
      let endAlong = len;
      while (endAlong > startAlong && !clearAt(endAlong, side)) endAlong -= step;
      const walkLen = endAlong - startAlong;
      // A stub swallowed by its own junctions gets no walk, rather than one
      // laid across the road.
      if (walkLen < 1.5) continue;

      const midAlong = (startAlong + endAlong) / 2;
      const mx = e.a.pos.x + e.dir.x * midAlong;
      const mz = e.a.pos.y + e.dir.y * midAlong;
      const ox = e.right.x * side;
      const oz = e.right.y * side;
      slab(walk, SIDEWALK_W, WALK_TOP, walkLen, mx + ox * walkOff, WALK_TOP / 2, mz + oz * walkOff, angle);
      const kerbOff = w / 2 + 0.16;
      slab(kerb, 0.32, WALK_TOP + 0.03, walkLen, mx + ox * kerbOff, (WALK_TOP + 0.03) / 2, mz + oz * kerbOff, angle);
      // edge line follows the same span so the markings stop where the walk does
      const lx = e.right.x * side * (w / 2 - 0.5);
      const lz = e.right.y * side * (w / 2 - 0.5);
      slab(paint, 0.14, 0.06, walkLen, mx + lx, ROAD_TOP + 0.01, mz + lz, angle);
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

/** Add only the paved building-to-street frontage for a developed landmark. */
export function createLotSidewalk(scene, graph, lot) {
  const points = lotFrontagePoints(lot, graph);
  if (!points) return null;
  const geometry = frontagePrism([
    points.buildingLeft,
    points.buildingRight,
    points.roadRight,
    points.roadLeft,
  ], WALK_TOP);
  const frontage = new THREE.Mesh(geometry, mat(P.sidewalk));
  frontage.name = `lot-frontage:${lot.id}`;
  frontage.castShadow = false;
  frontage.receiveShadow = true;
  scene.add(frontage);
  return frontage;
}

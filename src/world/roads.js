import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE as P, mat } from '../core/materials.js';
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../config/town.js';
import { KERB_POLYGONS, SIDEWALK_SOURCE_HASH, WALK_POLYGONS } from '../config/sidewalks.js';

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
/** Lift for lot aprons so they never share the pavement's exact plane. */
const FRONTAGE_LIFT = 0.006;

function sourceHash() {
  const source = JSON.stringify({ ROAD_SEGMENTS, ROAD_WIDTH });
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < source.length; i++) {
    hash ^= BigInt(source.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

const currentSidewalkSourceHash = sourceHash();
const sidewalkBakeIsStale = currentSidewalkSourceHash !== SIDEWALK_SOURCE_HASH;
if (sidewalkBakeIsStale) {
  console.error(
    `Baked sidewalk data is stale (${SIDEWALK_SOURCE_HASH} != ${currentSidewalkSourceHash}). `
    + 'Run npm run bake:sidewalks and commit src/config/sidewalks.js.'
  );
}

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

function bakedPrisms(polygons, height) {
  const positions = [];
  const indices = [];
  const edgeCounts = new Map();
  const edgeKey = (a, b) => {
    const aKey = `${a[0]},${a[1]}`;
    const bKey = `${b[0]},${b[1]}`;
    return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
  };

  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const key = edgeKey(polygon[i], polygon[(i + 1) % polygon.length]);
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    }
  }

  for (const sourcePolygon of polygons) {
    const polygon = sourcePolygon.slice();
    const contour = polygon.map(([x, z]) => new THREE.Vector2(x, z));
    if (!THREE.ShapeUtils.isClockWise(contour)) {
      polygon.reverse();
      contour.reverse();
    }
    const topStart = positions.length / 3;
    for (const [x, z] of polygon) positions.push(x, height, z);
    for (const face of THREE.ShapeUtils.triangulateShape(contour, [])) {
      let [a, b, c] = face;
      const pa = polygon[a];
      const pb = polygon[b];
      const pc = polygon[c];
      const twiceArea = (pb[0] - pa[0]) * (pc[1] - pa[1])
        - (pb[1] - pa[1]) * (pc[0] - pa[0]);
      if (twiceArea > 0) [b, c] = [c, b];
      indices.push(topStart + a, topStart + b, topStart + c);
    }

    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if ((edgeCounts.get(edgeKey(a, b)) || 0) > 1) continue;
      const wallStart = positions.length / 3;
      positions.push(
        a[0], 0, a[1],
        b[0], 0, b[1],
        b[0], height, b[1],
        a[0], height, a[1]
      );
      indices.push(
        wallStart, wallStart + 1, wallStart + 2,
        wallStart, wallStart + 2, wallStart + 3
      );
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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

  scene.userData.sidewalkBake = {
    sourceHash: SIDEWALK_SOURCE_HASH,
    currentHash: currentSidewalkSourceHash,
    stale: sidewalkBakeIsStale,
  };
  if (sidewalkBakeIsStale) throw new Error('Refusing to draw stale baked sidewalks; run npm run bake:sidewalks.');
  walk.push(bakedPrisms(WALK_POLYGONS, WALK_TOP));
  kerb.push(bakedPrisms(KERB_POLYGONS, WALK_TOP + 0.03));

  for (const e of graph.edges) {
    const cx = (e.a.pos.x + e.b.pos.x) / 2;
    const cz = (e.a.pos.y + e.b.pos.y) / 2;
    const angle = Math.atan2(e.dir.x, e.dir.y);
    const len = e.length;
    const w = e.width;

    // carriageway, over-long so junction corners fill in
    slab(asphalt, w, ROAD_TOP + 0.4, len + w, cx, (ROAD_TOP - 0.4) / 2, cz, angle);

    // The baked pavement owns the junction geometry. Road-edge paint retains a
    // small deterministic junction margin without reintroducing a solver.
    const startTrim = Math.max(...e.a.edges.map((edge) => edge.width)) / 2 + 0.3;
    const endTrim = Math.max(...e.b.edges.map((edge) => edge.width)) / 2 + 0.3;
    const edgeLineLength = Math.max(0, len - startTrim - endTrim);
    for (const side of [-1, 1]) {
      if (edgeLineLength < 1.5) continue;
      const midAlong = startTrim + edgeLineLength / 2;
      const mx = e.a.pos.x + e.dir.x * midAlong;
      const mz = e.a.pos.y + e.dir.y * midAlong;
      const lx = e.right.x * side * (w / 2 - 0.5);
      const lz = e.right.y * side * (w / 2 - 0.5);
      slab(paint, 0.14, 0.06, edgeLineLength, mx + lx, ROAD_TOP + 0.01, mz + lz, angle);
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
  // The baked pavement now runs all the way to the kerb line, so a frontage
  // laid at exactly WALK_TOP shares its plane and z-fights against it - on
  // some lots across the whole apron. Sit the apron a hair proud instead: it
  // is the same material, so the lip is invisible, and the depth tie is gone.
  const geometry = frontagePrism([
    points.buildingLeft,
    points.buildingRight,
    points.roadRight,
    points.roadLeft,
  ], WALK_TOP + FRONTAGE_LIFT);
  const frontage = new THREE.Mesh(geometry, mat(P.sidewalk));
  frontage.name = `lot-frontage:${lot.id}`;
  frontage.castShadow = false;
  frontage.receiveShadow = true;
  scene.add(frontage);
  return frontage;
}

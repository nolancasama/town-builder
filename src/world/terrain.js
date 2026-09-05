import * as THREE from 'three';
import { PALETTE as P, mat, box, mesh } from '../core/materials.js';
import { WORLD, PADDY_FIELDS, CHANNELS } from '../config/town.js';
import { RICE_MAT } from './props.js';
import { SIDEWALK_BY_CLASS } from './roads.js';

/**
 * TERRAIN
 * -------
 * A single vertex-coloured ground mesh (one draw call) with gentle hills that
 * only start outside the town, so every road and building sits perfectly flat.
 * Colour variation comes from cheap value noise rather than textures - it keeps
 * the load instant and looks like a painted diorama.
 */

function hash2(x, y) {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x, y) {
  return valueNoise(x, y) * 0.6 + valueNoise(x * 2.3, y * 2.3) * 0.3 + valueNoise(x * 5.1, y * 5.1) * 0.1;
}

export function createTerrain(scene) {
  const size = WORLD.size;
  const segs = 140;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cGrass = new THREE.Color(P.grass);
  const cDark = new THREE.Color(P.grassDark);
  const cPale = new THREE.Color(P.grassPale);
  const cDirt = new THREE.Color(P.dirt);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);

    // Hills only beyond the fields; perfectly flat where the town is, so every
    // road and building sits dead level without any terrain conforming.
    const outside = THREE.MathUtils.smoothstep(r, WORLD.flatRadius, WORLD.hillRadius);
    const h = (fbm(x * 0.03 + 10, z * 0.03 + 10) - 0.45) * 16 * outside;
    pos.setY(i, h);

    const n = fbm(x * 0.09, z * 0.09);
    tmp.copy(cGrass).lerp(cDark, THREE.MathUtils.smoothstep(n, 0.42, 0.75));
    tmp.lerp(cPale, THREE.MathUtils.smoothstep(1 - n, 0.55, 0.95) * 0.5);
    // dusty patches near the middle of blocks
    const dust = fbm(x * 0.16 + 40, z * 0.16 + 40);
    if (dust > 0.72) tmp.lerp(cDirt, (dust - 0.72) * 1.4);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  return ground;
}

/* ------------------------------------------------------------------ *
 * Rice paddies
 * ------------------------------------------------------------------ */

function pointToRectDistanceSq(x, z, minX, maxX, minZ, maxZ) {
  const dx = x < minX ? minX - x : (x > maxX ? x - maxX : 0);
  const dz = z < minZ ? minZ - z : (z > maxZ ? z - maxZ : 0);
  return dx * dx + dz * dz;
}

function pointToSegmentDistanceSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0
    ? THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / lengthSq, 0, 1)
    : 0;
  const sx = ax + dx * t;
  const sz = az + dz * t;
  return (x - sx) ** 2 + (z - sz) ** 2;
}

/** Exact squared distance between a finite road centre-line and an AABB. */
function segmentToRectDistanceSq(ax, az, bx, bz, minX, maxX, minZ, maxZ) {
  const dx = bx - ax;
  const dz = bz - az;
  let lo = 0;
  let hi = 1;

  // A slab intersection means the segment passes through the rectangle.
  for (const [p, v, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
    if (Math.abs(v) < 1e-10) {
      if (p < min || p > max) {
        lo = 1;
        hi = 0;
        break;
      }
      continue;
    }
    let t0 = (min - p) / v;
    let t1 = (max - p) / v;
    if (t0 > t1) [t0, t1] = [t1, t0];
    lo = Math.max(lo, t0);
    hi = Math.min(hi, t1);
  }
  if (lo <= hi) return 0;

  // With no intersection, the closest pair contains either a segment endpoint
  // or a rectangle corner. Cover both cases so diagonal corner clearance is
  // measured exactly rather than sampled.
  return Math.min(
    pointToRectDistanceSq(ax, az, minX, maxX, minZ, maxZ),
    pointToRectDistanceSq(bx, bz, minX, maxX, minZ, maxZ),
    pointToSegmentDistanceSq(minX, minZ, ax, az, bx, bz),
    pointToSegmentDistanceSq(maxX, minZ, ax, az, bx, bz),
    pointToSegmentDistanceSq(maxX, maxZ, ax, az, bx, bz),
    pointToSegmentDistanceSq(minX, maxZ, ax, az, bx, bz)
  );
}

/** Test the complete paddy footprint, including its outer bunds. */
export function paddyPlotBlocked(occupancy, x, z, w, d) {
  if (!occupancy) return false;
  const minX = x - w / 2;
  const maxX = x + w / 2;
  const minZ = z - d / 2;
  const maxZ = z + d / 2;

  // All four corners must remain on the authored flat terrain.
  const flatLimit = WORLD.flatRadius - 2;
  if ([[minX, minZ], [maxX, minZ], [maxX, maxZ], [minX, maxZ]]
    .some(([cx, cz]) => Math.hypot(cx, cz) > flatLimit)) return true;

  // Road surfaces are finite centre-line segments widened by their
  // carriageway and class-specific sidewalk. A rectangle/capsule distance
  // test catches diagonal corner strikes that the former centre-circle missed.
  for (const edge of occupancy.graph?.edges || []) {
    const sidewalk = SIDEWALK_BY_CLASS[edge.cls] || SIDEWALK_BY_CLASS.minor;
    const surfaceRadius = edge.width / 2 + sidewalk;
    const distanceSq = segmentToRectDistanceSq(
      edge.a.pos.x, edge.a.pos.y, edge.b.pos.x, edge.b.pos.y,
      minX, maxX, minZ, maxZ
    );
    if (distanceSq <= surfaceRadius * surfaceRadius + 1e-8) return true;
  }

  // Paddy cells and the existing reservations are axis-aligned at this stage.
  for (const reserved of occupancy.rects || []) {
    if (maxX > reserved.x - reserved.hw && minX < reserved.x + reserved.hw
      && maxZ > reserved.z - reserved.hd && minZ < reserved.z + reserved.hd) return true;
  }
  return false;
}

/**
 * Paddies are a water slab, a raised earth bund, and one instanced mesh of rice
 * shoots per field. The shoots use the shared sway material, so the whole
 * countryside ripples for the cost of a single uniform update.
 */
export function createPaddies(scene, rng, occupancy) {
  const group = new THREE.Group();
  group.name = 'paddies';
  // Keep the committed plot footprints available for deterministic QA. These
  // are the plots that actually rendered, not the nominal field rectangles.
  group.userData.plotRects = [];
  const waterMat = mat(P.paddyWater);
  const bundMat = mat(P.paddyMud);
  let riceCount = 0;
  const riceTransforms = [];
  const committedPlots = [];

  // Decide the complete patchwork against the pre-paddy occupancy snapshot.
  // Reserving as we iterate would make one paddy cell accidentally suppress
  // an adjacent cell in the same authored field.
  for (const field of PADDY_FIELDS) {
    const [cx, cz] = field.pos;
    const [w, d] = field.size;
    // sub-divide each field into a few paddy plots for a patchwork look
    const cols = Math.max(1, Math.round(w / 11));
    const rows = Math.max(1, Math.round(d / 11));
    const pw = w / cols;
    const pd = d / rows;

    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const px = cx - w / 2 + pw * (c + 0.5);
        const pz = cz - d / 2 + pd * (r + 0.5);
        if (paddyPlotBlocked(occupancy, px, pz, pw, pd)) continue;
        committedPlots.push({ x: px, z: pz, w: pw, d: pd });
      }
    }
  }

  for (const plot of committedPlots) {
    const { x: px, z: pz, w: pw, d: pd } = plot;
    const iw = pw - 1.2;
    const id = pd - 1.2;
    group.add(mesh(box(iw, 0.3, id), waterMat, { x: px, y: 0.02, z: pz, cast: false }));
    // bund
    group.add(mesh(box(pw, 0.42, 0.9), bundMat, { x: px, y: 0.16, z: pz - pd / 2, cast: false }));
    group.add(mesh(box(pw, 0.42, 0.9), bundMat, { x: px, y: 0.16, z: pz + pd / 2, cast: false }));
    group.add(mesh(box(0.9, 0.42, pd), bundMat, { x: px - pw / 2, y: 0.16, z: pz, cast: false }));
    group.add(mesh(box(0.9, 0.42, pd), bundMat, { x: px + pw / 2, y: 0.16, z: pz, cast: false }));

    // Reserve only this committed patchwork cell. Later scenery and tree
    // passes can still use any field cell skipped above because of a road
    // or landmark lot.
    occupancy?.addRect(px, pz, pw, pd);
    group.userData.plotRects.push(plot);

    // rice shoots in rows
    const stepX = 1.35;
    const stepZ = 1.35;
    for (let x = -iw / 2 + 0.7; x < iw / 2 - 0.4; x += stepX) {
      for (let z = -id / 2 + 0.7; z < id / 2 - 0.4; z += stepZ) {
        riceTransforms.push([px + x + rng.range(-0.15, 0.15), pz + z + rng.range(-0.15, 0.15), rng.range(0.7, 1.15)]);
        riceCount++;
      }
    }
  }

  if (riceCount) {
    const shoot = new THREE.BoxGeometry(0.16, 0.9, 0.16);
    shoot.translate(0, 0.45, 0);
    const inst = new THREE.InstancedMesh(shoot, RICE_MAT, riceCount);
    inst.castShadow = false;
    inst.receiveShadow = false;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    riceTransforms.forEach(([x, z, sc], i) => {
      p.set(x, 0.12, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i % 7) * 0.4);
      s.set(1, sc, 1);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  scene.add(group);
  return group;
}

/** Narrow concrete drainage channels beside the paddies. */
export function createChannels(scene) {
  const g = new THREE.Group();
  g.name = 'channels';
  for (const c of CHANNELS) {
    const dx = c.b[0] - c.a[0];
    const dz = c.b[1] - c.a[1];
    const len = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    const cx = (c.a[0] + c.b[0]) / 2;
    const cz = (c.a[1] + c.b[1]) / 2;
    g.add(mesh(box(1.9, 0.3, len), mat(P.concreteDark), { x: cx, y: 0.06, z: cz, ry: angle, cast: false }));
    g.add(mesh(box(1.15, 0.3, len), mat(P.water), { x: cx, y: 0.14, z: cz, ry: angle, cast: false }));
  }
  scene.add(g);
  return g;
}

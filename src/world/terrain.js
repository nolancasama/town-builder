import * as THREE from 'three';
import { PALETTE as P, mat, box, mesh } from '../core/materials.js';
import { WORLD, PADDY_FIELDS, CHANNELS } from '../config/town.js';
import { RICE_MAT } from './props.js';

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

/**
 * Paddies are a water slab, a raised earth bund, and one instanced mesh of rice
 * shoots per field. The shoots use the shared sway material, so the whole
 * countryside ripples for the cost of a single uniform update.
 */
export function createPaddies(scene, rng, isBlocked) {
  const group = new THREE.Group();
  group.name = 'paddies';
  const waterMat = mat(P.paddyWater);
  const bundMat = mat(P.paddyMud);
  let riceCount = 0;
  const riceTransforms = [];

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
        if (isBlocked && isBlocked(px, pz, Math.max(pw, pd) * 0.45)) continue;

        const iw = pw - 1.2;
        const id = pd - 1.2;
        group.add(mesh(box(iw, 0.3, id), waterMat, { x: px, y: 0.02, z: pz, cast: false }));
        // bund
        group.add(mesh(box(pw, 0.42, 0.9), bundMat, { x: px, y: 0.16, z: pz - pd / 2, cast: false }));
        group.add(mesh(box(pw, 0.42, 0.9), bundMat, { x: px, y: 0.16, z: pz + pd / 2, cast: false }));
        group.add(mesh(box(0.9, 0.42, pd), bundMat, { x: px - pw / 2, y: 0.16, z: pz, cast: false }));
        group.add(mesh(box(0.9, 0.42, pd), bundMat, { x: px + pw / 2, y: 0.16, z: pz, cast: false }));

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

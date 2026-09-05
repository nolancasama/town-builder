import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Shared material + geometry library.
 *
 * Every material in the town comes from here so the palette stays cohesive and
 * the renderer can batch aggressively (shared materials => fewer state changes,
 * which matters a lot on school Chromebooks).
 */

export const PALETTE = {
  grass: 0x8fd05a,
  grassDark: 0x74b849,
  grassPale: 0xa9dd77,
  dirt: 0xc8a97a,
  paddyWater: 0x86b6a4,
  paddyMud: 0x6f8f7c,
  rice: 0x9ed36a,
  asphalt: 0x7d838d,
  asphaltLine: 0xf3f0e4,
  sidewalk: 0xdedac9,
  kerb: 0xc4c0b2,
  water: 0x7fc4d8,
  wallWhite: 0xfaf6ec,
  wallCream: 0xf3e6cf,
  wallSand: 0xe8d2a9,
  wallBlue: 0xbcd8e8,
  wallPink: 0xf3cfcf,
  wallMint: 0xc9e6d2,
  roofRed: 0xd15b4a,
  roofBlue: 0x5b86b5,
  roofGrey: 0x7a8391,
  roofTeal: 0x4fa39a,
  roofBrown: 0x9c6b48,
  wood: 0xb98a5a,
  woodDark: 0x8a6340,
  trunk: 0x9a6b45,
  leaf: 0x5fae4e,
  leafDark: 0x4b9440,
  leafLight: 0x86c95f,
  glass: 0xa8d8ea,
  metal: 0xb9c0c8,
  metalDark: 0x8a929c,
  red: 0xe05c4b,
  orange: 0xf4a259,
  yellow: 0xffd166,
  blue: 0x4a90d9,
  navy: 0x39557a,
  green: 0x57c07b,
  purple: 0x9b7ede,
  cream: 0xfff3dc,
  concrete: 0xdcd8ce,
  concreteDark: 0xb9b5aa,
  track: 0x8b8577,
  sleeper: 0x7a6a58,
};

const cache = new Map();

/**
 * Get (or create) a shared MeshLambertMaterial.
 * Lambert is deliberate: it is dramatically cheaper than Standard on integrated
 * GPUs and, with a hemisphere + directional light, reads as a soft toy-town look.
 */
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, ...opts });
    cache.set(key, m);
  }
  return m;
}

/** Emissive material for lit windows / signs / lamps. */
export function glow(color, intensity = 0.6) {
  return mat(color, { emissive: color, emissiveIntensity: intensity });
}

const geoCache = new Map();

/** Shared rounded box - the workhorse shape for the whole toy-town look. */
export function roundedBox(w, h, d, radius = 0.18, segments = 2) {
  const r = Math.min(radius, w / 2.02, h / 2.02, d / 2.02);
  const key = `rb|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}|${segments}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, r);
    geoCache.set(key, g);
  }
  return g;
}

export function box(w, h, d) {
  const key = `b|${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(key, g);
  }
  return g;
}

export function cylinder(rTop, rBottom, h, seg = 10) {
  const key = `c|${rTop}|${rBottom}|${h}|${seg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBottom, h, seg);
    geoCache.set(key, g);
  }
  return g;
}

export function sphere(r, wSeg = 10, hSeg = 8) {
  const key = `s|${r}|${wSeg}|${hSeg}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.SphereGeometry(r, wSeg, hSeg);
    geoCache.set(key, g);
  }
  return g;
}

/** Convenience: build a mesh with sensible shadow defaults. */
export function mesh(geometry, material, { x = 0, y = 0, z = 0, ry = 0, cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/* ------------------------------------------------------------------ *
 * Canvas text signage
 * ------------------------------------------------------------------ */

const signCache = new Map();

/**
 * Make a readable sign plane (e.g. "LIBRARY"). Canvas textures are cheap,
 * need no font files, and stay crisp on the small building faces.
 */
export function signTexture(text, { bg = '#ffffff', fg = '#26333f', width = 512, height = 128, font = 800 } = {}) {
  const key = `${text}|${bg}|${fg}|${width}|${height}`;
  if (signCache.has(key)) return signCache.get(key);

  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (bg !== 'transparent') {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.clearRect(0, 0, width, height);
  }
  let size = Math.floor(height * 0.55);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fam = '"Nunito","Segoe UI",system-ui,sans-serif';
  ctx.font = `${font} ${size}px ${fam}`;
  while (ctx.measureText(text).width > width * 0.88 && size > 10) {
    size -= 2;
    ctx.font = `${font} ${size}px ${fam}`;
  }
  ctx.fillStyle = fg;
  ctx.fillText(text, width / 2, height / 2 + size * 0.03);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  signCache.set(key, tex);
  return tex;
}

/** A flat sign panel, ready to be positioned on a facade. */
export function signPlane(text, w, h, opts = {}) {
  const tex = signTexture(text, opts);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, transparent: opts.bg === 'transparent', toneMapped: false })
  );
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/* ------------------------------------------------------------------ *
 * Wind sway
 * ------------------------------------------------------------------ */

const swayMaterials = [];

/**
 * Injects a tiny vertex-shader wobble so foliage and rice never look frozen.
 * Works on instanced meshes too (phase comes from the instance world position),
 * and costs essentially nothing on the CPU.
 */
export function makeSwayMaterial(color, { amount = 0.13, speed = 1.4, base = 0 } = {}) {
  const m = new THREE.MeshLambertMaterial({ color });
  m.userData.sway = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uSwayAmount = { value: amount };
    shader.uniforms.uSwaySpeed = { value: speed };
    shader.uniforms.uSwayBase = { value: base };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform float uSwayAmount;
         uniform float uSwaySpeed;
         uniform float uSwayBase;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         #ifdef USE_INSTANCING
           vec3 swayOrigin = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
         #else
           vec3 swayOrigin = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
         #endif
         float swayPhase = swayOrigin.x * 0.35 + swayOrigin.z * 0.27;
         float swayH = max(transformed.y - uSwayBase, 0.0);
         float swayAngle = sin(uTime * uSwaySpeed + swayPhase) + 0.4 * sin(uTime * uSwaySpeed * 1.9 + swayPhase * 1.7);
         transformed.x += swayAngle * uSwayAmount * swayH;
         transformed.z += cos(uTime * uSwaySpeed * 0.8 + swayPhase) * uSwayAmount * 0.5 * swayH;`
      );
    m.userData.shader = shader;
  };
  swayMaterials.push(m);
  return m;
}

export function updateSway(time) {
  for (const m of swayMaterials) {
    const s = m.userData.shader;
    if (s) s.uniforms.uTime.value = time;
  }
}

export function disposeSway() {
  swayMaterials.length = 0;
}

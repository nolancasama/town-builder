import * as THREE from 'three';
import { mat, sphere, mesh } from '../core/materials.js';

/**
 * SKY, CLOUDS AND BIRDS
 * Cheap atmosphere: one shader dome, a handful of cloud clusters that drift,
 * and occasional birds. Nothing here casts shadows or writes depth-heavy work.
 */

const SKY_TOP = new THREE.Color(0x5fb4e8);
const SKY_MID = new THREE.Color(0xa8dcf0);
const SKY_BOTTOM = new THREE.Color(0xf3f0dc);

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(400, 24, 16);
  const mat2 = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY_TOP },
      mid: { value: SKY_MID },
      bottom: { value: SKY_BOTTOM },
    },
    vertexShader: `
      varying float vH;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vH = normalize(world.xyz).y;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      varying float vH;
      void main() {
        float h = clamp(vH, -1.0, 1.0);
        vec3 c = h > 0.12
          ? mix(mid, top, smoothstep(0.12, 0.75, h))
          : mix(bottom, mid, smoothstep(-0.25, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(geo, mat2);
  dome.frustumCulled = false;
  scene.add(dome);
  return dome;
}

/** Puffy cloud clusters that drift slowly across the map and wrap around. */
export function createClouds(scene, rng, count = 9) {
  const group = new THREE.Group();
  group.name = 'clouds';
  const cloudMat = mat(0xffffff, { emissive: 0xdfeefc, emissiveIntensity: 0.25, fog: false });
  const clouds = [];

  for (let i = 0; i < count; i++) {
    const c = new THREE.Group();
    const puffs = rng.int(3, 5);
    for (let p = 0; p < puffs; p++) {
      const r = rng.range(3.5, 6.5);
      const m = mesh(sphere(r, 8, 6), cloudMat, {
        x: rng.range(-11, 11),
        y: rng.range(-1.5, 1.5),
        z: rng.range(-5, 5),
        cast: false,
        receive: false,
      });
      m.scale.y = rng.range(0.5, 0.75);
      c.add(m);
    }
    c.position.set(rng.range(-170, 170), rng.range(74, 104), rng.range(-170, 170));
    c.userData.speed = rng.range(0.35, 0.9);
    clouds.push(c);
    group.add(c);
  }

  scene.add(group);
  return {
    group,
    update(dt) {
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 190) c.position.x = -190;
      }
    },
  };
}

/**
 * A small flock that flies across the sky every so often. Birds are two-triangle
 * wings that flap by rotating - convincing at this distance, nearly free.
 */
export function createBirds(scene, rng) {
  const group = new THREE.Group();
  group.name = 'birds';
  group.visible = false;
  const birdMat = mat(0x3d4a57, { fog: false });
  const wingGeo = new THREE.PlaneGeometry(1.5, 0.45);
  const birds = [];

  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(wingGeo, birdMat);
      wing.position.x = s * 0.75;
      wing.rotation.x = -Math.PI / 2;
      wing.userData.side = s;
      b.add(wing);
    }
    b.position.set(rng.range(-8, 8), rng.range(-3, 3), rng.range(-8, 8));
    b.userData.phase = rng.range(0, Math.PI * 2);
    birds.push(b);
    group.add(b);
  }
  scene.add(group);

  let timer = rng.range(8, 16);
  let flying = false;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let t = 0;
  let duration = 1;

  return {
    group,
    update(dt, time) {
      if (!flying) {
        timer -= dt;
        if (timer <= 0) {
          const side = rng.chance(0.5) ? -1 : 1;
          from.set(side * 150, rng.range(34, 48), rng.range(-70, 70));
          to.set(-side * 150, rng.range(30, 46), rng.range(-70, 70));
          duration = rng.range(16, 24);
          t = 0;
          flying = true;
          group.visible = true;
        }
        return;
      }
      t += dt / duration;
      if (t >= 1) {
        flying = false;
        group.visible = false;
        timer = rng.range(14, 30);
        return;
      }
      group.position.lerpVectors(from, to, t);
      group.position.y += Math.sin(t * Math.PI * 3) * 2.5;
      group.lookAt(to.x, group.position.y, to.z);
      for (const b of birds) {
        const flap = Math.sin(time * 9 + b.userData.phase) * 0.6;
        b.children[0].rotation.y = flap;
        b.children[1].rotation.y = -flap;
      }
    },
  };
}

import * as THREE from 'three';

/**
 * PARTICLES
 * ---------
 * Two pooled InstancedMeshes (soft puffs + flat confetti). Nothing is ever
 * allocated during play: dead particles are simply scaled to zero and reused,
 * so the construction effects cost two draw calls and no GC pressure.
 */

const UP = new THREE.Vector3(0, 1, 0);

function makePool(geometry, count, material) {
  const inst = new THREE.InstancedMesh(geometry, material, count);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  inst.castShadow = false;
  inst.receiveShadow = false;
  inst.frustumCulled = false;
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      rot: new THREE.Euler(),
      life: 0,
      maxLife: 1,
      size: 1,
      drag: 0.9,
      gravity: -9,
    });
  }
  return { inst, items, cursor: 0 };
}

export function createParticles(scene) {
  const puffGeo = new THREE.SphereGeometry(0.5, 6, 5);
  const flakeGeo = new THREE.PlaneGeometry(0.5, 0.75);

  const puffs = makePool(puffGeo, 220, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.92 }));
  const flakes = makePool(
    flakeGeo,
    260,
    new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.98 })
  );

  scene.add(puffs.inst, flakes.inst);

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const col = new THREE.Color();

  function spawn(pool, cfg) {
    const { items } = pool;
    for (let n = 0; n < items.length; n++) {
      const idx = (pool.cursor + n) % items.length;
      const p = items[idx];
      if (p.alive) continue;
      pool.cursor = (idx + 1) % items.length;
      p.alive = true;
      p.pos.copy(cfg.pos);
      p.vel.copy(cfg.vel);
      p.spin.set(cfg.spin?.x || 0, cfg.spin?.y || 0, cfg.spin?.z || 0);
      p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      p.life = 0;
      p.maxLife = cfg.maxLife;
      p.size = cfg.size;
      p.drag = cfg.drag ?? 0.86;
      p.gravity = cfg.gravity ?? -9;
      col.set(cfg.color);
      pool.inst.setColorAt(idx, col);
      if (pool.inst.instanceColor) pool.inst.instanceColor.needsUpdate = true;
      return p;
    }
    return null;
  }

  function updatePool(pool, dt) {
    const { items, inst } = pool;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.alive) {
        m4.makeScale(0, 0, 0);
        inst.setMatrixAt(i, m4);
        continue;
      }
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        m4.makeScale(0, 0, 0);
        inst.setMatrixAt(i, m4);
        continue;
      }
      const k = p.life / p.maxLife;
      p.vel.y += p.gravity * dt;
      p.vel.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.05) {
        p.pos.y = 0.05;
        p.vel.set(0, 0, 0);
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      q.setFromEuler(p.rot);
      const s = p.size * (1 - k * 0.55) * Math.min(1, p.life * 12);
      scaleV.setScalar(s);
      m4.compose(p.pos, q, scaleV);
      inst.setMatrixAt(i, m4);
    }
    inst.instanceMatrix.needsUpdate = true;
  }

  const DUST_COLORS = [0xe8dcc0, 0xd8c9a6, 0xf2ead6, 0xcfc3a4];
  const CONFETTI_COLORS = [0xff6b6b, 0xffd166, 0x6bcB77, 0x4d96ff, 0xc490e4, 0xffffff];

  return {
    /** Dust ring kicked out when the foundation slams down. */
    dust(center, { count = 26, radius = 5, power = 7, height = 0.4 } = {}) {
      const pos = new THREE.Vector3();
      const vel = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + Math.random() * 0.3;
        const r = radius * (0.4 + Math.random() * 0.6);
        pos.set(center.x + Math.cos(a) * r * 0.3, center.y + height, center.z + Math.sin(a) * r * 0.3);
        vel.set(Math.cos(a) * power * (0.6 + Math.random() * 0.7), 1.5 + Math.random() * 2.4, Math.sin(a) * power * (0.6 + Math.random() * 0.7));
        spawn(puffs, {
          pos, vel,
          maxLife: 0.9 + Math.random() * 0.7,
          size: 1.6 + Math.random() * 2.2,
          color: DUST_COLORS[(Math.random() * DUST_COLORS.length) | 0],
          gravity: -2.4,
          drag: 0.82,
        });
      }
    },

    /** Sparkles that rise around a finished building. */
    sparkle(center, { count = 20, radius = 6, colorSet = CONFETTI_COLORS } = {}) {
      const pos = new THREE.Vector3();
      const vel = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = radius * Math.sqrt(Math.random());
        pos.set(center.x + Math.cos(a) * r, center.y + Math.random() * 3, center.z + Math.sin(a) * r);
        vel.set(Math.cos(a) * 0.6, 3.5 + Math.random() * 3, Math.sin(a) * 0.6);
        spawn(flakes, {
          pos, vel,
          spin: { x: 4, y: 6, z: 3 },
          maxLife: 1.3 + Math.random() * 0.8,
          size: 0.8 + Math.random() * 0.9,
          color: colorSet[(Math.random() * colorSet.length) | 0],
          gravity: 1.2,
          drag: 0.9,
        });
      }
    },

    /** Full confetti burst - saved for the big landmarks and the finale. */
    confetti(center, { count = 90, spread = 12, power = 14 } = {}) {
      const pos = new THREE.Vector3();
      const vel = new THREE.Vector3();
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        pos.set(center.x + (Math.random() - 0.5) * spread, center.y + 2, center.z + (Math.random() - 0.5) * spread);
        vel.set(Math.cos(a) * power * 0.35, power * (0.6 + Math.random() * 0.6), Math.sin(a) * power * 0.35);
        spawn(flakes, {
          pos, vel,
          spin: { x: 8, y: 10, z: 6 },
          maxLife: 2.4 + Math.random() * 1.4,
          size: 1.1 + Math.random() * 0.8,
          color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
          gravity: -6.5,
          drag: 0.94,
        });
      }
    },

    update(dt) {
      updatePool(puffs, dt);
      updatePool(flakes, dt);
    },
  };
}

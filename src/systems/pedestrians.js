import * as THREE from 'three';
import { PALETTE as P, mat, roundedBox, box, sphere, mesh } from '../core/materials.js';

/**
 * PEDESTRIANS
 * -----------
 * Pooled low-poly people walking a waypoint network. There is no pathfinding:
 * a walker follows an edge, and at each junction picks another one. Some of
 * them detour to the entrance of a finished landmark, idle there, and come back
 * - which is what makes new buildings feel like they attract people.
 *
 * States: walking | idle | toEntrance | visiting | returning
 */

const SKIN = [0xf6d5b8, 0xe8b992, 0xc98d63, 0x8d5b3c, 0xfadfc6];
const TOPS = [0x4a90d9, 0xe05c4b, 0x57c07b, 0xffd166, 0x9b7ede, 0xf4a259, 0xffffff, 0x39557a];
const BOTTOMS = [0x39557a, 0x4c5b6b, 0x8a6340, 0x2f3640, 0x6b7c8c];

export function makePerson(rng) {
  const g = new THREE.Group();
  const skin = mat(rng.pick(SKIN));
  const top = mat(rng.pick(TOPS));
  const bottom = mat(rng.pick(BOTTOMS));

  g.add(mesh(roundedBox(0.62, 0.85, 0.42, 0.18), top, { y: 1.12, receive: false }));
  g.add(mesh(sphere(0.3, 8, 6), skin, { y: 1.76, receive: false }));
  const hair = mesh(sphere(0.32, 8, 5), mat(rng.pick([0x2b2b2b, 0x4a3728, 0x1f1f24])), { y: 1.84, receive: false });
  hair.scale.y = 0.55;
  g.add(hair);

  const legs = [];
  for (const sx of [-0.16, 0.16]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0.72, 0);
    pivot.add(mesh(box(0.22, 0.72, 0.24), bottom, { y: -0.36, receive: false }));
    g.add(pivot);
    legs.push(pivot);
  }
  const arms = [];
  for (const sx of [-0.4, 0.4]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 1.5, 0);
    pivot.add(mesh(box(0.16, 0.62, 0.18), top, { y: -0.31, cast: false, receive: false }));
    g.add(pivot);
    arms.push(pivot);
  }

  if (rng.chance(0.18)) {
    g.add(mesh(box(0.4, 0.42, 0.22), mat(rng.pick([P.red, P.navy, P.orange])), {
      y: 1.15, z: -0.3, cast: false, receive: false,
    }));
  }
  g.scale.setScalar(rng.range(0.86, 1.12));
  g.userData = { legs, arms, phase: rng.range(0, Math.PI * 2) };
  return g;
}

export function createPedestrians(scene, graph, rng, { max = 64 } = {}) {
  const root = new THREE.Group();
  root.name = 'pedestrians';
  scene.add(root);

  const pool = [];
  const active = [];
  const attractions = [];
  const tmp = new THREE.Vector2();
  const dirV = new THREE.Vector3();

  function obtain() {
    let p = pool.pop();
    if (!p) {
      if (active.length >= max) return null;
      p = { group: makePerson(rng), speed: 0, state: 'walking' };
      root.add(p.group);
    }
    p.group.visible = true;
    return p;
  }

  function placeOnRandomEdge(p) {
    const edge = graph.randomEdge(rng);
    p.edge = edge;
    p.forward = rng.chance(0.5);
    p.t = rng.range(0, edge.length);
    p.lateral = edge.width / 2 + rng.range(1.0, 1.9);
    p.speed = rng.range(1.5, 2.5);
    p.state = 'walking';
    p.timer = 0;
    p.visitCooldown = rng.range(4, 20);
    graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
    p.group.position.set(tmp.x, 0.3, tmp.y);
  }

  function faceAlong(p, dir) {
    const target = Math.atan2(dir.x, dir.z);
    let delta = target - p.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    p.group.rotation.y += delta * 0.25;
  }

  function updateWalkPosition(p) {
    graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
    dirV.set(tmp.x - p.group.position.x, 0, tmp.y - p.group.position.z);
    p.group.position.x = tmp.x;
    p.group.position.z = tmp.y;
    if (dirV.lengthSq() > 1e-6) faceAlong(p, dirV);
  }

  function continueFrom(p, node) {
    const next = graph.nextEdge(node, p.edge, rng);
    p.edge = next;
    p.forward = next.a === node;
    p.t = 0;
    p.lateral = next.width / 2 + rng.range(1.0, 1.9);
    p.state = 'walking';
  }

  function arriveAtNode(p) {
    const node = p.forward ? p.edge.b : p.edge.a;

    if (attractions.length && p.visitCooldown <= 0 && rng.chance(0.4)) {
      let best = null;
      let bestD = 28;
      for (const a of attractions) {
        const d = Math.hypot(a.pos.x - node.pos.x, a.pos.z - node.pos.y);
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
      if (best) {
        p.state = 'toEntrance';
        p.target = {
          x: best.pos.x + rng.range(-2.5, 2.5),
          z: best.pos.z + rng.range(-2.5, 2.5),
        };
        p.homeNode = node;
        p.visitCooldown = rng.range(25, 60);
        return;
      }
    }

    if (rng.chance(0.22)) {
      p.state = 'idle';
      p.timer = rng.range(1.2, 4);
      p.pendingNode = node;
      return;
    }
    continueFrom(p, node);
  }

  function moveToward(p, dt, target) {
    dirV.set(target.x - p.group.position.x, 0, target.z - p.group.position.z);
    const dist = dirV.length();
    if (dist < 0.45) return true;
    dirV.multiplyScalar(1 / dist);
    p.group.position.addScaledVector(dirV, Math.min(dist, p.speed * dt));
    faceAlong(p, dirV);
    return false;
  }

  function animateWalk(p, dt, moving) {
    const { legs, arms } = p.group.userData;
    if (moving) {
      p.group.userData.phase += dt * p.speed * 4.2;
      const s = Math.sin(p.group.userData.phase);
      legs[0].rotation.x = s * 0.7;
      legs[1].rotation.x = -s * 0.7;
      arms[0].rotation.x = -s * 0.5;
      arms[1].rotation.x = s * 0.5;
      p.group.position.y = 0.3 + Math.abs(Math.sin(p.group.userData.phase * 2)) * 0.035;
    } else {
      for (const l of legs) l.rotation.x *= 0.9;
      for (const a of arms) a.rotation.x *= 0.9;
    }
  }

  return {
    root,
    get count() {
      return active.length;
    },

    /** Grow or shrink the crowd. Called whenever the town gains a landmark. */
    setPopulation(n) {
      const target = Math.min(max, Math.max(0, Math.round(n)));
      while (active.length < target) {
        const p = obtain();
        if (!p) break;
        placeOnRandomEdge(p);
        active.push(p);
      }
      while (active.length > target) {
        const p = active.pop();
        p.group.visible = false;
        pool.push(p);
      }
    },

    /** Register a finished landmark so walkers start visiting its entrance. */
    addAttraction(x, z) {
      attractions.push({ pos: { x, z } });
    },

    clearAttractions() {
      attractions.length = 0;
    },

    update(dt) {
      for (const p of active) {
        p.visitCooldown -= dt;
        switch (p.state) {
          case 'walking':
            p.t += p.speed * dt;
            if (p.t >= p.edge.length) {
              p.t = p.edge.length;
              updateWalkPosition(p);
              arriveAtNode(p);
            } else {
              updateWalkPosition(p);
            }
            animateWalk(p, dt, true);
            break;

          case 'idle':
            p.timer -= dt;
            animateWalk(p, dt, false);
            if (p.timer <= 0) continueFrom(p, p.pendingNode);
            break;

          case 'toEntrance': {
            const arrived = moveToward(p, dt, p.target);
            animateWalk(p, dt, !arrived);
            if (arrived) {
              p.state = 'visiting';
              p.timer = rng.range(3, 8);
            }
            break;
          }

          case 'visiting':
            p.timer -= dt;
            animateWalk(p, dt, false);
            if (p.timer <= 0) p.state = 'returning';
            break;

          case 'returning': {
            const node = p.homeNode;
            const back = moveToward(p, dt, { x: node.pos.x, z: node.pos.y });
            animateWalk(p, dt, !back);
            if (back) continueFrom(p, node);
            break;
          }

          default:
            break;
        }
      }
    },
  };
}

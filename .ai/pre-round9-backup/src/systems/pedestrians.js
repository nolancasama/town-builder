import * as THREE from 'three';
import { PALETTE as P, mat, roundedBox, box, sphere, mesh } from '../core/materials.js';
import { LANDMARK_LOTS, LOT_SIDEWALK_WIDTH } from '../config/town.js';
import { Occupancy } from '../world/scenery.js';

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
const MAX_TRAFFIC_YIELD_MS = 1800;
const MAX_MOTION_STALL_MS = 1250;

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
  const builtOccupancy = new Occupancy(graph);
  let vehicles = null;
  const tmp = new THREE.Vector2();
  const dirV = new THREE.Vector3();

  function nearestRoadPoint(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const edge of graph.edges) {
      const apx = x - edge.a.pos.x;
      const apz = z - edge.a.pos.y;
      const t = Math.max(0, Math.min(edge.length, apx * edge.dir.x + apz * edge.dir.y));
      for (const side of [-1, 1]) {
        const lateral = side * (edge.width / 2 + 1.3);
        graph.pointOn(edge, t, true, lateral, tmp);
        const d = (tmp.x - x) ** 2 + (tmp.y - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { edge, t, lateral, point: { x: tmp.x, z: tmp.y } };
        }
      }
    }
    return best;
  }

  function shortestPath(start, goal) {
    if (start === goal) return { edges: [], nodes: [start], distance: 0 };
    const dist = new Map(graph.nodes.map((n) => [n, Infinity]));
    const previous = new Map();
    const open = new Set(graph.nodes);
    dist.set(start, 0);
    while (open.size) {
      let node = null;
      let nodeDist = Infinity;
      for (const candidate of open) {
        const d = dist.get(candidate);
        if (d < nodeDist) { node = candidate; nodeDist = d; }
      }
      if (!node || node === goal) break;
      open.delete(node);
      for (const edge of node.edges) {
        const next = edge.a === node ? edge.b : edge.a;
        if (!open.has(next)) continue;
        const candidate = nodeDist + edge.length;
        if (candidate < dist.get(next)) {
          dist.set(next, candidate);
          previous.set(next, { node, edge });
        }
      }
    }
    if (!previous.has(goal)) return null;
    const edges = [];
    const nodes = [goal];
    let cursor = goal;
    while (cursor !== start) {
      const step = previous.get(cursor);
      edges.push(step.edge);
      cursor = step.node;
      nodes.push(cursor);
    }
    edges.reverse();
    nodes.reverse();
    return { edges, nodes, distance: dist.get(goal) };
  }

  function lotWalkPoints(lot) {
    const [cx, cz] = lot.pos;
    const [w, d] = lot.size;
    const angle = lot.rot || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ex = lot.entrance[0] - cx;
    const ez = lot.entrance[1] - cz;
    const lx = ex * cos - ez * sin;
    const lz = ex * sin + ez * cos;
    const tx = Math.abs(lx) > 1e-5 ? (w / 2) / Math.abs(lx) : Infinity;
    const tz = Math.abs(lz) > 1e-5 ? (d / 2) / Math.abs(lz) : Infinity;
    const t = Math.min(1, tx, tz);
    let px = lx * t;
    let pz = lz * t;
    let vx = 0;
    let vz = 0;
    let tangentX = 0;
    let tangentZ = 0;
    if (tx < tz) {
      vx = -Math.sign(px || 1) * LOT_SIDEWALK_WIDTH * 0.5;
      tangentZ = 1;
    } else {
      vz = -Math.sign(pz || 1) * LOT_SIDEWALK_WIDTH * 0.5;
      tangentX = 1;
    }
    px += vx;
    pz += vz;
    const spread = rng.range(-2.5, 2.5);
    const visitX = Math.max(-w / 2 + LOT_SIDEWALK_WIDTH / 2, Math.min(w / 2 - LOT_SIDEWALK_WIDTH / 2, px + tangentX * spread));
    const visitZ = Math.max(-d / 2 + LOT_SIDEWALK_WIDTH / 2, Math.min(d / 2 - LOT_SIDEWALK_WIDTH / 2, pz + tangentZ * spread));
    const world = (x, z) => ({
      x: cx + x * cos + z * sin,
      z: cz - x * sin + z * cos,
    });
    return { ring: world(px, pz), visit: world(visitX, visitZ) };
  }

  function makeVisitRoute(node, attraction) {
    const road = attraction.road;
    const fromA = shortestPath(node, road.edge.a);
    const fromB = shortestPath(node, road.edge.b);
    const costA = (fromA?.distance ?? Infinity) + road.t;
    const costB = (fromB?.distance ?? Infinity) + road.edge.length - road.t;
    const path = costA <= costB ? fromA : fromB;
    if (!path) return null;
    const endpoint = costA <= costB ? road.edge.a : road.edge.b;
    const route = [];
    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      const from = path.nodes[i];
      const forward = edge.a === from;
      graph.pointOn(edge, edge.length, forward, edge.width / 2 + 1.3, tmp);
      route.push({ x: tmp.x, z: tmp.y });
    }
    const finalForward = endpoint === road.edge.a;
    const finalDistance = finalForward ? road.t : road.edge.length - road.t;
    // Keep to the sidewalk side nearest the lot for the final approach.
    const finalLateral = finalForward ? road.lateral : -road.lateral;
    graph.pointOn(road.edge, finalDistance, finalForward, finalLateral, tmp);
    route.push({ x: tmp.x, z: tmp.y });
    route.push({ x: attraction.pos.x, z: attraction.pos.z });
    route.push(attraction.ring);
    route.push(attraction.visit);
    return route.filter((point, i) => i === 0 || Math.hypot(point.x - route[i - 1].x, point.z - route[i - 1].z) > 0.2);
  }

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
    for (let attempt = 0; attempt < 20; attempt++) {
      const edge = graph.randomEdge(rng);
      p.edge = edge;
      p.forward = rng.chance(0.5);
      p.t = rng.range(0, edge.length);
      p.lateral = edge.width / 2 + rng.range(1.0, 1.9);
      graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
      if (!builtOccupancy.overlapsReserved(tmp.x, tmp.y, 0.38)
        && !vehicles?.hasAgentNear(tmp.x, tmp.y, 2.2)) break;
    }
    p.speed = rng.range(1.5, 2.5);
    p.state = 'walking';
    p.timer = 0;
    p.stateUntil = 0;
    p.yielding = false;
    p.trafficYieldTime = 0;
    p.trafficYieldStartedAt = 0;
    p.trafficEscapeTime = 0;
    p.motionStallTime = 0;
    p.motionStallStartedAt = 0;
    p.visitCooldown = rng.range(4, 20);
    graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
    p.group.position.set(tmp.x, 0.3, tmp.y);
    p.progressX = tmp.x;
    p.progressZ = tmp.y;
    p.safeTrafficPoint = {
      x: tmp.x, z: tmp.y, edge: p.edge, t: p.t,
      forward: p.forward, lateral: p.lateral,
    };
  }

  /** Abandon an optional visit route that cannot make progress and resume on
   * the nearest real sidewalk instead of remaining wedged at the lot edge. */
  function rejoinNearestSidewalk(p) {
    const road = nearestRoadPoint(p.group.position.x, p.group.position.z);
    if (!road) {
      placeOnRandomEdge(p);
      return;
    }
    p.edge = road.edge;
    p.forward = true;
    p.t = road.t;
    p.lateral = road.lateral;
    p.state = 'walking';
    p.timer = 0;
    p.route = null;
    p.routeIndex = 0;
    p.yielding = false;
    p.trafficYieldTime = 0;
    p.trafficYieldStartedAt = 0;
    p.trafficEscapeTime = 0.8;
    p.motionStallTime = 0;
    p.motionStallStartedAt = 0;
    p.group.position.set(road.point.x, 0.3, road.point.z);
    p.progressX = road.point.x;
    p.progressZ = road.point.z;
    p.safeTrafficPoint = {
      x: road.point.x, z: road.point.z, edge: p.edge, t: p.t,
      forward: p.forward, lateral: p.lateral,
    };
  }

  function inCarriageway(x, z) {
    return graph.distanceToRoad(x, z) <= 0.8;
  }

  function clearTrafficYield(p) {
    p.yielding = false;
    p.trafficYieldTime = 0;
    p.trafficYieldStartedAt = 0;
  }

  function rememberSafeTrafficPoint(p) {
    if (inCarriageway(p.group.position.x, p.group.position.z)) return;
    p.safeTrafficPoint = {
      x: p.group.position.x, z: p.group.position.z, edge: p.edge, t: p.t,
      forward: p.forward, lateral: p.lateral,
    };
  }

  function returnToSafeTrafficPoint(p) {
    const safe = p.safeTrafficPoint;
    if (!safe || !inCarriageway(p.group.position.x, p.group.position.z)) return;
    p.group.position.x = safe.x;
    p.group.position.z = safe.z;
    if (p.state === 'walking' && safe.edge) {
      p.edge = safe.edge;
      p.t = safe.t;
      p.forward = safe.forward;
      p.lateral = safe.lateral;
    }
  }

  /**
   * Break a mutual wait deterministically: vehicles have priority while the
   * pedestrian waits on the sidewalk; if the crossing stays blocked, the
   * walker turns back (or abandons a landmark detour) instead of remaining in
   * a permanent yielding state.
   */
  function yieldToTraffic(p, _dt) {
    const now = performance.now();
    if (!p.trafficYieldStartedAt) p.trafficYieldStartedAt = now;
    p.trafficYieldTime = (now - p.trafficYieldStartedAt) / 1000;
    if (now - p.trafficYieldStartedAt >= MAX_TRAFFIC_YIELD_MS) {
      returnToSafeTrafficPoint(p);
      clearTrafficYield(p);
      if (p.state === 'walking') {
        p.forward = !p.forward;
        p.t = p.edge.length - p.t;
        p.trafficEscapeTime = 0.8;
      } else {
        // Visiting is optional ambient behaviour. Rejoin the ordinary
        // sidewalk flow rather than keeping a blocked detour alive.
        placeOnRandomEdge(p);
      }
      p.wasMoving = false;
      return true;
    }
    p.yielding = true;
    // A yielding pedestrian waits on their most recent sidewalk point, not
    // in the live lane. This makes the yielding exemption safe: the vehicle
    // can clear the crossing without passing through the waiting person.
    returnToSafeTrafficPoint(p);
    return true;
  }

  function faceAlong(p, dir) {
    const target = Math.atan2(dir.x, dir.z);
    let delta = target - p.group.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    p.group.rotation.y += delta * 0.25;
  }

  function updateWalkPosition(p, dt) {
    graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
    if (builtOccupancy.overlapsReserved(tmp.x, tmp.y, 0.38)) {
      // Some configured plots sit close to one side of a road. Prefer its
      // opposite sidewalk; if both are obstructed, respawn on a clear edge.
      graph.pointOn(p.edge, p.t, p.forward, -p.lateral, tmp);
      if (builtOccupancy.overlapsReserved(tmp.x, tmp.y, 0.38)) {
        placeOnRandomEdge(p);
        return false;
      }
      p.lateral *= -1;
    }
    if (p.trafficEscapeTime <= 0
      && inCarriageway(tmp.x, tmp.y)
      && vehicles?.hasAgentNear(tmp.x, tmp.y, 1.8)
      && yieldToTraffic(p, dt)) {
      return false;
    }
    clearTrafficYield(p);
    dirV.set(tmp.x - p.group.position.x, 0, tmp.y - p.group.position.z);
    p.group.position.x = tmp.x;
    p.group.position.z = tmp.y;
    rememberSafeTrafficPoint(p);
    if (dirV.lengthSq() > 1e-6) faceAlong(p, dirV);
    return true;
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
        p.route = makeVisitRoute(node, best);
        if (!p.route?.length) {
          continueFrom(p, node);
          return;
        }
        p.routeIndex = 0;
        p.target = p.route[0];
        p.homeNode = node;
        p.visitCooldown = rng.range(25, 60);
        return;
      }
    }

    // Never choose an idle pose while the junction geometry puts this walker
    // in a carriageway. A stationary ambient idle must not become a traffic
    // obstacle that neither avoidance state considers a crossing.
    if (!inCarriageway(p.group.position.x, p.group.position.z) && rng.chance(0.22)) {
      p.state = 'idle';
      p.timer = rng.range(1.2, 4);
      p.stateUntil = performance.now() + p.timer * 1000;
      p.pendingNode = node;
      return;
    }
    continueFrom(p, node);
  }

  function moveToward(p, dt, target) {
    dirV.set(target.x - p.group.position.x, 0, target.z - p.group.position.z);
    const dist = dirV.length();
    if (dist < 0.45) { p.wasMoving = false; clearTrafficYield(p); return true; }
    dirV.multiplyScalar(1 / dist);
    if (p.trafficEscapeTime <= 0
      && !inCarriageway(p.group.position.x, p.group.position.z)
      && vehicles?.hasApproachingAgent(p.group.position.x, p.group.position.z, dirV.x * p.speed, dirV.z * p.speed)
      && yieldToTraffic(p, dt)) {
      p.wasMoving = false;
      return false;
    }
    const step = Math.min(dist, p.speed * dt);
    const nx = p.group.position.x + dirV.x * step;
    const nz = p.group.position.z + dirV.z * step;
    if (p.trafficEscapeTime <= 0
      && inCarriageway(nx, nz)
      && vehicles?.hasAgentNear(nx, nz, 1.8)
      && yieldToTraffic(p, dt)) {
      p.wasMoving = false;
      return false;
    }
    clearTrafficYield(p);
    if (builtOccupancy.overlapsReserved(nx, nz, 0.38)) {
      rejoinNearestSidewalk(p);
      p.wasMoving = false;
      return false;
    }
    p.group.position.x = nx;
    p.group.position.z = nz;
    rememberSafeTrafficPoint(p);
    faceAlong(p, dirV);
    p.wasMoving = true;
    return false;
  }

  function nextRoutePoint(p) {
    p.routeIndex += 1;
    if (p.routeIndex >= p.route.length) return false;
    p.target = p.route[p.routeIndex];
    return true;
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

  /** Moving states are never allowed to remain motionless without yielding. */
  function enforceMotionProgress(p, dt) {
    const movingState = p.state === 'walking' || p.state === 'toEntrance' || p.state === 'returning';
    const moved = Math.hypot(
      p.group.position.x - (p.progressX ?? p.group.position.x),
      p.group.position.z - (p.progressZ ?? p.group.position.z)
    );
    if (!movingState || p.yielding || moved > 0.003) {
      p.motionStallTime = 0;
      p.motionStallStartedAt = 0;
    } else {
      const now = performance.now();
      if (!p.motionStallStartedAt) p.motionStallStartedAt = now;
      p.motionStallTime = (now - p.motionStallStartedAt) / 1000;
      if (now - p.motionStallStartedAt >= MAX_MOTION_STALL_MS) {
        if (p.state === 'walking') placeOnRandomEdge(p);
        else rejoinNearestSidewalk(p);
      }
    }
    p.progressX = p.group.position.x;
    p.progressZ = p.group.position.z;
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
    addAttraction(x, z, rotation = 0) {
      const lot = LANDMARK_LOTS.find((candidate) =>
        Math.hypot(candidate.entrance[0] - x, candidate.entrance[1] - z) < 0.1
      );
      if (!lot) return;
      if (attractions.some((attraction) => attraction.lot.id === lot.id)) return;
      const points = lotWalkPoints(lot);
      attractions.push({ pos: { x, z }, lot, road: nearestRoadPoint(x, z), ...points });
      const size = lot.buildSize || lot.size;
      builtOccupancy.addRect(lot.pos[0], lot.pos[1], size[0], size[1], lot.rot ?? rotation);
      for (const p of active) {
        if (builtOccupancy.overlapsReserved(p.group.position.x, p.group.position.z, 0.38)) placeOnRandomEdge(p);
      }
    },

    /** Connected after both pooled systems exist; avoids a constructor cycle. */
    setVehicles(system) {
      vehicles = system;
    },

    clearAttractions() {
      attractions.length = 0;
      builtOccupancy.rects.length = 0;
    },

    /** Used only by cars near junctions, so mutual avoidance stays cheap. */
    hasCrossingNear(x, z, radius = 2.8) {
      const rr = radius * radius;
      for (const p of active) {
        if (p.yielding) continue;
        const leavingSidewalk = p.state === 'toEntrance' || p.state === 'returning';
        const atJunction = p.state === 'walking' && Math.min(p.t, p.edge.length - p.t) < 5;
        if (!leavingSidewalk && !atJunction) continue;
        if (graph.distanceToRoad(p.group.position.x, p.group.position.z) > 0.8) continue;
        const dx = p.group.position.x - x;
        const dz = p.group.position.z - z;
        if (dx * dx + dz * dz < rr) return true;
      }
      return false;
    },

    hasAgentNear(x, z, radius) {
      const rr = radius * radius;
      return active.some((p) => {
        if (p.yielding) return false;
        const leavingSidewalk = p.state === 'toEntrance' || p.state === 'returning';
        const atJunction = p.state === 'walking' && Math.min(p.t, p.edge.length - p.t) < 5;
        if (!leavingSidewalk && !atJunction) return false;
        if (!inCarriageway(p.group.position.x, p.group.position.z)) return false;
        const dx = p.group.position.x - x;
        const dz = p.group.position.z - z;
        return dx * dx + dz * dz < rr;
      });
    },

    update(dt) {
      for (const p of active) {
        p.visitCooldown -= dt;
        p.trafficEscapeTime = Math.max(0, (p.trafficEscapeTime || 0) - dt);
        switch (p.state) {
          case 'walking':
            if (p.trafficEscapeTime <= 0
              && !inCarriageway(p.group.position.x, p.group.position.z)
              && Math.min(p.t, p.edge.length - p.t) < 6 && vehicles?.hasApproachingAgent(
              p.group.position.x,
              p.group.position.z,
              (p.forward ? p.edge.dir.x : -p.edge.dir.x) * p.speed,
              (p.forward ? p.edge.dir.y : -p.edge.dir.y) * p.speed
            ) && yieldToTraffic(p, dt)) {
              animateWalk(p, dt, false);
              break;
            }
            clearTrafficYield(p);
            p.t += p.speed * dt;
            if (p.t >= p.edge.length) {
              p.t = p.edge.length;
              if (updateWalkPosition(p, dt)) arriveAtNode(p);
              else {
                animateWalk(p, dt, false);
                break;
              }
            } else {
              if (!updateWalkPosition(p, dt)) {
                animateWalk(p, dt, false);
                break;
              }
            }
            animateWalk(p, dt, true);
            break;

          case 'idle':
            p.timer = Math.max(0, (p.stateUntil - performance.now()) / 1000);
            animateWalk(p, dt, false);
            if (p.timer <= 0) continueFrom(p, p.pendingNode);
            break;

          case 'toEntrance': {
            const arrived = moveToward(p, dt, p.target);
            animateWalk(p, dt, p.wasMoving);
            if (arrived) {
              if (!nextRoutePoint(p)) {
                p.state = 'visiting';
                p.timer = rng.range(3, 8);
                p.stateUntil = performance.now() + p.timer * 1000;
                p.visitRoute = p.route;
              }
            }
            break;
          }

          case 'visiting':
            p.timer = Math.max(0, (p.stateUntil - performance.now()) / 1000);
            animateWalk(p, dt, false);
            if (p.timer <= 0) {
              p.state = 'returning';
              p.route = [...p.visitRoute].reverse();
              p.routeIndex = 0;
              p.target = p.route[0];
            }
            break;

          case 'returning': {
            const back = moveToward(p, dt, p.target);
            animateWalk(p, dt, p.wasMoving);
            if (back && !nextRoutePoint(p)) continueFrom(p, p.homeNode);
            break;
          }

          default:
            break;
        }
        enforceMotionProgress(p, dt);
        // Publish the state after transitions so live QA never attributes a
        // stationary sample to the state that ended earlier this frame.
        p.group.userData.motionState = p.state;
        p.group.userData.yielding = Boolean(p.yielding);
      }
    },
  };
}

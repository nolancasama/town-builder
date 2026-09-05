import * as THREE from 'three';
import { PALETTE as P, mat, roundedBox, box, sphere, mesh } from '../core/materials.js';
import { LANDMARK_LOTS } from '../config/town.js';
import { Occupancy } from '../world/scenery.js';
import { CLIP, createCharacterModel } from '../world/characterModels.js';

/**
 * PEDESTRIANS
 * -----------
 * Pooled animated people walking a waypoint network. There is no pathfinding:
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
const SIDEWALK_OFFSET_MIN = 1.0;
const SIDEWALK_OFFSET_MAX = 1.9;
const DOOR_CLEARANCE = 0.48;
const RETIREMENT_EXIT_DISTANCE = 24;

export function makePerson(rng, { camera = null, allowRare = false } = {}) {
  const character = createCharacterModel(rng, { camera, allowRare });
  if (character) return character;

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

export function createPedestrians(scene, graph, rng, { max = 24, camera = null } = {}) {
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
  const viewPoint = new THREE.Vector3();
  const graphCentre = graph.nodes.reduce((centre, node) => {
    centre.x += node.pos.x / graph.nodes.length;
    centre.y += node.pos.y / graph.nodes.length;
    return centre;
  }, new THREE.Vector2());
  const retirementExits = [...graph.nodes]
    .sort((a, b) => b.pos.distanceToSquared(graphCentre) - a.pos.distanceToSquared(graphCentre))
    .slice(0, Math.min(8, graph.nodes.length));

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

  /** Frontage points run only from the road-side entrance to the building's
   * front door. They deliberately never turn onto the old perimeter ring. */
  function lotWalkPoints(lot) {
    const [cx, cz] = lot.pos;
    const [w, d] = lot.buildSize || lot.size;
    const angle = lot.rot || 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const ex = lot.entrance[0] - cx;
    const ez = lot.entrance[1] - cz;
    const lx = ex * cos - ez * sin;
    const lz = ex * sin + ez * cos;
    const tx = Math.abs(lx) > 1e-5 ? (w / 2) / Math.abs(lx) : Infinity;
    const tz = Math.abs(lz) > 1e-5 ? (d / 2) / Math.abs(lz) : Infinity;
    const t = Math.min(tx, tz);
    const rayLength = Math.hypot(lx, lz) || 1;
    const outwardX = lx / rayLength;
    const outwardZ = lz / rayLength;
    const doorX = lx * t + outwardX * DOOR_CLEARANCE;
    const doorZ = lz * t + outwardZ * DOOR_CLEARANCE;
    const world = (x, z) => ({
      x: cx + x * cos + z * sin,
      z: cz - x * sin + z * cos,
    });
    const visit = world(doorX, doorZ);
    return {
      frontage: {
        x: (lot.entrance[0] + visit.x) * 0.5,
        z: (lot.entrance[1] + visit.z) * 0.5,
      },
      visit,
    };
  }

  function makeVisitRoute(origin, node, attraction) {
    const road = attraction.road;
    if (!road) return null;
    const fromA = shortestPath(node, road.edge.a);
    const fromB = shortestPath(node, road.edge.b);
    const costA = (fromA?.distance ?? Infinity) + road.t;
    const costB = (fromB?.distance ?? Infinity) + road.edge.length - road.t;
    const path = costA <= costB ? fromA : fromB;
    if (!path) return null;
    const endpoint = costA <= costB ? road.edge.a : road.edge.b;
    const route = [{ x: origin.x, z: origin.z }];
    const routeSide = Math.sign(origin.lateral) || 1;
    for (let i = 0; i < path.edges.length; i++) {
      const edge = path.edges[i];
      const from = path.nodes[i];
      const forward = edge.a === from;
      graph.pointOn(edge, edge.length, forward, routeSide * (edge.width / 2 + 1.3), tmp);
      route.push({ x: tmp.x, z: tmp.y });
    }
    const finalForward = endpoint === road.edge.a;
    const finalDistance = finalForward ? road.t : road.edge.length - road.t;
    // Keep to the sidewalk side nearest the lot for the final approach.
    const finalLateral = finalForward ? road.lateral : -road.lateral;
    graph.pointOn(road.edge, finalDistance, finalForward, finalLateral, tmp);
    route.push({ x: tmp.x, z: tmp.y });
    route.push({ x: attraction.pos.x, z: attraction.pos.z });
    route.push(attraction.frontage);
    route.push(attraction.visit);
    return route.filter((point, i) => i === 0 || Math.hypot(point.x - route[i - 1].x, point.z - route[i - 1].z) > 0.2);
  }

  function obtain() {
    let p = pool.pop();
    if (!p) {
      if (active.length >= max) return null;
      p = { group: makePerson(rng, { camera, allowRare: true }), speed: 0, state: 'walking' };
      root.add(p.group);
    }
    // Placement happens before visibility is restored, so a pooled walker can
    // never flash for one frame at its previous location.
    p.group.visible = false;
    return p;
  }

  function placeOnRandomEdge(p) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const edge = graph.randomEdge(rng);
      p.edge = edge;
      p.forward = rng.chance(0.5);
      p.t = rng.range(0, edge.length);
      p.lateral = edge.width / 2 + rng.range(SIDEWALK_OFFSET_MIN, SIDEWALK_OFFSET_MAX);
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
    p.retiring = false;
    p.retirementExit = null;
    p.pendingPool = false;
    p.route = null;
    p.routeIndex = 0;
    p.animationAccumulator = 0;
    p.rejoinRoad = null;
    p.visitCooldown = rng.range(4, 20);
    graph.pointOn(p.edge, p.t, p.forward, p.lateral, tmp);
    p.group.position.set(tmp.x, 0.3, tmp.y);
    p.progressX = tmp.x;
    p.progressZ = tmp.y;
    p.safeTrafficPoint = {
      x: tmp.x, z: tmp.y, edge: p.edge, t: p.t,
      forward: p.forward, lateral: p.lateral,
    };
    p.group.userData.speed = p.speed;
    p.group.userData.motionState = p.state;
    p.group.userData.yielding = false;
  }

  /** Abandon an optional route by walking to the nearest real sidewalk. This
   * used to teleport the walker and is intentionally a normal moving state. */
  function rejoinNearestSidewalk(p, { turnAround = false } = {}) {
    const road = nearestRoadPoint(p.group.position.x, p.group.position.z);
    if (!road) {
      p.state = 'idle';
      p.timer = 0.25;
      p.stateUntil = performance.now() + 250;
      p.pendingNode = p.forward ? p.edge?.b : p.edge?.a;
      return;
    }
    p.state = 'rejoining';
    p.target = road.point;
    p.rejoinRoad = road;
    p.rejoinTurnAround = turnAround;
    p.timer = 0;
    p.route = null;
    p.routeIndex = 0;
    clearTrafficYield(p);
    p.trafficEscapeTime = 0.8;
    p.motionStallTime = 0;
    p.motionStallStartedAt = 0;
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

  function beginTrafficRetreat(p) {
    const safe = p.safeTrafficPoint;
    if (!safe) {
      rejoinNearestSidewalk(p, { turnAround: true });
      return;
    }
    p.state = 'trafficRetreat';
    p.target = { x: safe.x, z: safe.z };
    p.retreatRoad = safe;
    p.yielding = false;
    p.trafficYieldTime = 0;
    p.trafficYieldStartedAt = 0;
    p.trafficEscapeTime = 0.8;
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
      clearTrafficYield(p);
      if (p.state === 'walking') {
        p.forward = !p.forward;
        p.t = p.edge.length - p.t;
        p.lateral *= -1;
        p.trafficEscapeTime = 0.8;
      } else {
        // Visiting is optional ambient behaviour. Rejoin the ordinary
        // sidewalk flow rather than keeping a blocked detour alive.
        rejoinNearestSidewalk(p, { turnAround: true });
      }
      p.wasMoving = false;
      return true;
    }
    if (inCarriageway(p.group.position.x, p.group.position.z)) {
      // Retreat across the same geometry at walking speed. Snapping to the
      // saved sidewalk point was itself an impossible movement jump.
      beginTrafficRetreat(p);
      p.wasMoving = false;
      return true;
    }
    p.yielding = true;
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
      // Re-route from the last valid point. Changing lateral sign here used to
      // throw the walker across the full road width in a single frame.
      rejoinNearestSidewalk(p, { turnAround: true });
      return false;
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

  function continueFrom(p, node, forcedEdge = null) {
    const previousEdge = p.edge;
    const previousLateral = p.lateral;
    const next = forcedEdge || graph.nextEdge(node, previousEdge, rng);
    const forward = next.a === node;

    if (next === previousEdge) {
      // Reversing direction reverses the edge's lateral basis too. Negating
      // the signed offset keeps the walker on the same physical pavement.
      p.edge = next;
      p.forward = forward;
      p.t = 0;
      p.lateral = -previousLateral;
      p.state = 'walking';
      return;
    }

    const side = Math.sign(previousLateral) || 1;
    let lateral = side * (next.width / 2 + rng.range(SIDEWALK_OFFSET_MIN, SIDEWALK_OFFSET_MAX));
    graph.pointOn(next, 0, forward, lateral, tmp);
    if (builtOccupancy.overlapsReserved(tmp.x, tmp.y, 0.38)) {
      const alternate = -lateral;
      graph.pointOn(next, 0, forward, alternate, tmp);
      if (!builtOccupancy.overlapsReserved(tmp.x, tmp.y, 0.38)) lateral = alternate;
    }
    graph.pointOn(next, 0, forward, lateral, tmp);
    p.state = 'junction';
    p.target = { x: tmp.x, z: tmp.y };
    p.junctionRoad = { edge: next, forward, t: 0, lateral };
    p.yielding = false;
  }

  function visitOriginFor(p, node) {
    return {
      x: p.group.position.x,
      z: p.group.position.z,
      edge: p.edge,
      t: p.t,
      forward: p.forward,
      lateral: p.lateral,
      node,
    };
  }

  function retirementPathFrom(node, destination) {
    return shortestPath(node, destination);
  }

  function chooseRetirementExit(node) {
    let best = retirementExits[0];
    let bestDistance = Infinity;
    for (const candidate of retirementExits) {
      const path = retirementPathFrom(node, candidate);
      if (path && path.distance < bestDistance) {
        best = candidate;
        bestDistance = path.distance;
      }
    }
    return best;
  }

  function beginRetirementExit(p, node) {
    if (!p.retirementExit) p.retirementExit = chooseRetirementExit(node);
    if (node !== p.retirementExit) {
      const path = retirementPathFrom(node, p.retirementExit);
      if (path?.edges.length) {
        continueFrom(p, node, path.edges[0]);
        return;
      }
    }
    const dx = node.pos.x - graphCentre.x;
    const dz = node.pos.y - graphCentre.y;
    const length = Math.hypot(dx, dz) || 1;
    p.retirementDirection = { x: dx / length, z: dz / length };
    p.state = 'retiring';
    p.target = {
      x: node.pos.x + p.retirementDirection.x * RETIREMENT_EXIT_DISTANCE,
      z: node.pos.y + p.retirementDirection.z * RETIREMENT_EXIT_DISTANCE,
    };
    clearTrafficYield(p);
  }

  function arriveAtNode(p) {
    const node = p.forward ? p.edge.b : p.edge.a;

    if (p.retiring) {
      beginRetirementExit(p, node);
      return;
    }

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
        const origin = visitOriginFor(p, node);
        p.state = 'toEntrance';
        p.route = makeVisitRoute(origin, node, best);
        if (!p.route?.length) {
          continueFrom(p, node);
          return;
        }
        p.routeIndex = 0;
        p.target = p.route[0];
        p.homeNode = node;
        p.visitOrigin = origin;
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

  function moveToward(p, dt, target, { ignoreTraffic = false, ignoreReserved = false } = {}) {
    dirV.set(target.x - p.group.position.x, 0, target.z - p.group.position.z);
    const dist = dirV.length();
    if (dist < 1e-5) { p.wasMoving = false; clearTrafficYield(p); return true; }
    dirV.multiplyScalar(1 / dist);
    if (!ignoreTraffic && p.trafficEscapeTime <= 0
      && !inCarriageway(p.group.position.x, p.group.position.z)
      && vehicles?.hasApproachingAgent(p.group.position.x, p.group.position.z, dirV.x * p.speed, dirV.z * p.speed)
      && yieldToTraffic(p, dt)) {
      p.wasMoving = false;
      return false;
    }
    const step = Math.min(dist, p.speed * dt);
    const nx = p.group.position.x + dirV.x * step;
    const nz = p.group.position.z + dirV.z * step;
    if (!ignoreTraffic && p.trafficEscapeTime <= 0
      && inCarriageway(nx, nz)
      && vehicles?.hasAgentNear(nx, nz, 1.8)
      && yieldToTraffic(p, dt)) {
      p.wasMoving = false;
      return false;
    }
    clearTrafficYield(p);
    if (!ignoreReserved && builtOccupancy.overlapsReserved(nx, nz, 0.38)) {
      rejoinNearestSidewalk(p, { turnAround: true });
      p.wasMoving = false;
      return false;
    }
    p.group.position.x = nx;
    p.group.position.z = nz;
    rememberSafeTrafficPoint(p);
    faceAlong(p, dirV);
    p.wasMoving = true;
    return step >= dist - 1e-6;
  }

  function nextRoutePoint(p) {
    p.routeIndex += 1;
    if (p.routeIndex >= p.route.length) return false;
    p.target = p.route[p.routeIndex];
    return true;
  }

  function animateWalk(p, dt, moving) {
    if (p.group.userData.isCharacterModel) {
      const data = p.group.userData;
      data.playAnimation(moving ? CLIP.walk : data.idleClip, {
        timeScale: moving ? p.speed / 1.9 : 1,
      });

      const activeCamera = camera || globalThis.window?.game?.camera;
      p.animationAccumulator = Math.min(0.2, (p.animationAccumulator || 0) + dt);
      if (activeCamera) {
        const onScreen = agentIsOnScreen(p, activeCamera);
        if (!onScreen) return;
        const far = activeCamera.position.distanceToSquared(p.group.position) > 45 * 45;
        if (far && p.animationAccumulator < 0.1) return;
      }
      data.updateAnimation(p.animationAccumulator);
      p.animationAccumulator = 0;
      return;
    }

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
    const movingState = p.state === 'walking' || p.state === 'junction'
      || p.state === 'toEntrance' || p.state === 'returning'
      || p.state === 'rejoining' || p.state === 'trafficRetreat'
      || p.state === 'retiring';
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
        // Keep the earlier watchdog/reroute guarantee, but never recover by
        // relocating a walker who is already visible in the scene.
        rejoinNearestSidewalk(p, { turnAround: true });
      }
    }
    p.progressX = p.group.position.x;
    p.progressZ = p.group.position.z;
  }

  function agentIsOnScreen(p, activeCamera = camera || globalThis.window?.game?.camera) {
    if (!activeCamera) return false;
    viewPoint.copy(p.group.position);
    viewPoint.y += 1;
    viewPoint.project(activeCamera);
    return viewPoint.z >= -1 && viewPoint.z <= 1
      && Math.abs(viewPoint.x) <= 1.05 && Math.abs(viewPoint.y) <= 1.05;
  }

  function finishRetirementWhenOffscreen(p) {
    if (agentIsOnScreen(p)) {
      p.retirementOffscreen = false;
      p.target = {
        x: p.target.x + p.retirementDirection.x * RETIREMENT_EXIT_DISTANCE,
        z: p.target.z + p.retirementDirection.z * RETIREMENT_EXIT_DISTANCE,
      };
      return;
    }
    // Leave one rendered frame at the off-screen endpoint before pooling. It
    // makes a visible->hidden sample unambiguously an off-camera retirement.
    if (!p.retirementOffscreen) {
      p.retirementOffscreen = true;
      return;
    }
    p.pendingPool = true;
  }

  function restoreRoadAfterRejoin(p) {
    const road = p.rejoinRoad;
    if (!road) return;
    p.edge = road.edge;
    p.forward = true;
    p.t = road.t;
    p.lateral = road.lateral;
    if (p.rejoinTurnAround) {
      p.forward = false;
      p.t = p.edge.length - p.t;
      p.lateral *= -1;
    }
    p.state = 'walking';
    p.rejoinRoad = null;
    p.rejoinTurnAround = false;
    p.trafficEscapeTime = 0.8;
    rememberSafeTrafficPoint(p);
  }

  function restoreVisitOrigin(p) {
    const origin = p.visitOrigin;
    if (!origin) {
      rejoinNearestSidewalk(p);
      return;
    }
    p.edge = origin.edge;
    p.t = origin.t;
    p.forward = origin.forward;
    p.lateral = origin.lateral;
    p.homeNode = origin.node;
    // The reversed route ended at these exact coordinates, so restoring the
    // graph state changes no position at all.
    if (p.retiring) beginRetirementExit(p, origin.node);
    else continueFrom(p, origin.node);
  }

  function poolFinishedRetirements() {
    for (let i = active.length - 1; i >= 0; i--) {
      const p = active[i];
      if (!p.pendingPool) continue;
      if (p.permanent) { p.pendingPool = false; rejoinNearestSidewalk(p); continue; }
      active.splice(i, 1);
      p.group.visible = false;
      p.group.userData.retiredOffNetwork = true;
      pool.push(p);
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
      let retained = active.filter((p) => !p.retiring).length;
      const permanent = active.filter((p) => p.permanent).length;
      if (permanent) n = Math.max(n, permanent);

      // A later increase can cancel exits that have not yet returned to the
      // pool. An agent already walking beyond the network rejoins at speed.
      if (retained < target) {
        for (let i = active.length - 1; i >= 0 && retained < target; i--) {
          const p = active[i];
          if (!p.retiring) continue;
          p.retiring = false;
          p.retirementExit = null;
          p.retirementOffscreen = false;
          if (p.state === 'retiring') rejoinNearestSidewalk(p);
          retained++;
        }
      }

      while (retained < target) {
        const p = obtain();
        if (!p) break;
        placeOnRandomEdge(p);
        p.group.visible = true;
        p.group.userData.retiredOffNetwork = false;
        active.push(p);
        retained++;
      }

      if (retained > target) {
        let surplus = retained - target;
        for (let i = active.length - 1; i >= 0 && surplus > 0; i--) {
          const p = active[i];
          if (p.retiring || p.permanent) continue;
          p.retiring = true;
          p.retirementExit = null;
          p.retirementOffscreen = false;
          p.group.userData.retiring = true;
          surplus--;
        }
      }
    },

    /**
     * Adopt an externally-built character as a permanent walker. The opening
     * scene's local uses this instead of being deleted: he keeps his own body
     * and joins the crowd, walking to the nearest sidewalk from wherever he is
    * standing rather than being snapped onto the network. Marked `permanent`
    * so a population drop never retires him.
    */
    adopt(group) {
      if (!group || (!group.userData.isCharacterModel
        && (!group.userData.legs || !group.userData.arms))) return null;
      const road = nearestRoadPoint(group.position.x, group.position.z);
      if (!road) return null;
      const p = {
        group,
        permanent: true,
        speed: rng.range(1.2, 1.8),
        state: 'walking',
        edge: road.edge,
        t: road.t,
        forward: true,
        lateral: Math.abs(road.lateral),
        timer: 0,
        stateUntil: 0,
        yielding: false,
        trafficYieldTime: 0,
        trafficYieldStartedAt: 0,
        trafficEscapeTime: 0,
        motionStallTime: 0,
        motionStallStartedAt: 0,
        retiring: false,
        retirementExit: null,
        pendingPool: false,
        route: null,
        routeIndex: 0,
        rejoinRoad: null,
        visitCooldown: rng.range(6, 20),
        progressX: group.position.x,
        progressZ: group.position.z,
      };
      p.safeTrafficPoint = {
        x: road.point.x, z: road.point.z, edge: road.edge,
        t: road.t, forward: true, lateral: p.lateral,
      };
      if (group.parent !== root) root.add(group);
      group.position.y = 0.3;
      group.visible = true;
      if (typeof group.userData.phase !== 'number') group.userData.phase = 0;
      group.userData.speed = p.speed;
      group.userData.motionState = p.state;
      group.userData.yielding = false;
      rejoinNearestSidewalk(p);
      active.push(p);
      return p;
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
        if (builtOccupancy.overlapsReserved(p.group.position.x, p.group.position.z, 0.38)) {
          rejoinNearestSidewalk(p);
        }
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
        const leavingSidewalk = p.state === 'junction' || p.state === 'toEntrance'
          || p.state === 'returning' || p.state === 'trafficRetreat'
          || p.state === 'retiring';
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
        const leavingSidewalk = p.state === 'junction' || p.state === 'toEntrance'
          || p.state === 'returning' || p.state === 'trafficRetreat'
          || p.state === 'retiring';
        const atJunction = p.state === 'walking' && Math.min(p.t, p.edge.length - p.t) < 5;
        if (!leavingSidewalk && !atJunction) return false;
        if (!inCarriageway(p.group.position.x, p.group.position.z)) return false;
        const dx = p.group.position.x - x;
        const dz = p.group.position.z - z;
        return dx * dx + dz * dz < rr;
      });
    },

    update(dt) {
      const activeCamera = camera || globalThis.window?.game?.camera;
      activeCamera?.updateMatrixWorld();
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
            if (p.timer <= 0) {
              if (p.retiring) beginRetirementExit(p, p.pendingNode);
              else continueFrom(p, p.pendingNode);
            }
            break;

          case 'junction': {
            const arrived = moveToward(p, dt, p.target);
            animateWalk(p, dt, p.wasMoving);
            if (arrived && p.state === 'junction') {
              p.edge = p.junctionRoad.edge;
              p.forward = p.junctionRoad.forward;
              p.t = p.junctionRoad.t;
              p.lateral = p.junctionRoad.lateral;
              p.junctionRoad = null;
              p.state = 'walking';
              rememberSafeTrafficPoint(p);
            }
            break;
          }

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
            if (back && p.state === 'returning' && !nextRoutePoint(p)) restoreVisitOrigin(p);
            break;
          }

          case 'rejoining': {
            const rejoined = moveToward(p, dt, p.target, { ignoreReserved: true });
            animateWalk(p, dt, p.wasMoving);
            if (rejoined && p.state === 'rejoining') restoreRoadAfterRejoin(p);
            break;
          }

          case 'trafficRetreat': {
            const retreated = moveToward(p, dt, p.target, {
              ignoreTraffic: true,
              ignoreReserved: true,
            });
            animateWalk(p, dt, p.wasMoving);
            if (retreated && p.state === 'trafficRetreat') {
              rejoinNearestSidewalk(p, { turnAround: true });
            }
            break;
          }

          case 'retiring': {
            const exited = moveToward(p, dt, p.target, {
              ignoreTraffic: true,
              ignoreReserved: true,
            });
            animateWalk(p, dt, p.wasMoving);
            if (exited && p.state === 'retiring') finishRetirementWhenOffscreen(p);
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
        p.group.userData.speed = p.speed;
        p.group.userData.retiring = Boolean(p.retiring);
      }
      poolFinishedRetirements();
    },
  };
}

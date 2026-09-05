import * as THREE from 'three';
import { makeCar, makeBicycle } from '../world/props.js';
import { mat, box, sphere, mesh } from '../core/materials.js';

const MAX_TRAFFIC_YIELD_MS = 1800;
const VEHICLE_PRIORITY_DISTANCE = 3.2;

/**
 * VEHICLES
 * --------
 * Cars and cyclists ride the same waypoint graph as the pedestrians, keeping to
 * the left of the centre line (this is Japan). They ease off at junctions and
 * occasionally stop for a moment - just enough motion to make the streets feel
 * used, with none of the cost of a real traffic simulation.
 */

function makeCyclist(rng) {
  const g = new THREE.Group();
  g.add(makeBicycle(rng));
  const rider = new THREE.Group();
  rider.position.set(0, 0.75, -0.1);
  rider.add(mesh(box(0.5, 0.7, 0.35), mat(rng.pick([0x4a90d9, 0xe05c4b, 0x57c07b, 0xffd166])), { y: 0.35, receive: false }));
  rider.add(mesh(sphere(0.26, 8, 6), mat(rng.pick([0xf6d5b8, 0xe8b992, 0xc98d63])), { y: 0.92, receive: false }));
  g.add(rider);
  g.userData.rider = rider;
  return g;
}

export function createVehicles(scene, graph, rng, { maxCars = 14, maxBikes = 8 } = {}) {
  const root = new THREE.Group();
  root.name = 'vehicles';
  scene.add(root);

  const carPool = [];
  const bikePool = [];
  const active = [];
  let pedestrians = null;
  const tmp = new THREE.Vector2();

  // cars avoid the narrowest country lanes so they never look wedged in
  const drivable = graph.edgesOfClass(['main', 'minor']);

  function obtain(kind) {
    const pool = kind === 'car' ? carPool : bikePool;
    let v = pool.pop();
    if (!v) {
      v = {
        kind,
        group: kind === 'car' ? makeCar(rng) : makeCyclist(rng),
      };
      v.group.userData.trafficKind = kind;
      root.add(v.group);
    }
    v.group.visible = true;
    return v;
  }

  function spawn(v) {
    const pool = v.kind === 'car' ? drivable : graph.edges;
    v.baseSpeed = v.kind === 'car' ? rng.range(5.5, 8.5) : rng.range(3, 4.4);
    v.speed = v.baseSpeed;
    v.stopTimer = 0;
    v.stopUntil = 0;
    v.yielding = false;
    v.trafficYieldTime = 0;
    v.trafficYieldStartedAt = 0;
    v.trafficYieldOriginX = v.group.position.x;
    v.trafficYieldOriginZ = v.group.position.z;
    v.trafficPriorityDistance = 0;
    v.trafficPriorityTime = 0;
    v.nextStop = rng.range(8, 30);
    for (let attempt = 0; attempt < 16; attempt++) {
      const edge = pool[Math.floor(rng() * pool.length)];
      v.edge = edge;
      v.forward = rng.chance(0.5);
      v.t = rng.range(0, edge.length);
      setLateral(v);
      place(v, true);
      if (!pedestrians?.hasAgentNear(v.group.position.x, v.group.position.z, 2.2)) break;
    }
  }

  function setLateral(v) {
    // left-hand traffic: cars sit on the left half of the carriageway,
    // bicycles hug the kerb just inside the sidewalk
    v.lateral = v.kind === 'car' ? -v.edge.width * 0.25 : -(v.edge.width / 2 - 0.65);
  }

  function place(v, snap = false) {
    graph.pointOn(v.edge, v.t, v.forward, v.lateral, tmp);
    const y = v.kind === 'car' ? 0.16 : 0.22;
    const prevX = v.group.position.x;
    const prevZ = v.group.position.z;
    v.group.position.set(tmp.x, y, tmp.y);
    const dx = v.forward ? v.edge.dir.x : -v.edge.dir.x;
    const dz = v.forward ? v.edge.dir.y : -v.edge.dir.y;
    const heading = Math.atan2(dx, dz);
    if (snap) {
      v.group.rotation.y = heading;
    } else {
      let delta = heading - v.group.rotation.y;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      v.group.rotation.y += delta * 0.2;
      void prevX;
      void prevZ;
    }
  }

  /** Every path that asks a vehicle to wait must pass through this counter. */
  function requestTrafficYield(v, now) {
    if (!v.trafficYieldStartedAt) {
      v.trafficYieldStartedAt = now;
      v.trafficYieldOriginX = v.group.position.x;
      v.trafficYieldOriginZ = v.group.position.z;
    }
    const waitedMs = now - v.trafficYieldStartedAt;
    v.trafficYieldTime = waitedMs / 1000;
    if (waitedMs < MAX_TRAFFIC_YIELD_MS) {
      v.yielding = true;
      return true;
    }
    v.trafficYieldTime = 0;
    v.trafficYieldStartedAt = 0;
    v.trafficPriorityDistance = VEHICLE_PRIORITY_DISTANCE;
    v.trafficPriorityTime = 1;
    v.yielding = false;
    return false;
  }

  function advance(v, dt) {
    // slow into junctions, accelerate away from them
    const toEnd = v.edge.length - v.t;
    const nearJunction = Math.min(v.t, toEnd);
    const factor = nearJunction < 8 ? 0.55 + (nearJunction / 8) * 0.45 : 1;

    const now = performance.now();
    v.stopTimer = Math.max(0, (v.stopUntil - now) / 1000);
    const priorityActive = v.trafficPriorityDistance > 0;
    v.trafficPriorityTime = priorityActive ? 1 : 0;
    const crossingBlocked = !priorityActive && nearJunction < 7
      && pedestrians?.hasCrossingNear(v.group.position.x, v.group.position.z, v.kind === 'car' ? 3.2 : 2.4);
    let yieldRequested = Boolean(crossingBlocked);
    let yielding = yieldRequested ? requestTrafficYield(v, now) : false;
    v.yielding = yielding;

    if (yielding) {
      v.speed += (0 - v.speed) * Math.min(1, dt * 7);
    } else if (priorityActive || v.trafficPriorityDistance > 0) {
      v.speed += (v.baseSpeed * factor - v.speed) * Math.min(1, dt * 2);
      // This first decisive step must remain observable even when the render
      // loop is running at only a few frames per second under maximum load.
      v.speed = Math.max(v.speed, 3.2);
    } else if (v.stopTimer > 0) {
      v.speed += (0 - v.speed) * Math.min(1, dt * 4);
    } else {
      v.speed += (v.baseSpeed * factor - v.speed) * Math.min(1, dt * 2);
      v.nextStop -= dt;
      if (v.nextStop <= 0) {
        v.stopTimer = rng.range(0.8, 2.4);
        v.stopUntil = now + v.stopTimer * 1000;
        v.nextStop = rng.range(12, 40);
      }
    }

    const previous = { edge: v.edge, forward: v.forward, t: v.t, lateral: v.lateral };
    const advanceDistance = v.speed * dt;
    v.t += advanceDistance;
    if (v.trafficPriorityDistance > 0) {
      v.trafficPriorityDistance = Math.max(0, v.trafficPriorityDistance - advanceDistance);
    }
    if (v.t >= v.edge.length) {
      const node = v.forward ? v.edge.b : v.edge.a;
      const options = (v.kind === 'car'
        ? node.edges.filter((e) => e.cls !== 'lane')
        : node.edges
      ).filter((e) => e !== v.edge);
      const next = options.length ? options[Math.floor(rng() * options.length)] : v.edge;
      v.edge = next;
      v.forward = next.a === node;
      v.t = 0;
      setLateral(v);
    }

    // Test the actual next graph position, including the lateral jump produced
    // by changing edges at a junction. Roll back this frame if a pedestrian is
    // already occupying that space; the pedestrian can then finish crossing.
    graph.pointOn(v.edge, v.t, v.forward, v.lateral, tmp);
    const clearance = v.kind === 'car' ? 2 : 1.15;
    const proximityBlocked = !priorityActive && v.trafficPriorityDistance <= 0
      && pedestrians?.hasAgentNear(tmp.x, tmp.y, clearance);
    if (proximityBlocked) {
      // This rollback path used to set `yielding` without touching the timeout,
      // while the top-of-frame junction path reset that timeout. The result was
      // an unlimited wait. Feed both causes through the same breaker.
      if (!yieldRequested) {
        yieldRequested = true;
        yielding = requestTrafficYield(v, now);
      }
      if (yielding) {
        v.edge = previous.edge;
        v.forward = previous.forward;
        v.t = previous.t;
        v.lateral = previous.lateral;
        v.yielding = true;
        v.speed += (0 - v.speed) * Math.min(1, dt * 9);
      }
    }
    place(v);
    if (v.trafficYieldStartedAt) {
      const cleared = Math.hypot(
        v.group.position.x - v.trafficYieldOriginX,
        v.group.position.z - v.trafficYieldOriginZ
      ) >= 0.5;
      const finishedPriority = priorityActive && v.trafficPriorityDistance <= 0;
      // A one-frame gap in the proximity predicate must not erase the wait
      // history while the vehicle is still physically in the same pileup.
      if ((!yieldRequested && cleared && !priorityActive) || finishedPriority) {
        v.trafficYieldTime = 0;
        v.trafficYieldStartedAt = 0;
      }
    }
    v.group.userData.speed = v.speed;
    v.group.userData.yielding = Boolean(v.yielding);
    v.group.userData.trafficYieldTime = v.trafficYieldTime;
    v.group.userData.trafficPriorityDistance = v.trafficPriorityDistance;
    if (v.kind === 'bike' && v.group.userData.rider) {
      v.group.userData.rider.position.y = 0.75 + Math.abs(Math.sin(v.t * 3)) * 0.04;
    }
  }

  return {
    root,

    /** Connected after both pooled systems exist; avoids a constructor cycle. */
    setPedestrians(system) {
      pedestrians = system;
    },

    /**
     * Predict a short closest approach. Pedestrians call this only while
     * leaving the sidewalk route, so this remains far cheaper than all-pairs
     * avoidance every frame.
     */
    hasApproachingAgent(x, z, vx, vz) {
      for (const v of active) {
        const dx = v.group.position.x - x;
        const dz = v.group.position.z - z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > 36) continue;
        const travelX = (v.forward ? v.edge.dir.x : -v.edge.dir.x) * v.speed;
        const travelZ = (v.forward ? v.edge.dir.y : -v.edge.dir.y) * v.speed;
        // A stopped vehicle is not approaching. Without this guard, the
        // pedestrian's own velocity makes a stationary car look like a
        // relative-motion threat and both agents can wait forever.
        if (travelX * travelX + travelZ * travelZ < 0.25) continue;
        const rvx = travelX - vx;
        const rvz = travelZ - vz;
        const speedSq = rvx * rvx + rvz * rvz;
        if (speedSq < 0.04) continue;
        const approach = dx * rvx + dz * rvz;
        // Only predict closest approach while the separation is shrinking;
        // tangential or receding traffic must not trigger a yield.
        if (approach >= -0.08) continue;
        const time = speedSq > 0.01
          ? Math.max(0, Math.min(0.9, -(dx * rvx + dz * rvz) / speedSq))
          : 0;
        const closestX = dx + rvx * time;
        const closestZ = dz + rvz * time;
        const clearance = v.kind === 'car' ? 2.2 : 1.35;
        if (closestX * closestX + closestZ * closestZ < clearance * clearance) return true;
      }
      return false;
    },

    hasAgentNear(x, z, radius) {
      const rr = radius * radius;
      return active.some((v) => {
        const dx = v.group.position.x - x;
        const dz = v.group.position.z - z;
        return dx * dx + dz * dz < rr;
      });
    },

    /** Cars and bikes both scale with how built-up the town is. */
    setTraffic(cars, bikes) {
      const wantCars = Math.min(maxCars, Math.max(0, Math.round(cars)));
      const wantBikes = Math.min(maxBikes, Math.max(0, Math.round(bikes)));
      const counts = { car: 0, bike: 0 };
      for (const v of active) counts[v.kind]++;

      while (counts.car < wantCars) {
        const v = obtain('car');
        spawn(v);
        active.push(v);
        counts.car++;
      }
      while (counts.bike < wantBikes) {
        const v = obtain('bike');
        spawn(v);
        active.push(v);
        counts.bike++;
      }
      for (let i = active.length - 1; i >= 0; i--) {
        const v = active[i];
        const over = v.kind === 'car' ? counts.car > wantCars : counts.bike > wantBikes;
        if (!over) continue;
        counts[v.kind]--;
        v.group.visible = false;
        (v.kind === 'car' ? carPool : bikePool).push(v);
        active.splice(i, 1);
      }
    },

    update(dt) {
      for (const v of active) advance(v, dt);
    },
  };
}

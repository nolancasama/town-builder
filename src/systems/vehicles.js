import * as THREE from 'three';
import { makeCar, makeBicycle } from '../world/props.js';
import { mat, box, sphere, mesh } from '../core/materials.js';

const MAX_TRAFFIC_YIELD_MS = 1800;
const VEHICLE_PRIORITY_DISTANCE = 3.2;
const TRAFFIC_CELL_SIZE = 8;
const CAR_WIDTH = 1.9;
const PEDESTRIAN_CLEARANCE = 0.4;

/* ---------------- car spacing (cosmetic only) ---------------- */
/**
 * Cars pass through one another.
 *
 * Traffic here is moving scenery, not gameplay, and every attempt to make it
 * collision-correct cost more than it bought. Hard blocking produced junction
 * gridlock; the machinery added to resolve that - admission control, arrival
 * fairness, forced winners, a recycle failsafe - was a traffic simulation
 * bolted onto a decoration, and it still left cars stationary for up to ten
 * seconds. Overlapping cars are a smaller visual problem than parked ones.
 *
 * What remains is presentational: a car eases off behind another so a line of
 * traffic looks like a line of traffic. It is bounded below by
 * FOLLOW_MIN_FACTOR and so can never reach zero, which makes a car-caused
 * deadlock impossible by construction rather than by timeout.
 */
const FOLLOW_SLOW_GAP = 7.0;
const FOLLOW_LOOKAHEAD = 16;
const FOLLOW_LANE_HALF_WIDTH = CAR_WIDTH * 0.75;
/** A car never drops below this fraction of its own cruising speed. */
const FOLLOW_MIN_FACTOR = 0.45;
/** Minimum spacing enforced at spawn, where it is free to get right. */
const SPAWN_CLEARANCE = 1.1;

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
  const trafficBuckets = new Map();
  // diagnostics for the traffic audits; not used by gameplay
  const stats = { recycles: 0 };

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
      const length = v.kind === 'car' ? (v.group.userData.length || 3.8) : 1.3;
      const onAPedestrian = pedestrians?.hasAgentInVehiclePath(
        v.group.position.x,
        v.group.position.z,
        v.group.rotation.y,
        length,
        PEDESTRIAN_CLEARANCE
      );
      // Also refuse to appear inside another vehicle. Traffic is re-seeded
      // whenever the town's liveliness changes, so without this a car can drop
      // straight on top of one already driving there.
      if (!onAPedestrian && !overlapsTraffic(v)) break;
    }
  }

  /** Is this vehicle's body currently intersecting another active one? */
  function overlapsTraffic(v) {
    const myHalf = halfLength(v);
    for (const o of active) {
      if (o === v || !o.group.visible) continue;
      const dx = o.group.position.x - v.group.position.x;
      const dz = o.group.position.z - v.group.position.z;
      // Generous circular test: cheap, and spawning is not a hot path.
      if (Math.hypot(dx, dz) < myHalf + halfLength(o) + SPAWN_CLEARANCE) return true;
    }
    return false;
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

  /** Half the body length of a vehicle, used for bumper-to-bumper maths. */
  function halfLength(v) {
    return (v.group.userData.length || (v.kind === 'car' ? 3.8 : 1.6)) / 2;
  }

  /**
   * Bumper-to-bumper gap to the nearest vehicle ahead in the same lane, or
   * Infinity if the road ahead is clear.
   *
   * Works in world space by projecting onto the vehicle's own heading rather
   * than comparing `t` on a shared edge, so a queue still forms across a
   * junction and round a bend, where the car in front is on a different edge.
   * Oncoming traffic is naturally excluded: it sits on the other half of the
   * carriageway, so its lateral offset is far outside the lane corridor.
   */
  function leadVehicle(v) {
    const hx = Math.sin(v.group.rotation.y);
    const hz = Math.cos(v.group.rotation.y);
    const myHalf = halfLength(v);
    let best = Infinity;
    let lead = null;
    for (const o of nearbyVehicles(v.group.position.x, v.group.position.z, FOLLOW_LOOKAHEAD)) {
      if (o === v || !o.group.visible) continue;
      const dx = o.group.position.x - v.group.position.x;
      const dz = o.group.position.z - v.group.position.z;
      const along = dx * hx + dz * hz;
      if (along <= 0) continue;                                  // behind me
      const across = Math.abs(dx * hz - dz * hx);
      if (across > FOLLOW_LANE_HALF_WIDTH + halfWidthOf(o)) continue;  // another lane
      const gap = along - myHalf - halfLength(o);
      if (gap < best) { best = gap; lead = o; }
    }
    return { gap: best, lead };
  }

  function gapAhead(v) {
    return leadVehicle(v).gap;
  }

  function halfWidthOf(o) {
    return o.kind === 'car' ? CAR_WIDTH / 2 : 0.4;
  }

  /**
   * Cosmetic speed ceiling from the car in front: eases off as the gap closes
   * but never below FOLLOW_MIN_FACTOR of cruising speed, so no car can ever be
   * brought to a stop by another car.
   */
  function followSpeedCap(v) {
    const gap = gapAhead(v);
    if (gap >= FOLLOW_SLOW_GAP) return v.baseSpeed;
    const ratio = Math.max(0, gap) / FOLLOW_SLOW_GAP;
    return v.baseSpeed * (FOLLOW_MIN_FACTOR + (1 - FOLLOW_MIN_FACTOR) * ratio);
  }

  function bucketKey(x, z) {
    return `${Math.floor(x / TRAFFIC_CELL_SIZE)}:${Math.floor(z / TRAFFIC_CELL_SIZE)}`;
  }

  function rebuildTrafficBuckets() {
    trafficBuckets.clear();
    for (const v of active) {
      const key = bucketKey(v.group.position.x, v.group.position.z);
      let bucket = trafficBuckets.get(key);
      if (!bucket) {
        bucket = [];
        trafficBuckets.set(key, bucket);
      }
      bucket.push(v);
    }
  }

  function nearbyVehicles(x, z, radius) {
    const nearby = [];
    const minX = Math.floor((x - radius) / TRAFFIC_CELL_SIZE);
    const maxX = Math.floor((x + radius) / TRAFFIC_CELL_SIZE);
    const minZ = Math.floor((z - radius) / TRAFFIC_CELL_SIZE);
    const maxZ = Math.floor((z + radius) / TRAFFIC_CELL_SIZE);
    for (let cellX = minX; cellX <= maxX; cellX++) {
      for (let cellZ = minZ; cellZ <= maxZ; cellZ++) {
        const bucket = trafficBuckets.get(`${cellX}:${cellZ}`);
        if (bucket) nearby.push(...bucket);
      }
    }
    return nearby;
  }

  function pointNearBody(v, x, z, margin) {
    const dx = x - v.group.position.x;
    const dz = z - v.group.position.z;
    const cosine = Math.cos(v.group.rotation.y);
    const sine = Math.sin(v.group.rotation.y);
    const localX = dx * cosine - dz * sine;
    const localZ = dx * sine + dz * cosine;
    const halfWidth = v.kind === 'car' ? CAR_WIDTH / 2 : 0.45;
    const halfLength = v.kind === 'car' ? (v.group.userData.length || 3.8) / 2 : 0.75;
    return Math.abs(localX) < halfWidth + margin
      && Math.abs(localZ) < halfLength + margin;
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
      && pedestrians?.hasCrossingNear(v.group.position.x, v.group.position.z, v.kind === 'car' ? 5.5 : 2.8);
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

    // Queue behind whatever is in front. Applied after the other speed rules so
    // it can only ever slow a vehicle down, never speed one up past a junction
    // limit or override a pedestrian yield. A vehicle already claiming priority
    // through a crossing still has to stop for a solid car ahead of it.
    // Presentational spacing only; this can slow a car but never stop it.
    const followCap = followSpeedCap(v);
    if (v.speed > followCap) {
      v.speed += (followCap - v.speed) * Math.min(1, dt * 8);
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
    const travelX = v.forward ? v.edge.dir.x : -v.edge.dir.x;
    const travelZ = v.forward ? v.edge.dir.y : -v.edge.dir.y;
    const nextHeading = Math.atan2(travelX, travelZ);
    const proximityBlocked = pedestrians?.hasAgentInVehiclePath(
      tmp.x,
      tmp.y,
      nextHeading,
      v.kind === 'car' ? (v.group.userData.length || 3.8) : 1.3,
      v.kind === 'car' ? PEDESTRIAN_CLEARANCE : 0.3
    );
    if (proximityBlocked) {
      // This rollback path used to set `yielding` without touching the timeout,
      // while the top-of-frame junction path reset that timeout. The result was
      // an unlimited wait. Feed both causes through the same breaker.
      if (!priorityActive && !yieldRequested) {
        yieldRequested = true;
        yielding = requestTrafficYield(v, now);
      }
      if (yielding || priorityActive || v.trafficPriorityDistance > 0) {
        v.edge = previous.edge;
        v.forward = previous.forward;
        v.t = previous.t;
        v.lateral = previous.lateral;
        v.yielding = yielding;
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
    // Cheap introspection for the traffic audits in .ai/ - no per-frame cost
    // beyond three assignments, and it makes a jam diagnosable.
    v.group.userData.followGap = v.kind === 'car' ? gapAhead(v) : Infinity;
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
      for (const v of nearbyVehicles(x, z, 6)) {
        const dx = v.group.position.x - x;
        const dz = v.group.position.z - z;
        const distanceSq = dx * dx + dz * dz;
        if (distanceSq > 36) continue;
        const travelX = (v.forward ? v.edge.dir.x : -v.edge.dir.x) * v.speed;
        const travelZ = (v.forward ? v.edge.dir.y : -v.edge.dir.y) * v.speed;
        // An ordinary stopped vehicle is not approaching. A priority vehicle
        // is the exception: it may be physically held for the one walker
        // already retreating, and must keep new walkers on the kerb until its
        // short right-of-way window has cleared the crossing.
        if (travelX * travelX + travelZ * travelZ < 0.25
          && v.trafficPriorityDistance <= 0) continue;
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
        const cosine = Math.cos(v.group.rotation.y);
        const sine = Math.sin(v.group.rotation.y);
        const localX = closestX * cosine - closestZ * sine;
        const localZ = closestX * sine + closestZ * cosine;
        const halfWidth = (v.kind === 'car' ? CAR_WIDTH / 2 : 0.45) + PEDESTRIAN_CLEARANCE;
        const halfLength = (v.kind === 'car' ? (v.group.userData.length || 3.8) / 2 : 0.75)
          + PEDESTRIAN_CLEARANCE;
        if (Math.abs(localX) < halfWidth && Math.abs(localZ) < halfLength) return true;
      }
      return false;
    },

    hasAgentNear(x, z, margin = PEDESTRIAN_CLEARANCE) {
      return nearbyVehicles(x, z, 3.2 + margin).some((v) => pointNearBody(v, x, z, margin));
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
      rebuildTrafficBuckets();
    },

    update(dt) {
      for (const v of active) advance(v, dt);
      rebuildTrafficBuckets();
    },

    /** Traffic diagnostics for .ai/ audits. */
    stats() {
      return { ...stats, active: active.length };
    },
  };
}

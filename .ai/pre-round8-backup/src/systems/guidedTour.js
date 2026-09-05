import * as THREE from 'three';
import { wait, Ease, damp } from '../core/tween.js';
import { createPortrait } from './portrait.js';
import { makeGuide, makeTourist, poseWalk, poseIdle, poseTalk, poseLook, posePoint, poseShoot, poseCheer, relax, closeMouth } from '../world/characters.js';

/**
 * PHASE 3 - THE GUIDED TOUR
 * -------------------------
 * The child's avatar walks a group of visitors around the town they built, and
 * presents each place using the child's *own recorded voice* from phases one
 * and two. Nothing here is scripted dialogue: a place the child skipped simply
 * gets its one sentence, and the guide never says anything the child did not.
 *
 * The group walks the same road graph the townspeople use - offset onto the
 * sidewalk - so nobody strolls through a building. Route order is nearest-hop,
 * so the tour works its way round the town instead of crossing it repeatedly.
 */

const GUIDE_SPEED = 4.6;
const ARRIVE = 1.6;

export function createGuidedTour({
  scene, rig, graph, landmarks, records, rng, audio, recorder, particles, activities, hud, pedestrians,
}) {
  const root = new THREE.Group();
  root.name = 'guided-tour';
  root.visible = false;
  scene.add(root);

  const guide = makeGuide(rng);
  root.add(guide);

  // the same person again, for the large speaking cut-in
  const portrait = createPortrait({ rng, spec: guide.userData.spec });

  const tourists = [];
  const touristCount = rng.int(5, 7);
  for (let i = 0; i < touristCount; i++) {
    const t = makeTourist(rng);
    t.userData.slot = i;
    t.userData.lag = 1.4 + i * 0.55 + rng.range(-0.2, 0.2);
    t.userData.side = (i % 2 ? 1 : -1) * (0.9 + Math.floor(i / 2) * 0.75);
    t.userData.timer = rng.range(0, 3);
    t.userData.state = 'idle';
    root.add(t);
    tourists.push(t);
  }

  /* ---------------- movement state ---------------- */
  const trail = [];                       // guide breadcrumbs for the followers
  let waypoints = [];
  let waypointIndex = 0;
  let walking = false;
  let cameraMode = 'hold';
  const groupCentre = new THREE.Vector3();
  const desiredCam = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();
  let cancelled = false;
  let clock = 0;          // game time, so pacing does not depend on frame rate
  let mouthLevel = 0;
  let talking = false;
  let pointing = false;
  let focusPoint = null;
  let guideFacing = null;

  /* ---------------- route planning ---------------- */

  /** Cheap Dijkstra over the road graph - it is only a few dozen nodes. */
  function pathBetween(startNode, endNode) {
    if (startNode === endNode) return [startNode];
    const dist = new Map([[startNode, 0]]);
    const prev = new Map();
    const queue = [startNode];
    const seen = new Set();
    while (queue.length) {
      queue.sort((a, b) => (dist.get(a) || 0) - (dist.get(b) || 0));
      const node = queue.shift();
      if (node === endNode) break;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const edge of node.edges) {
        const next = edge.a === node ? edge.b : edge.a;
        const cost = (dist.get(node) || 0) + edge.length;
        if (cost < (dist.has(next) ? dist.get(next) : Infinity)) {
          dist.set(next, cost);
          prev.set(next, node);
          queue.push(next);
        }
      }
    }
    const path = [];
    let cursor = endNode;
    while (cursor && cursor !== startNode) {
      path.unshift(cursor);
      cursor = prev.get(cursor);
    }
    path.unshift(startNode);
    return path;
  }

  /** Turn a node path into sidewalk-side waypoints. */
  function walkableRoute(from, to) {
    const startNode = graph.nearestNode(from.x, from.z);
    const endNode = graph.nearestNode(to.x, to.z);
    const nodes = pathBetween(startNode, endNode);
    const points = [];
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const next = nodes[i + 1];
      if (!next) {
        points.push(new THREE.Vector3(node.pos.x, 0, node.pos.y));
        break;
      }
      const edge = node.edges.find((e) => e.a === next || e.b === next);
      const offset = edge ? edge.width / 2 + 1.3 : 2.5;
      const forward = edge && edge.a === node;
      const rx = edge ? edge.right.x * (forward ? 1 : -1) : 0;
      const rz = edge ? edge.right.y * (forward ? 1 : -1) : 0;
      points.push(new THREE.Vector3(node.pos.x + rx * offset, 0, node.pos.y + rz * offset));
      points.push(new THREE.Vector3(next.pos.x + rx * offset, 0, next.pos.y + rz * offset));
    }
    points.push(new THREE.Vector3(to.x, 0, to.z));
    return points;
  }

  /** Where the group stands to be told about a place. */
  function presentationPoint(holder) {
    const lot = holder.userData.lot;
    return new THREE.Vector3(lot.entrance[0], 0, lot.entrance[1]);
  }

  /** Order the stops so the walk works round the town, not across it. */
  function routeOrder(stops) {
    const remaining = stops.slice();
    if (remaining.length <= 2) return remaining;
    const posOf = (stop) => landmarks.get(stop.placeId).position;
    let current = remaining.reduce(
      (far, s) => (posOf(s).length() > posOf(far).length() ? s : far),
      remaining[0]
    );
    const route = [current];
    remaining.splice(remaining.indexOf(current), 1);
    while (remaining.length) {
      const from = posOf(current);
      let best = remaining[0];
      let bestD = Infinity;
      for (const stop of remaining) {
        const d = from.distanceTo(posOf(stop));
        if (d < bestD) {
          bestD = d;
          best = stop;
        }
      }
      route.push(best);
      remaining.splice(remaining.indexOf(best), 1);
      current = best;
    }
    return route;
  }

  /* ---------------- per-frame update ---------------- */

  function updateGroup(dt) {
    // --- guide walks the waypoint list ---
    if (walking && waypointIndex < waypoints.length) {
      const target = waypoints[waypointIndex];
      const dx = target.x - guide.position.x;
      const dz = target.z - guide.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < ARRIVE) {
        waypointIndex += 1;
      } else {
        const step = Math.min(dist, GUIDE_SPEED * dt);
        guide.position.x += (dx / dist) * step;
        guide.position.z += (dz / dist) * step;
        const heading = Math.atan2(dx, dz);
        let delta = heading - guide.rotation.y;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        guide.rotation.y += delta * Math.min(1, dt * 4);
        poseWalk(guide, dt, 1.5);
      }
      // breadcrumb trail for the followers
      const last = trail[trail.length - 1];
      if (!last || last.distanceToSquared(guide.position) > 0.36) {
        trail.push(guide.position.clone());
        if (trail.length > 240) trail.shift();
      }
    } else if (!talking) {
      poseIdle(guide, dt);
    }

    // --- tourists follow along the guide's trail, loosely ---
    for (const t of tourists) {
      const d = t.userData;
      if (walking && trail.length > 4) {
        const index = Math.max(0, trail.length - 1 - Math.round(d.lag * 6));
        const point = trail[index];
        const dx = point.x - t.position.x + d.side * 0.6;
        const dz = point.z - t.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.5) {
          const speed = Math.min(GUIDE_SPEED * 1.15, 2 + dist * 1.1);
          const step = Math.min(dist, speed * dt);
          t.position.x += (dx / dist) * step;
          t.position.z += (dz / dist) * step;
          const heading = Math.atan2(dx, dz);
          let delta = heading - t.rotation.y;
          while (delta > Math.PI) delta -= Math.PI * 2;
          while (delta < -Math.PI) delta += Math.PI * 2;
          t.rotation.y += delta * Math.min(1, dt * 4);
          poseWalk(t, dt, 1.4 + d.slot * 0.05);
        } else {
          poseIdle(t, dt);
        }
        relax(t, dt);
      } else {
        // standing at a stop: looking, pointing, photographing, reacting
        poseIdle(t, dt);
        if (d.state === 'lookGuide') {
          poseLook(t, guide.position, dt, { turnBody: true, rate: 3 });
          relax(t, dt);
        } else if (d.state === 'lookLandmark' && focusPoint) {
          poseLook(t, focusPoint, dt, { turnBody: true, rate: 2.6 });
          relax(t, dt);
        } else if (d.state === 'point' && focusPoint) {
          poseLook(t, focusPoint, dt, { turnBody: true, rate: 3 });
          posePoint(t, dt, 1);
        } else if (d.state === 'photo' && focusPoint) {
          poseLook(t, focusPoint, dt, { turnBody: true, rate: 3.4 });
          poseShoot(t, dt, 1);
        } else if (d.state === 'cheer') {
          poseCheer(t, dt);
        } else {
          relax(t, dt);
        }
      }
    }

    // the guide's own presentation pose
    if (talking) {
      poseTalk(guide, dt, mouthLevel);
      if (focusPoint) poseLook(guide, focusPoint, dt, { rate: 2.4 });
    } else {
      closeMouth(guide, dt);
    }
    posePoint(guide, dt, pointing ? 1 : 0);
    if (guideFacing) poseLook(guide, guideFacing, dt, { turnBody: true, rate: 2.6 });

    // --- group centre, for the camera ---
    groupCentre.copy(guide.position);
    for (const t of tourists) groupCentre.add(t.position);
    groupCentre.divideScalar(tourists.length + 1);
  }

  /**
   * Camera work. While walking it tracks the group from behind and to one side,
   * slightly elevated; at a stop it holds whatever framing the arrival set up.
   * Deliberately calm - no swooping, so young children can follow it.
   */
  function updateCamera(dt) {
    if (cameraMode !== 'follow') return;
    const behind = new THREE.Vector3(Math.sin(guide.rotation.y), 0, Math.cos(guide.rotation.y));
    desiredCam.copy(groupCentre)
      .addScaledVector(behind, -13)
      .add(new THREE.Vector3(7, 9.5, 0));
    rig.camera.position.x = damp(rig.camera.position.x, desiredCam.x, 1.6, dt);
    rig.camera.position.y = damp(rig.camera.position.y, desiredCam.y, 2.2, dt);
    rig.camera.position.z = damp(rig.camera.position.z, desiredCam.z, 1.6, dt);
    lookTarget.copy(groupCentre).add(new THREE.Vector3(0, 1.4, 0));
    rig.lookAtVector.lerp(lookTarget, Math.min(1, dt * 3));
  }

  /* ---------------- talking ---------------- */

  /**
   * Speak one stored line. The child's recording plays if we have it; the
   * guide's mouth follows the actual loudness of that audio, so it really is
   * their voice coming out of the avatar.
   *
   * With no recording (older browser, or the microphone was declined) the line
   * is still presented on screen with plausible mouth movement, and the tour
   * carries on unchanged.
   */
  /** Put the cut-in on the side that will not cover what is being discussed. */
  function portraitSide(holder) {
    const projected = holder.position.clone().setY(6).project(rig.camera);
    if (!Number.isFinite(projected.x)) return 'left';
    return projected.x > 0 ? 'left' : 'right';
  }

  async function speak(line, holder) {
    if (!line || !line.transcript) return;
    talking = true;
    hud.showTourSubtitle(line.transcript);
    audio.duck(0.8);

    // both mouths move with the recording; the big one is the one that reads
    const onLevel = (level) => {
      mouthLevel = level;
      portrait.setLevel(level);
    };

    let played = false;
    if (line.buffer) {
      played = await recorder.play(line.buffer, { onLevel, gain: 1.4 });
    }
    if (!played) {
      // no audio: drive the mouth from a synthetic envelope instead
      const words = Math.max(2, line.transcript.split(/\s+/).length);
      const duration = Math.min(5, 0.34 * words + 0.5);
      let elapsed = 0;
      while (elapsed < duration && !cancelled) {
        // eslint-disable-next-line no-await-in-loop
        await wait(0.05);
        elapsed += 0.05;
        onLevel(0.25 + Math.abs(Math.sin(elapsed * 11)) * 0.55);
      }
      onLevel(0);
    }

    audio.duck(0);
    portrait.setLevel(0);
    hud.hideTourSubtitle();
    talking = false;
    void holder;
  }

  /* ---------------- stop choreography ---------------- */

  /** Stagger the group's reactions so they never move as one block. */
  function setTouristStates(assign) {
    tourists.forEach((t, i) => {
      const state = assign(t, i);
      if (state) t.userData.state = state;
    });
  }

  function takePhoto(tourist) {
    tourist.userData.state = 'photo';
    setTimeout(() => {
      if (cancelled) return;
      audio.shutter();
      const flash = tourist.userData.camera
        ? tourist.userData.camera.getWorldPosition(new THREE.Vector3())
        : tourist.position.clone().setY(1.8);
      particles.sparkle(flash, { count: 4, radius: 0.6, colorSet: [0xffffff, 0xfff8d8] });
      setTimeout(() => {
        if (!cancelled) tourist.userData.state = 'lookLandmark';
      }, 900);
    }, 700);
  }

  /** Places worth getting excited about get a bigger reaction than a bank. */
  function excitement(placeId) {
    const def = landmarks.get(placeId);
    return (def && def.userData.def.celebration) || 0.5;
  }

  /**
   * One stop: arrive, gather, present with the child's own recordings, let the
   * visitors react and photograph it, then move on.
   */
  async function presentStop(stop, index, total) {
    const holder = landmarks.get(stop.placeId);
    if (!holder) return;

    const stand = presentationPoint(holder);
    const landmarkPoint = holder.position.clone().setY(3);
    focusPoint = landmarkPoint;

    /* 1 - approach on foot */
    hud.setTourStop(index + 1, total, stop.displayName);
    waypoints = walkableRoute(guide.position, stand);
    waypointIndex = 0;
    walking = true;
    cameraMode = 'follow';
    setTouristStates(() => 'walk');

    const started = clock;
    while (walking && waypointIndex < waypoints.length && !cancelled) {
      // safety valve in game time - a long walk must not stall a lesson
      if (clock - started > 30) break;
      // eslint-disable-next-line no-await-in-loop
      await wait(0.1);
    }
    // close the last few metres so the group is really at the building
    let settle = 0;
    while (guide.position.distanceTo(stand) > 3.5 && settle < 4 && !cancelled) {
      guide.position.lerp(stand, 0.06);
      // eslint-disable-next-line no-await-in-loop
      await wait(0.05);
      settle += 0.05;
    }
    walking = false;
    if (cancelled) return;

    /* 2 - gather, and let the camera find the building */
    setTouristStates(() => 'lookGuide');
    guideFacing = groupCentre.clone();
    const framing = frameStop(holder, groupCentre.clone());
    cameraMode = 'hold';
    await rig.flyTo(framing.position, framing.target, 2.2, Ease.cubicInOut);
    if (cancelled) return;
    await wait(0.3);

    /* 3 - the cut-in appears, and stays up for the whole presentation */
    if (stop.build || stop.activity) {
      portrait.show(portraitSide(holder));
      await wait(0.3);
    }

    /* 4 - "We have a stadium in Matsubara." */
    if (stop.build) {
      pointing = true;
      guideFacing = null;
      // while the child's voice plays the group listens - nothing competes
      setTouristStates((t, i) => (i % 2 === 0 ? 'lookLandmark' : 'lookGuide'));
      await speak(stop.build, holder);
      pointing = false;
      if (cancelled) return;
      await wait(0.35);
    }

    /* 5 - "We can watch soccer in the stadium." (only if they said it) */
    if (stop.activity) {
      guideFacing = groupCentre.clone();
      setTouristStates(() => 'lookGuide');
      await wait(0.2);
      pointing = true;
      await speak(stop.activity, holder);
      pointing = false;
      if (cancelled) return;
      guideFacing = null;
    }

    /* 6 - the cut-in leaves, and only then does the group pipe up */
    portrait.hide();
    setTouristStates(() => 'lookLandmark');
    await wait(0.4);

    const strong = excitement(stop.placeId) >= 0.7;
    audio.react(0.9 + rng.range(-0.1, 0.2));
    if (strong) {
      const pointer = tourists[rng.int(0, tourists.length - 1)];
      pointer.userData.state = 'point';
      await wait(0.4);
      audio.react(1.15);
    }
    if (pedestrians) {
      const lot = holder.userData.lot;
      pedestrians.addAttraction(lot.entrance[0], lot.entrance[1], lot.rot);
    }
    await wait(0.4);

    /* 7 - photographs, but not from everybody every time */
    const shooters = tourists.filter((t) => t.userData.shoots);
    const wanted = excitement(stop.placeId) >= 0.7 ? 2 : 1;
    for (let i = 0; i < Math.min(wanted, shooters.length); i++) {
      const pick = shooters[(rng.int(0, shooters.length - 1) + i) % shooters.length];
      if (rng.chance(0.85)) takePhoto(pick);
      // eslint-disable-next-line no-await-in-loop
      await wait(0.4);
    }
    await wait(1.2);
    focusPoint = null;
  }

  /**
   * A medium shot that has to contain two things: the guide presenting, and the
   * building she is presenting. Candidate positions are tried around and above
   * the group until one can actually see both - without this the shot
   * occasionally sets up behind a neighbouring roof and the child watches a
   * blank wall while their own sentence plays.
   */
  const _ray = new THREE.Raycaster();
  const _dir = new THREE.Vector3();

  function canSee(from, to, ignore = null) {
    _dir.subVectors(to, from);
    const span = _dir.length();
    _dir.normalize();
    _ray.set(from, _dir);
    _ray.far = span * 0.9;
    const blockers = scene.children.filter(
      (child) => child.visible && child !== root && child !== ignore && child.name !== 'clouds' && child.name !== 'birds'
    );
    return _ray.intersectObjects(blockers, true).every((hit) => hit.distance < 1.5);
  }

  function frameStop(holder, groupAt) {
    const bounds = new THREE.Box3().setFromObject(holder);
    const height = Math.max(6, bounds.max.y);
    const lot = holder.userData.lot;
    const usableSize = lot.buildSize || lot.size;
    const span = Math.max(usableSize[0], usableSize[1]);

    const away = new THREE.Vector3().subVectors(groupAt, holder.position).setY(0);
    if (away.lengthSq() < 0.01) away.set(0, 0, 1);
    away.normalize();
    const side = new THREE.Vector3(-away.z, 0, away.x);

    const target = groupAt.clone().lerp(holder.position, 0.26).setY(Math.min(height * 0.3, 5.5));
    const landmarkPoint = holder.position.clone().setY(Math.min(height * 0.55, 12));
    const groupPoint = groupAt.clone().setY(1.6);
    const distance = Math.max(22, span * 0.5 + 17);

    const place = (sideMul, lift) =>
      groupAt
        .clone()
        .addScaledVector(away, distance * 0.6)
        .addScaledVector(side, distance * sideMul)
        .add(new THREE.Vector3(0, Math.max(10, height * 0.75) + lift, 0));

    let fallback = null;
    for (const lift of [0, 4, 9, 15, 22]) {
      for (const sideMul of [0.45, -0.45, 0.85, -0.85, 0.05]) {
        const candidate = place(sideMul, lift);
        if (!fallback) fallback = candidate;
        if (canSee(candidate, groupPoint) && canSee(candidate, landmarkPoint, holder)) {
          return { position: candidate, target };
        }
      }
    }
    return { position: fallback, target };
  }

  /* ---------------- the whole tour ---------------- */

  /** Put the group on the map, just outside the first stop. */
  function placeGroup(near) {
    const node = graph.nearestNode(near.x, near.z);
    const start = new THREE.Vector3(node.pos.x, 0, node.pos.y);
    guide.position.copy(start);
    trail.length = 0;
    tourists.forEach((t, i) => {
      t.position.set(
        start.x + t.userData.side * 1.1 + rng.range(-0.6, 0.6),
        0,
        start.z - 1.6 - i * 0.9 + rng.range(-0.4, 0.4)
      );
      t.rotation.y = rng.range(-0.4, 0.4);
      t.userData.state = 'idle';
    });
    root.visible = true;
  }

  return {
    root,
    guide,
    tourists,

    /** Decode every recording once, so playback never stutters mid-tour. */
    async prepare(stops) {
      for (const stop of stops) {
        for (const kind of ['build', 'activity']) {
          const line = stop[kind];
          if (line && line.audio && !line.buffer) {
            // eslint-disable-next-line no-await-in-loop
            line.buffer = await recorder.decode(line.audio);
          }
        }
      }
    },

    /**
     * Run the tour. Returns a small summary so the closing panel can say how
     * much of it was in the child's own voice.
     */
    async run(stopRecords) {
      cancelled = false;
      const stops = routeOrder(stopRecords.filter((s) => landmarks.has(s.placeId)));
      if (!stops.length) return { stops: 0, spoken: 0 };

      await this.prepare(stops);
      const first = landmarks.get(stops[0].placeId);
      placeGroup(presentationPoint(first));

      /* opening: establish the town, then find the group in it */
      rig.beginCinematic();
      await rig.flyTo(
        new THREE.Vector3(46, 74, 92),
        new THREE.Vector3(0, 2, -4),
        2.6,
        Ease.cubicInOut
      );
      if (cancelled) return { stops: 0, spoken: 0 };
      const opening = frameStop(first, guide.position.clone());
      await rig.flyTo(opening.position, opening.target, 2.8, Ease.cubicInOut);
      await wait(0.6);

      for (let i = 0; i < stops.length; i++) {
        if (cancelled) break;
        // eslint-disable-next-line no-await-in-loop
        await presentStop(stops[i], i, stops.length);
      }
      if (cancelled) return { stops: stops.length, spoken: 0 };

      /* closing: gather, applaud, and rise over the finished town */
      hud.hideTourSubtitle();
      cameraMode = 'hold';
      walking = false;
      setTouristStates(() => 'cheer');
      guideFacing = null;
      audio.applause(3.4);
      particles.confetti(guide.position.clone().setY(6), { count: 110, spread: 14, power: 15 });
      await rig.flyTo(
        guide.position.clone().add(new THREE.Vector3(8, 7, 13)),
        guide.position.clone().setY(1.6),
        2.4,
        Ease.cubicInOut
      );
      await wait(1.8);
      await rig.flyTo(
        new THREE.Vector3(52, 104, 118),
        new THREE.Vector3(0, 2, -4),
        4.2,
        Ease.cubicInOut
      );
      setTouristStates(() => 'idle');

      const spoken = stops.reduce(
        (n, s) => n + (s.build && s.build.buffer ? 1 : 0) + (s.activity && s.activity.buffer ? 1 : 0),
        0
      );
      const lines = stops.reduce((n, s) => n + (s.build ? 1 : 0) + (s.activity ? 1 : 0), 0);
      return { stops: stops.length, lines, spoken };
    },

    cancel() {
      cancelled = true;
      walking = false;
      talking = false;
      portrait.hide();
      portrait.setLevel(0);
      cameraMode = 'hold';
      audio.duck(0);
      root.visible = false;
    },

    hide() {
      root.visible = false;
    },

    update(dt) {
      if (!root.visible) return;
      clock += dt;
      updateGroup(dt);
      updateCamera(dt);
      portrait.update(dt);
    },

    /** Drawn after the town, into a scissored corner of the same canvas. */
    renderOverlay(renderer, width, height) {
      if (!root.visible) return null;
      return portrait.render(renderer, width, height);
    },

    portrait,
  };
}

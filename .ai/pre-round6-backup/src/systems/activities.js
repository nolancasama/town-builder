import * as THREE from 'three';
import { PALETTE as P, mat, glow, box, sphere, cylinder, roundedBox, mesh } from '../core/materials.js';
import { makePerson } from './pedestrians.js';
import { makeCar, makeBicycle } from '../world/props.js';

/**
 * ACTIVITY DIRECTOR
 * -----------------
 * Phase two's payoff: when a child says what people can do somewhere, the town
 * does it. `trigger(type, action, holder)` looks the animation up by name from
 * the registry data - there are no per-building branches in the speech code.
 *
 * Two deliberate rules:
 *   - activities PERSIST. The town keeps whatever it was told, so by the end of
 *     the tour a dozen things are happening at once and the child can see that
 *     their English did that.
 *   - activities ACCUMULATE. Saying "we can run in the stadium" later does not
 *     stop the baseball game; the runners join it.
 *
 * Actors are parented to the landmark itself, so they inherit its lot rotation
 * and are positioned in the same local space the building was modelled in.
 */

const UP = new THREE.Vector3(0, 1, 0);

export function createActivityDirector({ rng, particles, audio, pedestrians }) {
  /** Every running activity: { key, update(dt, time) } */
  const running = [];
  /** type -> Set of action ids already active, so repeats do not stack twice. */
  const activeByType = new Map();

  /* ---------------- shared actor helpers ---------------- */

  function stageFor(holder) {
    if (!holder.userData.stage) {
      const stage = new THREE.Group();
      stage.name = 'activity-stage';
      holder.add(stage);
      holder.userData.stage = stage;
    }
    return holder.userData.stage;
  }

  /** A little person, sized and dropped into the building's local space. */
  function actor(stage, x, z, { scale = 1, y = 0 } = {}) {
    const person = makePerson(rng);
    person.position.set(x, y, z);
    person.scale.multiplyScalar(scale);
    person.rotation.y = rng.range(0, Math.PI * 2);
    stage.add(person);
    return person;
  }

  /** Walk/idle animation borrowed from the pedestrian model's own rig. */
  function stride(person, dt, speed, moving = true) {
    const { legs, arms } = person.userData;
    if (!legs) return;
    if (moving) {
      person.userData.phase += dt * speed * 4.2;
      const s = Math.sin(person.userData.phase);
      legs[0].rotation.x = s * 0.7;
      legs[1].rotation.x = -s * 0.7;
      arms[0].rotation.x = -s * 0.5;
      arms[1].rotation.x = s * 0.5;
    } else {
      for (const l of legs) l.rotation.x *= 0.92;
      for (const a of arms) a.rotation.x *= 0.92;
    }
  }

  function register(key, update) {
    running.push({ key, update });
  }

  function lotSize(holder) {
    return holder.userData.lot.size;
  }

  /* ---------------- animation library ---------------- */

  const ANIMATIONS = {
    /**
     * People arrive and get on with something: walking, shopping, exercising,
     * bowing at a shrine. The workhorse behind most places.
     */
    crowd(holder, opts) {
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      const count = opts.count || 4;
      const spread = opts.spread || 0.5;
      const scale = opts.small ? 0.78 : 1;
      const people = [];

      for (let i = 0; i < count; i++) {
        const homeX = rng.range(-lw * spread * 0.5, lw * spread * 0.5);
        const homeZ = opts.spot === 'entrance'
          ? rng.range(ld * 0.2, ld * 0.44)
          : opts.spot === 'front'
            ? rng.range(ld * 0.1, ld * 0.4)
            : rng.range(-ld * spread * 0.5, ld * spread * 0.5);
        const person = actor(stage, homeX, homeZ, { scale });
        people.push({
          person,
          home: new THREE.Vector2(homeX, homeZ),
          target: new THREE.Vector2(homeX, homeZ),
          wait: rng.range(0, 2.5),
          speed: opts.mood === 'run' ? 3.6 : opts.mood === 'cycle' ? 4.2 : 1.7,
          phase: rng.range(0, 6.28),
        });
        if (opts.mood === 'cycle') {
          const bike = makeBicycle(rng);
          bike.position.y = -0.02;
          bike.scale.setScalar(1.05);
          person.add(bike);
          person.position.y = 0.32;
        }
        if (opts.prop === 'book') {
          person.add(mesh(box(0.5, 0.12, 0.36), mat(rng.pick([P.red, P.blue, P.yellow])), {
            y: 1.15, z: 0.32, cast: false, receive: false,
          }));
        }
        if (opts.mood === 'shop') {
          person.add(mesh(box(0.34, 0.42, 0.22), mat(rng.pick([0xffffff, 0xffd166, 0xef7d57])), {
            x: 0.42, y: 0.85, cast: false, receive: false,
          }));
        }
      }

      register(`${holder.userData.type}:crowd`, (dt) => {
        for (const it of people) {
          if (opts.mood === 'bow') {
            it.phase += dt * 0.9;
            it.person.rotation.x = Math.max(0, Math.sin(it.phase)) * 0.5;
            stride(it.person, dt, 1, false);
            continue;
          }
          if (opts.mood === 'photo') {
            it.phase += dt;
            stride(it.person, dt, 1, false);
            it.person.position.y = Math.abs(Math.sin(it.phase * 1.5)) * 0.05;
            continue;
          }
          if (opts.mood === 'exercise') {
            it.phase += dt * 3.4;
            const { arms } = it.person.userData;
            if (arms) {
              arms[0].rotation.x = -Math.abs(Math.sin(it.phase)) * 2.4;
              arms[1].rotation.x = -Math.abs(Math.sin(it.phase)) * 2.4;
            }
            it.person.position.y = Math.abs(Math.sin(it.phase)) * 0.14;
            continue;
          }
          // wander between little destinations
          it.wait -= dt;
          const pos = it.person.position;
          const dx = it.target.x - pos.x;
          const dz = it.target.y - pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 0.4) {
            if (it.wait <= 0) {
              it.target.set(
                it.home.x + rng.range(-lw * 0.18, lw * 0.18),
                it.home.y + rng.range(-ld * 0.18, ld * 0.18)
              );
              it.wait = rng.range(1, 4);
            }
            stride(it.person, dt, it.speed, false);
            if (opts.mood === 'play') {
              it.phase += dt * 4;
              pos.y = Math.abs(Math.sin(it.phase)) * 0.25;
            }
          } else {
            const step = Math.min(dist, it.speed * dt);
            pos.x += (dx / dist) * step;
            pos.z += (dz / dist) * step;
            it.person.rotation.y = Math.atan2(dx, dz);
            stride(it.person, dt, it.speed, true);
          }
        }
      });
    },

    /**
     * A game breaks out: baseball, soccer, running, basketball or just kids
     * kicking a ball about. Players hold positions and shuffle; the ball moves
     * between them so the eye has something to follow.
     */
    field(holder, opts) {
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      const scale = opts.scale || 1;
      const rx = (lw / 2 - 2) * 0.55 * scale;
      const rz = (ld / 2 - 2) * 0.55 * scale;
      const count = opts.count || 8;
      const players = [];

      const positions = [];
      if (opts.kind === 'baseball') {
        // pitcher, batter and a spread-out infield
        positions.push([0, 0], [0, rz * 0.55], [-rx * 0.5, -rz * 0.3], [rx * 0.5, -rz * 0.3]);
        for (let i = positions.length; i < count; i++) {
          const a = (i / count) * Math.PI * 2;
          positions.push([Math.cos(a) * rx * 0.75, Math.sin(a) * rz * 0.75]);
        }
      } else if (opts.kind === 'run') {
        for (let i = 0; i < count; i++) positions.push([0, 0]);
      } else {
        for (let i = 0; i < count; i++) {
          const side = i % 2 ? 1 : -1;
          positions.push([
            rng.range(-rx * 0.7, rx * 0.7),
            side * rng.range(rz * 0.15, rz * 0.8),
          ]);
        }
      }

      for (let i = 0; i < count; i++) {
        const [x, z] = positions[i] || [0, 0];
        const person = actor(stage, x, z, { y: 0.3 });
        players.push({
          person,
          home: new THREE.Vector2(x, z),
          angle: (i / count) * Math.PI * 2,
          phase: rng.range(0, 6.28),
          speed: rng.range(1.4, 2.2),
        });
      }

      // the ball
      const ball = mesh(sphere(opts.kind === 'baseball' ? 0.22 : 0.42, 8, 6), mat(0xffffff), {
        y: 1, cast: false, receive: false,
      });
      stage.add(ball);
      let ballT = 0;
      let from = new THREE.Vector2(0, rz * 0.55);
      let to = new THREE.Vector2(0, 0);

      let cheerTimer = 3;
      register(`${holder.userData.type}:field:${opts.kind}`, (dt, time) => {
        for (const p of players) {
          if (opts.kind === 'run') {
            // laps of the field
            p.angle += dt * (p.speed * 0.16);
            p.person.position.set(Math.cos(p.angle) * rx, 0.3, Math.sin(p.angle) * rz);
            p.person.rotation.y = -p.angle + Math.PI / 2;
            stride(p.person, dt, 3.4, true);
          } else {
            p.phase += dt * 1.6;
            p.person.position.x = p.home.x + Math.sin(p.phase) * 0.9;
            p.person.position.z = p.home.y + Math.cos(p.phase * 0.7) * 0.7;
            p.person.rotation.y = Math.atan2(-p.person.position.x, -p.person.position.z);
            stride(p.person, dt, 1.6, true);
          }
        }

        if (opts.kind !== 'run') {
          ballT += dt * 0.9;
          if (ballT >= 1) {
            ballT = 0;
            from = to.clone();
            const next = players[Math.floor(rng() * players.length)];
            to = next ? next.home.clone() : new THREE.Vector2(0, 0);
          }
          ball.position.x = from.x + (to.x - from.x) * ballT;
          ball.position.z = from.y + (to.y - from.y) * ballT;
          ball.position.y = 0.4 + Math.sin(ballT * Math.PI) * (opts.kind === 'baseball' ? 3 : 1.4);
        }

        // the stands react now and then, using the stadium's own cheer
        if (opts.cheer && typeof holder.userData.react === 'function') {
          cheerTimer -= dt;
          if (cheerTimer <= 0) {
            holder.userData.react();
            cheerTimer = rng.range(9, 15);
          }
        }
        void time;
      });
    },

    /**
     * The station. There is already exactly one train on this line, so this
     * calls it in rather than spawning another, and puts passengers on the
     * platform waiting for it.
     */
    train(holder, opts) {
      const model = holder.userData.model;
      const stage = stageFor(holder);
      const deckY = (model && model.userData.deckY) || 6.2;
      const waiting = [];

      for (let i = 0; i < (opts.passengers || 4); i++) {
        const person = actor(stage, rng.range(-9, 9), rng.range(1.6, 3.4), { y: deckY + 0.5 });
        waiting.push({ person, phase: rng.range(0, 6.28) });
      }

      const call = () => {
        if (model && typeof model.userData.callTrain === 'function') model.userData.callTrain();
      };
      call();

      let timer = 26;
      register(`${holder.userData.type}:train`, (dt) => {
        timer -= dt;
        if (timer <= 0) {
          call();
          timer = rng.range(24, 38);
        }
        for (const w of waiting) {
          w.phase += dt;
          w.person.position.y = deckY + 0.5 + Math.abs(Math.sin(w.phase * 1.4)) * 0.04;
          stride(w.person, dt, 1, false);
        }
      });
    },

    /** The bus pulls out of its bay, drives off, and comes back for more. */
    bus(holder, opts) {
      const model = holder.userData.model;
      const bus = model && model.userData.bus;
      const stage = stageFor(holder);
      const [, ld] = lotSize(holder);
      const home = model && model.userData.busHome ? model.userData.busHome.clone() : null;
      const riders = [];
      for (let i = 0; i < (opts.passengers || 4); i++) {
        riders.push({ person: actor(stage, rng.range(-6, 6), ld * 0.16 + rng.range(-1, 1)), phase: rng.range(0, 6.28) });
      }
      if (!bus || !home) return;

      let t = 0;
      register(`${holder.userData.type}:bus`, (dt) => {
        t += dt * 0.06;
        const cycle = t % 1;
        // out along the road, pause, and back to the stand
        const travel = cycle < 0.4 ? cycle / 0.4 : cycle < 0.6 ? 1 : 1 - (cycle - 0.6) / 0.4;
        const eased = travel * travel * (3 - 2 * travel);
        bus.position.set(home.x + eased * 34, home.y, home.z);
        for (const r of riders) {
          r.phase += dt;
          r.person.position.y = Math.abs(Math.sin(r.phase * 1.3)) * 0.05;
          stride(r.person, dt, 1, false);
        }
      });
    },

    /** The aircraft taxis and, if the child said they would fly, takes off. */
    plane(holder, opts) {
      const model = holder.userData.model;
      const plane = model && model.userData.plane;
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      if (!plane) return;
      const home = model.userData.planeHome.clone();
      const heading = model.userData.planeHeading || 0;
      const runwayZ = -ld * 0.28;

      if (opts.passengers) {
        for (let i = 0; i < opts.passengers; i++) {
          const person = actor(stage, rng.range(-lw * 0.2, lw * 0.2), ld * 0.3 + rng.range(-1.5, 1.5));
          register(`${holder.userData.type}:plane:pax${i}`, (dt) => stride(person, dt, 1, false));
        }
      }

      let t = 0;
      register(`${holder.userData.type}:plane`, (dt) => {
        t += dt * 0.055;
        const cycle = t % 1;
        plane.rotation.y = 0;
        if (cycle < 0.18) {
          // taxi out to the runway
          const k = cycle / 0.18;
          plane.position.set(home.x + k * lw * 0.3, 0, home.z + (runwayZ - home.z) * k);
          plane.rotation.y = heading * (1 - k);
        } else if (cycle < 0.5) {
          const k = (cycle - 0.18) / 0.32;
          const lift = opts.takeoff ? Math.max(0, k - 0.35) * 46 : 0;
          plane.position.set(
            home.x + lw * 0.3 - k * lw * 1.4,
            lift,
            runwayZ
          );
          plane.rotation.z = lift > 0 ? -0.12 : 0;
          plane.rotation.y = 0;
        } else if (cycle < 0.62) {
          plane.position.y = opts.takeoff ? 60 : 0;
          plane.visible = !opts.takeoff;
        } else {
          // come back round for the next departure
          const k = (cycle - 0.62) / 0.38;
          plane.visible = true;
          plane.position.set(
            home.x + lw * 0.3 - (1 - k) * lw * 1.4,
            opts.takeoff ? Math.max(0, (1 - k) - 0.4) * 46 : 0,
            runwayZ
          );
          plane.rotation.z = 0;
          if (k > 0.9) {
            plane.position.copy(home);
            plane.rotation.y = heading;
          }
        }
      });
    },

    /** Swimmers, in a pool or in the sea. */
    swimmers(holder, opts) {
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      const inSea = opts.area === 'sea';
      const centreZ = inSea ? -ld * 0.36 : ld * 0.1;
      const spanX = inSea ? lw * 0.35 : Math.min(lw - 8, 16) * 0.42;
      const spanZ = inSea ? ld * 0.12 : Math.min(ld - 12, 10) * 0.34;
      const y = inSea ? 0.35 : 0.55;
      const people = [];

      for (let i = 0; i < (opts.count || 5); i++) {
        const person = actor(stage, rng.range(-spanX, spanX), centreZ + rng.range(-spanZ, spanZ), { y });
        person.rotation.x = -0.9; // lying in the water
        people.push({ person, dir: rng.chance(0.5) ? 1 : -1, speed: rng.range(1.2, 2.2), phase: rng.range(0, 6.28) });
      }

      let splash = 0;
      register(`${holder.userData.type}:swim`, (dt, time) => {
        for (const s of people) {
          s.phase += dt * s.speed * 2.4;
          s.person.position.x += s.dir * s.speed * dt;
          if (Math.abs(s.person.position.x) > spanX) s.dir *= -1;
          s.person.rotation.y = s.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
          s.person.position.y = y + Math.sin(s.phase) * 0.08;
          const { arms } = s.person.userData;
          if (arms) {
            arms[0].rotation.x = Math.sin(s.phase) * 1.6;
            arms[1].rotation.x = -Math.sin(s.phase) * 1.6;
          }
        }
        splash -= dt;
        if (splash <= 0) {
          splash = rng.range(1.4, 3);
          const target = people[Math.floor(rng() * people.length)];
          if (target) {
            const world = target.person.getWorldPosition(new THREE.Vector3());
            particles.sparkle(world, { count: 5, radius: 1.2, colorSet: [0xbfeaff, 0xffffff] });
          }
        }
        void time;
      });
      if (typeof holder.userData.react === 'function') holder.userData.react();
    },

    /** The fairground: existing rides simply speed up and stay running. */
    rides(holder, opts) {
      const model = holder.userData.model;
      const speed = model && model.userData.rides;
      if (speed) {
        if (opts.focus === 'ferris' || opts.focus === 'all') speed.ferris = 3.2;
        if (opts.focus === 'coaster' || opts.focus === 'all') speed.coaster = 3.4;
        speed.carousel = opts.focus === 'all' ? 2.6 : Math.max(speed.carousel, 1.8);
      }
      ANIMATIONS.crowd(holder, { count: opts.people || 5, mood: 'play', spread: 0.6 });
    },

    /** Zoo and farm animals wake up - the named one most of all. */
    animals(holder, opts) {
      const model = holder.userData.model;
      if (model && typeof model.userData.exciteAnimal === 'function') {
        model.userData.exciteAnimal(opts.animal);
        // keep them lively rather than letting the excitement lapse
        register(`${holder.userData.type}:animals`, (() => {
          let t = 0;
          return (dt) => {
            t -= dt;
            if (t <= 0) {
              model.userData.exciteAnimal(opts.animal);
              t = 4;
            }
          };
        })());
      }
      ANIMATIONS.crowd(holder, { count: opts.people || 3, spot: 'front', mood: 'photo' });
    },

    /** The aquarium's dolphin puts on a show; fish circle the pool. */
    sea(holder, opts) {
      const model = holder.userData.model;
      const stage = stageFor(holder);
      const show = model && model.userData.dolphinShow;
      if (show) show.speed = opts.star === 'dolphin' ? 2.4 : 1.5;

      const centre = (model && model.userData.poolCentre) || new THREE.Vector3(0, 0, 6);
      const fish = [];
      for (let i = 0; i < 7; i++) {
        const f = mesh(sphere(0.3, 6, 5), mat(rng.pick([0xff9a5c, 0xffd166, 0x6bcbe0, 0xef7d57])), {
          cast: false, receive: false,
        });
        f.scale.set(1.6, 0.7, 0.9);
        stage.add(f);
        fish.push({ f, a: rng.range(0, 6.28), r: rng.range(1.4, 3.4), speed: rng.range(0.5, 1.1) });
      }
      register(`${holder.userData.type}:sea`, (dt) => {
        for (const it of fish) {
          it.a += dt * it.speed;
          it.f.position.set(
            centre.x + Math.cos(it.a) * it.r,
            0.55 + Math.sin(it.a * 2) * 0.1,
            centre.z + Math.sin(it.a) * it.r
          );
          it.f.rotation.y = -it.a;
        }
      });
      ANIMATIONS.crowd(holder, { count: 4, spot: 'entrance', mood: 'walk' });
    },

    /**
     * A vehicle arrives at the building and people get out - the ambulance at
     * the hospital, the patrol car at the police station, the engine rolling
     * out of the fire station.
     */
    vehicleArrive(holder, opts) {
      const model = holder.userData.model;
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);

      // the fire station already owns an engine: roll that one out
      const existing = opts.kind === 'engine' ? model && model.userData.engine : null;
      const home = existing && model.userData.engineHome ? model.userData.engineHome.clone() : null;
      const vehicle = existing || makeCar(rng);
      if (!existing) {
        vehicle.position.set(lw * 0.4, 0, ld * 0.6);
        vehicle.rotation.y = Math.PI;
        stage.add(vehicle);
        if (opts.kind === 'ambulance' || opts.kind === 'patrol') {
          const bar = mesh(box(1.2, 0.26, 0.5), glow(opts.kind === 'patrol' ? 0x4aa3ff : 0xff6b6b, 0.8), {
            y: 2.1, cast: false, receive: false,
          });
          vehicle.add(bar);
          vehicle.userData.bar = bar;
        }
      }

      const people = [];
      for (let i = 0; i < (opts.people || 2); i++) {
        people.push({
          person: actor(stage, rng.range(-lw * 0.2, lw * 0.2), ld * 0.28 + rng.range(-1.5, 1.5)),
          phase: rng.range(0, 6.28),
        });
      }

      let t = 0;
      register(`${holder.userData.type}:vehicle`, (dt, time) => {
        t += dt * 0.09;
        const cycle = t % 1;
        const out = cycle < 0.45 ? cycle / 0.45 : cycle < 0.6 ? 1 : 1 - (cycle - 0.6) / 0.4;
        const eased = out * out * (3 - 2 * out);
        if (existing && home) {
          vehicle.position.set(home.x, home.y, home.z + eased * 9);
        } else {
          vehicle.position.z = ld * 0.6 - eased * (ld * 0.28);
        }
        if (vehicle.userData.bar) {
          vehicle.userData.bar.material.emissiveIntensity = 0.4 + Math.abs(Math.sin(time * 6)) * 0.8;
        }
        for (const p of people) {
          p.phase += dt;
          p.person.position.y = Math.abs(Math.sin(p.phase * 1.3)) * 0.05;
          stride(p.person, dt, 1, false);
        }
        if (opts.sparkle && rng.chance(dt * 1.5)) {
          particles.sparkle(vehicle.getWorldPosition(new THREE.Vector3()), {
            count: 4, radius: 1.6, colorSet: [0xbfeaff, 0xffffff],
          });
        }
      });
    },

    /**
     * Props that make an activity legible from the air: a picnic blanket, cafe
     * tables with food on them, a sandcastle, a row of crops being picked.
     */
    props(holder, opts) {
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      const group = new THREE.Group();
      stage.add(group);
      const people = [];

      if (opts.kind === 'picnic') {
        group.position.set(rng.range(-lw * 0.18, lw * 0.18), 0, rng.range(-ld * 0.1, ld * 0.2));
        group.add(mesh(box(3.4, 0.08, 3.4), mat(0xf2545b), { y: 0.24, cast: false }));
        group.add(mesh(box(3.4, 0.06, 3.4), mat(0xffffff), { y: 0.29, cast: false }));
        group.add(mesh(roundedBox(0.9, 0.5, 0.7, 0.16), mat(0xd9a566), { x: 0.6, y: 0.55 }));
        for (let i = 0; i < 3; i++) {
          group.add(mesh(sphere(0.22, 6, 5), mat(rng.pick([0xff8fa3, 0xffd166, 0x6bcb77])), {
            x: rng.range(-1.2, 1.2), y: 0.42, z: rng.range(-1.2, 1.2), cast: false,
          }));
        }
      } else if (opts.kind === 'sandcastle') {
        group.position.set(rng.range(-lw * 0.2, lw * 0.2), 0, ld * 0.06);
        for (const [x, z, r, h] of [[0, 0, 1.5, 1.6], [-1.3, 0.9, 0.9, 1.1], [1.3, 0.9, 0.9, 1.1]]) {
          group.add(mesh(cylinder(r * 0.72, r, h, 8), mat(0xe2c894), { x, y: h / 2, z }));
          group.add(mesh(cylinder(0.02, 0.34, 0.5, 6), mat(0xd8b877), { x, y: h + 0.25, z }));
        }
        group.add(mesh(box(0.06, 0.7, 0.06), mat(0xb98a5a), { y: 2.2, cast: false }));
        group.add(mesh(box(0.5, 0.34, 0.03), mat(0xef476f), { x: 0.25, y: 2.35, cast: false }));
      } else if (opts.kind === 'relax') {
        group.position.set(rng.range(-lw * 0.2, lw * 0.2), 0, ld * 0.1);
        for (let i = 0; i < (opts.people || 3); i++) {
          const chair = mesh(box(1, 0.14, 2.1), mat(rng.pick([0xffd166, 0x4d96ff, 0xef7d57])), {
            x: i * 2.2 - 2.2, y: 0.5, z: 0, cast: false,
          });
          chair.rotation.x = -0.3;
          group.add(chair);
        }
      } else if (opts.kind === 'crops') {
        group.position.set(lw * 0.18, 0, 0);
        for (let i = 0; i < 14; i++) {
          group.add(mesh(sphere(0.4, 6, 5), mat(0x6bbf5a), {
            x: rng.range(-lw * 0.16, lw * 0.16), y: 0.55, z: rng.range(-ld * 0.22, ld * 0.22), cast: false,
          }));
        }
      } else {
        // tables: restaurants, cafes, food courts, family dinners
        group.position.set(rng.range(-lw * 0.12, lw * 0.12), 0, ld * 0.32);
        for (let i = 0; i < 3; i++) {
          const x = (i - 1) * 2.6;
          group.add(mesh(cylinder(0.75, 0.75, 0.12, 12), mat(0xffffff), { x, y: 0.95, cast: false }));
          group.add(mesh(cylinder(0.12, 0.16, 0.95, 8), mat(P.metalDark), { x, y: 0.48, cast: false }));
          group.add(mesh(cylinder(0.26, 0.22, 0.14, 10), mat(opts.cafe ? 0x8a5a3c : 0xffd166), {
            x, y: 1.08, z: 0.2, cast: false,
          }));
        }
      }

      for (let i = 0; i < (opts.people || 2); i++) {
        const person = actor(stage, group.position.x + rng.range(-2, 2), group.position.z + rng.range(-2, 2));
        people.push({ person, phase: rng.range(0, 6.28) });
      }

      register(`${holder.userData.type}:props:${opts.kind}`, (dt) => {
        for (const p of people) {
          p.phase += dt * 1.2;
          p.person.position.y = Math.abs(Math.sin(p.phase)) * 0.06;
          p.person.rotation.y += Math.sin(p.phase * 0.4) * dt * 0.4;
          stride(p.person, dt, 1, false);
        }
      });
    },

    /**
     * The building itself lights up: a cinema marquee, warm museum galleries,
     * hotel windows at night, a television flickering in a front room.
     */
    lights(holder, opts) {
      const model = holder.userData.model;
      const stage = stageFor(holder);
      const [lw, ld] = lotSize(holder);
      const bounds = new THREE.Box3().setFromObject(holder);
      const height = Math.max(5, bounds.max.y);

      if (opts.tone === 'marquee' && model && model.userData.marquee) {
        model.userData.marquee.bright = 1;
      }

      const panels = [];
      const colour = opts.tone === 'tv' ? 0x9fd8ff : opts.tone === 'warm' ? 0xffe3a8 : 0xfff2cc;
      const rows = opts.tone === 'tv' ? 1 : 3;
      const cols = opts.tone === 'tv' ? 1 : 4;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const panel = mesh(box(1.5, 1.2, 0.12), glow(colour, 0.5), {
            x: -lw * 0.2 + (c * lw * 0.4) / Math.max(1, cols - 1 || 1),
            y: opts.tone === 'tv' ? 1.7 : 2.4 + r * (height * 0.22),
            z: ld * 0.18,
            cast: false,
            receive: false,
          });
          panel.material = glow(colour, 0.5).clone();
          panels.push({ panel, phase: rng.range(0, 6.28) });
          stage.add(panel);
        }
      }

      register(`${holder.userData.type}:lights`, (dt, time) => {
        for (const p of panels) {
          const flicker = opts.tone === 'tv'
            ? 0.45 + Math.abs(Math.sin(time * 7 + p.phase)) * 0.7
            : 0.5 + Math.sin(time * 1.4 + p.phase) * 0.15;
          p.panel.material.emissiveIntensity = flicker;
        }
        void dt;
      });

      if (opts.people) {
        ANIMATIONS.crowd(holder, { count: opts.people, spot: 'entrance', mood: 'walk' });
      }
    },

    /**
     * The catch-all. A perfectly good English sentence with no bespoke
     * animation still gets a proper reaction - never a shrug.
     */
    generic(holder, opts = {}) {
      ANIMATIONS.crowd(holder, { count: opts.count || 5, spot: 'entrance', mood: 'walk' });
      const bounds = new THREE.Box3().setFromObject(holder);
      const centre = new THREE.Vector3(
        holder.position.x,
        Math.max(3, bounds.max.y * 0.6),
        holder.position.z
      );
      const span = Math.max(...lotSize(holder));
      let timer = 0;
      register(`${holder.userData.type}:generic`, (dt) => {
        timer -= dt;
        if (timer <= 0) {
          timer = rng.range(6, 11);
          particles.sparkle(centre, { count: 10, radius: span * 0.35 });
        }
      });
    },
  };

  /* ---------------- public API ---------------- */

  return {
    /**
     * A child said something true about a place - make it happen.
     *
     * `action` is the registry entry the matcher picked, so there is no
     * per-building branching here. Activities accumulate: saying something new
     * about a place adds to what is already going on rather than replacing it.
     * They also persist, so the town keeps getting livelier as the tour goes on.
     *
     * Returns true when a bespoke animation ran, false when the sentence was
     * fine but the game had nothing specific for it (and got the generic
     * celebration instead).
     */
    trigger(type, action, holder) {
      if (!holder) return false;
      if (!activeByType.has(type)) activeByType.set(type, new Set());
      const active = activeByType.get(type);

      const id = action && action.id;
      if (id && active.has(id)) {
        // already running - top it up rather than stacking a second copy
        if (typeof holder.userData.react === 'function') holder.userData.react();
        return true;
      }
      if (id) active.add(id);

      const handler = action && action.anim && ANIMATIONS[action.anim];
      if (!handler) {
        ANIMATIONS.generic(holder, {});
        return false;
      }

      handler(holder, action.opts || {});
      if (typeof holder.userData.react === 'function') holder.userData.react();
      return true;
    },

    /** How many activities the town is running - used for the summary. */
    get count() {
      return running.length;
    },

    /** Wipe every activity (Play Again). */
    reset() {
      running.length = 0;
      activeByType.clear();
    },

    update(dt, time) {
      for (const item of running) item.update(dt, time);
    },
  };
}

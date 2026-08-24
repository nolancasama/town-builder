import * as THREE from 'three';
import { wait, Ease } from '../core/tween.js';

/**
 * TOWN SPEAKING TOUR
 * ------------------
 * Phase two. The town the child built stays exactly as it is - alive, populated
 * and running - and the camera takes them round it, stopping at each place they
 * created to practise "We can ___ in the ___."
 *
 * Two states are tracked per place, and they are deliberately different:
 *   visited            - the camera has presented it at least once
 *   spokenSuccessfully - the child produced an accepted sentence about it
 *
 * The tour ends when everything has been *visited*. Nobody is ever required to
 * answer successfully before being allowed to finish, and Skip is always there,
 * so a child can never get stuck on one hard word.
 */
export function createTour({ rig, landmarks, particles, audio, pedestrians }) {
  /** type -> { visited, spokenSuccessfully, attempts } */
  const progress = new Map();
  let queue = [];
  let current = null;
  let cancelled = false;

  function ensureState(type) {
    if (!progress.has(type)) {
      progress.set(type, { visited: false, spokenSuccessfully: false, attempts: 0 });
    }
    return progress.get(type);
  }

  /**
   * Orders the stops so the camera walks around the town instead of ping-ponging
   * across it: start at whichever place is furthest out, then repeatedly hop to
   * the nearest one not yet visited.
   */
  function routeThrough(types) {
    const remaining = types.slice();
    if (remaining.length <= 2) return remaining;

    const posOf = (type) => {
      const h = landmarks.get(type);
      return new THREE.Vector2(h.position.x, h.position.z);
    };

    let currentType = remaining.reduce(
      (far, type) => (posOf(type).length() > posOf(far).length() ? type : far),
      remaining[0]
    );
    const route = [currentType];
    remaining.splice(remaining.indexOf(currentType), 1);

    while (remaining.length) {
      const from = posOf(currentType);
      let best = remaining[0];
      let bestD = Infinity;
      for (const type of remaining) {
        const d = from.distanceTo(posOf(type));
        if (d < bestD) {
          bestD = d;
          best = type;
        }
      }
      route.push(best);
      remaining.splice(remaining.indexOf(best), 1);
      currentType = best;
    }
    return route;
  }

  /** Fly to a landmark and frame it so the whole building reads clearly. */
  async function focusOn(type) {
    const holder = landmarks.get(type);
    const lot = holder.userData.lot;
    const bounds = new THREE.Box3().setFromObject(holder);
    const height = Math.max(6, bounds.max.y);
    const span = Math.max(lot.size[0], lot.size[1]);

    // approach from the entrance side so the sign and doors face the camera
    const facing = new THREE.Vector3(Math.sin(lot.rot), 0, Math.cos(lot.rot));
    // Aim below the building so it sits in the upper part of the frame, clear
    // of the speaking panel along the bottom of the screen.
    //
    // Some places also declare a camera adjustment: a stadium's game happens
    // inside the bowl and a swimming pool is flat on the ground, so those need
    // a steeper look-down or the child never sees what their sentence did.
    const view = (holder.userData.def.activity && holder.userData.def.activity.view) || {};
    const target = new THREE.Vector3(
      holder.position.x,
      height * (view.targetY !== undefined ? view.targetY : 0.12),
      holder.position.z
    );
    const distance = Math.max(32, span * 1.6 + height * 0.95) * (view.distance || 1);
    const position = target
      .clone()
      .add(facing.multiplyScalar(distance * 0.8))
      .add(new THREE.Vector3(distance * 0.3, Math.max(17, height * 1.3) * (view.height || 1), 0));

    await rig.flyTo(position, target, 2.6, Ease.cubicInOut);
    await wait(0.35); // let the camera settle before the panel appears
    return { holder, height, span, target };
  }

  const api = {
    progress,

    get current() {
      return current;
    },

    stateOf(type) {
      return ensureState(type);
    },

    /** Places built this game that still have no successful sentence. */
    unspoken(builtTypes) {
      return builtTypes.filter((type) => !ensureState(type).spokenSuccessfully);
    },

    summary(builtTypes) {
      const spoken = builtTypes.filter((type) => ensureState(type).spokenSuccessfully).length;
      return { spoken, total: builtTypes.length };
    },

    /** Build the queue for a round. `types` defaults to everything built. */
    start(types) {
      cancelled = false;
      queue = routeThrough(types.slice());
      return queue;
    },

    get remaining() {
      return queue.length;
    },

    cancel() {
      cancelled = true;
      queue = [];
    },

    /**
     * Advance to the next stop: flies the camera and returns the landmark that
     * is now on screen, or null when the round is over.
     */
    async next() {
      if (cancelled || !queue.length) {
        current = null;
        return null;
      }
      const type = queue.shift();
      current = type;
      const framing = await focusOn(type);
      if (cancelled) return null;
      ensureState(type).visited = true;
      return { type, ...framing };
    },

    /**
     * The child said something acceptable. Mark it and give light, immediate
     * feedback - a sparkle and a sound.
     *
     * Deliberately NOT the building's special activity animation: the stadium's
     * game, the arriving train and the turning Ferris wheel are held back for
     * the guided tour, where the child's own recorded sentence sets them off.
     * That is what makes phase three the payoff instead of a repeat.
     */
    accept(type) {
      const state = ensureState(type);
      state.spokenSuccessfully = true;
      state.attempts += 1;

      const holder = landmarks.get(type);
      if (!holder) return;
      const bounds = new THREE.Box3().setFromObject(holder);
      const centre = new THREE.Vector3(holder.position.x, Math.max(4, bounds.max.y * 0.6), holder.position.z);
      const span = Math.max(holder.userData.lot.size[0], holder.userData.lot.size[1]);

      audio.success();
      particles.sparkle(centre, { count: 22, radius: span * 0.42 });

      // the town answers back a little: a few people head for its door
      const entrance = holder.userData.lot.entrance;
      if (pedestrians) pedestrians.addAttraction(entrance[0], entrance[1]);
    },

    miss(type) {
      ensureState(type).attempts += 1;
      return ensureState(type).attempts;
    },

    skip(type) {
      ensureState(type).visited = true;
    },
  };

  return api;
}

import * as THREE from 'three';
import { LANDMARKS } from '../config/landmarks.js';
import { wait, damp } from '../core/tween.js';

/**
 * BUILDING UNLOCK REVEAL
 * -----------------------
 * The payoff for finishing all three phases: one new place, shown briefly and
 * skippably before the closing menu. No score is shown anywhere - the reward
 * is new content, so this exists purely to make discovering it feel good.
 *
 * The building itself is the child's actual future building - built with the
 * same procedural function (or hand-built factory) the real town uses, never
 * a stand-in illustration. It renders into a second small scene, scissored
 * into the `#unlock-stage` panel's screen rect on the same canvas/renderer the
 * town uses - the same technique the phase-3 speaking portrait uses - so this
 * never costs a second WebGL context or a second render of the town.
 *
 * The "silhouette brightening into view" beat is just the scene's lights
 * fading in from near-zero, not a material swap: cheap, and it doubles as the
 * anticipation beat before the name lands.
 */
export function createUnlockReveal({ rng, hud }) {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8fa6b8, 0);
  const key = new THREE.DirectionalLight(0xfff4e2, 0);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xbfe0ff, 0);
  rim.position.set(-4, 3, -3);
  scene.add(hemi, key, rim);
  const lights = [
    { light: hemi, target: 1.3 },
    { light: key, target: 1.15 },
    { light: rim, target: 0.5 },
  ];

  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 60);
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  let model = null;
  let unlitMeshes = [];  // sign boards etc. - MeshBasicMaterial ignores scene
                          // lights, so left alone they would stay bright and
                          // spoil the darkened silhouette; toggled with the lock
  let lightTarget = 0;   // 0 = still dark, 1 = fully lit
  let spin = 0;
  let skipCurrent = null; // set while show() is running; lets cancel() end it early

  /** Build the child's actual future building, scaled to fill the stage. */
  function mount(type) {
    if (model) stageGroup.remove(model);
    model = null;

    const def = LANDMARKS[type];
    const build = def.factory || def.fallback;
    if (!build) return;
    const built = build({ size: def.footprint, sign: def.sign, rng, type });

    const bounds = new THREE.Box3().setFromObject(built);
    const size = bounds.getSize(new THREE.Vector3());
    const centre = bounds.getCenter(new THREE.Vector3());
    const span = Math.max(size.x, size.z, 1);
    const scale = 6.4 / span;

    const wrapper = new THREE.Group();
    built.position.set(-centre.x, -bounds.min.y, -centre.z);
    wrapper.add(built);
    wrapper.scale.setScalar(scale);
    stageGroup.add(wrapper);
    model = wrapper;

    unlitMeshes = [];
    built.traverse((o) => {
      if (o.isMesh && o.material && o.material.isMeshBasicMaterial) unlitMeshes.push(o);
    });

    camera.position.set(4.6, 3.4, 6.2);
    camera.lookAt(0, 1.2, 0);
  }

  return {
    /**
     * Run the full reveal beat for one unlocked type. Resolves when it is
     * done - either the timeline finished on its own or the child tapped to
     * skip it. Never blocks longer than a few seconds either way.
     */
    async show(type) {
      const def = LANDMARKS[type];
      if (!def) return;
      mount(type);
      lightTarget = 0;
      spin = 0;

      hud.setUnlockText({ name: def.displayName, jp: '新しい場所がアンロックされました！' });
      hud.showUnlockLock(true);
      hud.showUnlockTitle(false);
      hud.showUnlockReveal(true);

      let skipped = false;
      skipCurrent = () => {
        skipped = true;
      };
      hud.onUnlockRevealTap(skipCurrent);
      const untilSkipOr = (seconds) => raceSkip(wait(seconds), () => skipped);

      // 1 - a short suspense hold on the darkened silhouette
      await untilSkipOr(0.9);
      if (!skipped) {
        // 2 - the lock opens and the building brightens into view
        hud.showUnlockLock(false);
        lightTarget = 1;
        await untilSkipOr(0.8);
      }
      if (!skipped) {
        // 3 - the name lands
        hud.showUnlockTitle(true);
        await untilSkipOr(1.7);
      }

      hud.showUnlockReveal(false);
      lightTarget = 0;
      skipCurrent = null;
      await wait(0.4);
    },

    /** Force-end whatever is currently showing - used when Play Again interrupts. */
    cancel() {
      if (skipCurrent) skipCurrent();
      hud.showUnlockReveal(false);
    },

    /** Advance the light fade and the slow turntable spin. */
    update(dt) {
      for (const entry of lights) {
        entry.light.intensity = damp(entry.light.intensity, entry.target * lightTarget, 4, dt);
      }
      spin += dt * 0.45;
      if (model) model.rotation.y = spin;
      const signsVisible = lightTarget > 0.5;
      for (const mesh of unlitMeshes) mesh.visible = signsVisible;
    },

    /** Drawn after the town, scissored into the `#unlock-stage` element's rect. */
    render(renderer, width, height) {
      const stageEl = hud.unlockStageEl;
      if (!stageEl || stageEl.closest('.hidden')) return;
      const rect = stageEl.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;

      // The canvas fills the viewport exactly, so DOM CSS-pixel coordinates
      // convert directly - Three's setViewport/setScissor apply the device
      // pixel ratio internally, matching how the phase-3 portrait does this.
      const x = Math.round(rect.left);
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const y = Math.round(height - rect.top - rect.height);

      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.autoClear = prevAutoClear;
    },
  };
}

/** Resolve as soon as `shouldSkip()` turns true, without cutting a normal finish short. */
function raceSkip(promise, shouldSkip) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    promise.then(finish);
    const poll = () => {
      if (done) return;
      if (shouldSkip()) {
        finish();
        return;
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

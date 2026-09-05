import * as THREE from 'three';
import { tween, wait, Ease } from '../core/tween.js';
import { mat, box, mesh } from '../core/materials.js';

/**
 * CONSTRUCTION SEQUENCE
 * ---------------------
 * The payoff for speaking the sentence. It must never be a pop-in, so the beat
 * order is fixed: fly in, highlight the ground, clear the lot in a puff of dust,
 * slam a foundation down, raise the building with an overshoot, then celebrate
 * and drift back to the city view. About three seconds end to end.
 */

export async function runConstruction({
  rig, particles, audio, scene, holder, dressing, def, onSettled,
}) {
  const lot = dressing.lot;
  const centre = new THREE.Vector3(lot.pos[0], 0, lot.pos[1]);
  const [lw, ld] = lot.size;
  const span = Math.max(lw, ld);

  // measure the finished building so we know how far to raise it
  holder.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(holder);
  const height = Math.max(4, bounds.max.y - Math.min(0, bounds.min.y));

  /* --- 1. camera reacts --- */
  const focusPoint = centre.clone().setY(height * 0.32);
  await rig.focusOn(focusPoint, {
    distance: Math.max(38, span * 1.85),
    polar: 0.82,
    duration: 1.25,
    ease: Ease.cubicInOut,
  });

  /* --- 2. the lot wakes up --- */
  const ring = dressing.ring;
  ring.visible = true;
  ring.material.opacity = 0;
  const pulse = tween(
    1.1,
    (t, raw) => {
      ring.material.opacity = 0.85 * Math.sin(raw * Math.PI * 3) ** 2;
      ring.scale.setScalar(1 + Math.sin(raw * Math.PI * 3) * 0.06);
    },
    { ease: Ease.linear }
  );
  audio.construction();
  await wait(0.45);

  /* --- 3. clear the site --- */
  particles.dust(centre, { count: 22, radius: span * 0.5, power: span * 0.42, height: 0.6 });
  const clutter = dressing.group.children.filter((c) => c !== ring);
  // remember where the clutter started so "Play Again" can put the lot back
  for (const c of clutter) {
    if (c.userData.restY === undefined) c.userData.restY = c.position.y;
  }
  await tween(
    0.45,
    (t) => {
      for (const c of clutter) {
        c.scale.setScalar(Math.max(0.001, 1 - t));
        c.position.y = -t * 1.5;
      }
    },
    { ease: Ease.quadIn }
  ).promise;
  for (const c of clutter) c.visible = false;

  /* --- 4. foundation slams down --- */
  const slab = mesh(box(lw - 1.5, 1.2, ld - 1.5), mat(0xbdb6a5), { y: 6, cast: false });
  slab.position.set(centre.x, 8, centre.z);
  slab.rotation.y = lot.rot;
  scene.add(slab);
  await tween(
    0.3,
    (t) => {
      slab.position.y = 8 - t * 7.4;
    },
    { ease: Ease.quadIn }
  ).promise;
  slab.position.y = 0.6;
  particles.dust(centre, { count: 30, radius: span * 0.62, power: span * 0.55, height: 0.3 });
  rig.shake(Math.min(1.6, span * 0.05), 0.4);
  audio.land();

  /* --- 5. the building rises, overshoots, settles --- */
  holder.visible = true;
  holder.position.y = -height;
  holder.scale.set(1, 1, 1);
  await tween(
    1.05,
    (t) => {
      holder.position.y = -height + height * t;
    },
    { ease: Ease.cubicOut }
  ).promise;
  holder.position.y = 0;

  await tween(
    0.75,
    (t) => {
      const overshoot = 1 + Math.sin(t * Math.PI) * 0.055;
      const squash = 1 - Math.sin(t * Math.PI) * 0.03;
      holder.scale.set(squash, overshoot, squash);
    },
    { ease: Ease.quadOut }
  ).promise;
  holder.scale.set(1, 1, 1);
  pulse.kill();

  /* --- 6. celebrate --- */
  ring.material.opacity = 0;
  ring.visible = false;
  particles.sparkle(centre.clone().setY(height * 0.5), { count: 22, radius: span * 0.45 });
  audio.sparkle();
  if (def.celebration >= 0.7) {
    particles.confetti(centre.clone().setY(height * 0.9), {
      count: def.celebration >= 1 ? 120 : 80,
      spread: span * 0.8,
      power: 15,
    });
  }
  if (onSettled) onSettled();

  // hold on the finished building long enough to read the sign
  // The building's local +Z is its front. Prefer the authored entrance point
  // because it also describes the exact street-facing side, and fall back to
  // the lot rotation for any future lot without a distinct entrance vector.
  const entranceX = lot.entrance?.[0] ?? centre.x + Math.sin(lot.rot || 0);
  const entranceZ = lot.entrance?.[1] ?? centre.z + Math.cos(lot.rot || 0);
  const frontAzimuth = Math.atan2(entranceX - centre.x, entranceZ - centre.z);
  await rig.focusOn(centre.clone().setY(height * 0.42), {
    distance: Math.max(32, span * 1.5),
    azimuth: frontAzimuth,
    polar: 0.9,
    duration: 1.1,
    ease: Ease.sineInOut,
  });
  await wait(0.55 + def.celebration * 0.5);

  /* --- 7. back to the city view --- */
  scene.remove(slab);
  await rig.returnHome(1.7);
}

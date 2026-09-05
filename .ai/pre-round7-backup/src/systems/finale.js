import * as THREE from 'three';
import { tween, wait, Ease } from '../core/tween.js';

/**
 * FINALE
 * ------
 * When the town reaches its target the game takes the controls and flies a tour
 * of whatever the child actually built - the route is generated from the
 * landmarks that exist, so every playthrough gets its own closing film.
 *
 * Shape of the tour: a wide rise, a slow orbit, a lap of the most spectacular
 * building, and a pull-up into the final aerial.
 *
 * Deliberately short. This celebration is immediately followed by the speaking
 * tour, which visits every landmark up close, and then by the guided tour,
 * which walks to every landmark again. Touring them a third time here would
 * make all three feel routine - so this beat establishes the finished town as a
 * whole and hands over quickly.
 */

export async function runFinale({ rig, landmarks, particles, audio, onFinish }) {
  const centre = new THREE.Vector3(0, 0, 0);

  const built = [...landmarks.entries()].map(([type, holder]) => {
    const bounds = new THREE.Box3().setFromObject(holder);
    return {
      type,
      pos: new THREE.Vector3(holder.position.x, 0, holder.position.z),
      height: Math.max(6, bounds.max.y),
      span: Math.max(holder.userData.lot.size[0], holder.userData.lot.size[1]),
      weight: holder.userData.def.celebration || 0.5,
    };
  });

  rig.setPlayerControlEnabled(false);
  audio.finale();

  /** Sweep the camera around a point along a circular path. */
  async function orbit(around, radius, height, fromAngle, toAngle, duration, lookHeight = 6) {
    const look = around.clone().setY(lookHeight);
    await tween(
      duration,
      (t) => {
        const a = fromAngle + (toAngle - fromAngle) * t;
        rig.camera.position.set(around.x + Math.cos(a) * radius, height, around.z + Math.sin(a) * radius);
        rig.lookAtVector.copy(look);
      },
      { ease: Ease.sineInOut }
    ).promise;
  }

  // the hero shot goes to the most celebratory thing in town
  const hero = built.length
    ? built.reduce((best, item) => (item.weight > best.weight ? item : best), built[0])
    : null;

  // 1 - rise above the whole town
  await rig.flyTo(new THREE.Vector3(74, 100, 112), centre.clone().setY(4), 3.4, Ease.cubicInOut);

  // 2 - slow rotation around the completed town
  const startTheta = Math.atan2(112, 74);
  await orbit(centre, 132, 82, startTheta, startTheta - Math.PI * 0.75, 7.5, 4);

  // 3 - approach the hero building and take a lap of it
  if (hero) {
    const approach = hero.pos.clone().add(new THREE.Vector3(-6, Math.max(26, hero.height * 2), hero.span * 1.9));
    await rig.flyTo(approach, hero.pos.clone().setY(hero.height * 0.4), 3.2, Ease.cubicInOut);
    particles.confetti(hero.pos.clone().setY(hero.height + 4), { count: 110, spread: hero.span, power: 17 });
    const heroTheta = Math.atan2(hero.span * 1.9, -6);
    await orbit(hero.pos, Math.max(40, hero.span * 1.7), Math.max(20, hero.height * 1.5), heroTheta, heroTheta + Math.PI * 1.4, 8.5, hero.height * 0.5);
    particles.confetti(hero.pos.clone().setY(hero.height + 6), { count: 110, spread: hero.span, power: 18 });
  }

  // 4 - pull up into the closing aerial
  await rig.flyTo(new THREE.Vector3(48, 122, 128), centre.clone().setY(2), 4.2, Ease.cubicInOut);
  particles.confetti(new THREE.Vector3(0, 44, 20), { count: 120, spread: 96, power: 12 });

  rig.setHome(rig.camera.position.clone(), centre.clone().setY(2));
  rig.releaseToPlayer();
  if (onFinish) onFinish();
}

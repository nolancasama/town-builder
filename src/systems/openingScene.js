import * as THREE from 'three';
import { wait, Ease } from '../core/tween.js';
import {
  makeTownLocal,
  poseIdle,
  poseTalk,
  poseLook,
  posePoint,
  closeMouth,
  relax,
} from '../world/characters.js';

/**
 * A brief welcome that lets the empty town motivate phase one.  It owns only
 * one character and the existing cinematic/subtitle systems. When he has
 * finished speaking he does not disappear - he is handed to the pedestrian
 * system and carries on living in the town as a permanent walker, which also
 * clears him off the buildable field he was standing on.
 */
export function createOpeningScene({ scene, rig, hud, rng, lot, pedestrians, audio = null, skip = false }) {
  const root = new THREE.Group();
  root.name = 'opening-scene';
  scene.add(root);

  const local = makeTownLocal(rng);
  local.name = 'opening-town-local';
  local.position.set(lot.pos[0], local.userData.baseY, lot.pos[1]);
  local.rotation.y = -Math.PI / 2;
  root.add(local);

  const town = new THREE.Vector3(0, 1.2, -4);
  const emptyGround = new THREE.Vector3(24, 0.2, -48);
  const mediumTarget = new THREE.Vector3(lot.pos[0], 1.15, lot.pos[1]);
  // Look west from just outside this eastern field, so the local stays large
  // in frame while the visibly sparse town stretches away behind him.
  const mediumCamera = mediumTarget.clone().add(new THREE.Vector3(16, 7.2, -2));

  let active = true;
  let talking = false;
  let pointing = false;
  let attention = town;

  /** One deliberate press advances exactly one beat. Capture input so Space
   * cannot activate a focused button and pointer input cannot leak into HUD. */
  function waitForAdvance() {
    return new Promise((resolve) => {
      const finish = (event) => {
        if (event.type === 'keydown' && (event.code !== 'Space' || event.repeat)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        window.removeEventListener('pointerdown', finish, true);
        window.removeEventListener('keydown', finish, true);
        // This tap is the first real user gesture of the session, so it is also
        // the earliest point the AudioContext can legally start. Doing it here
        // means the music is already playing by the time the town appears,
        // instead of waiting for the first press of the microphone.
        if (audio) {
          audio.start();
          audio.speechAdvance();
        }
        resolve();
      };
      window.addEventListener('pointerdown', finish, true);
      window.addEventListener('keydown', finish, true);
    });
  }

  function update(dt) {
    if (!active || !root.visible) return;
    poseIdle(local, dt);
    if (talking) poseTalk(local, dt, 0.32 + Math.sin(local.userData.phase * 3) * 0.13);
    else closeMouth(local, dt);
    posePoint(local, dt, pointing ? 1 : 0);
    // The player can advance a beat immediately and he alternates between the
    // camera and town, so complete each ~1.7 rad turn promptly. At a gentler
    // rate, lines aimed at the player can be delivered with his back turned.
    poseLook(local, attention, dt, { turnBody: true, rate: 7 });
    // poseLook normalizes the delta but not the accumulated angle, so a scene
    // of repeated turns walks rotation.y off past -4 rad. Harmless visually,
    // but it makes the remaining turn distance hard to reason about - keep it
    // wrapped. (Done here rather than in poseLook, which the guided tour and
    // its tourists also rely on.)
    local.rotation.y = Math.atan2(Math.sin(local.rotation.y), Math.cos(local.rotation.y));
    if (!pointing) {
      relax(local, dt);
      // The skinned local rests through its Idle clip; only the procedural rig
      // has arm pivots to pose by hand.
      if (!talking && local.userData.arms) {
        // A jaunty hands-on-hips rest reads at medium distance and makes him
        // feel impatient even during the quiet establishing beat.
        const settle = Math.min(1, dt * 6);
        local.userData.arms[0].rotation.z += (0.66 - local.userData.arms[0].rotation.z) * settle;
        local.userData.arms[1].rotation.z += (-0.66 - local.userData.arms[1].rotation.z) * settle;
      }
    }
  }

  async function line(text, { look = null, point = false } = {}) {
    attention = look || rig.camera.position;
    pointing = point;
    talking = true;
    if (audio) audio.speechBlip();
    hud.showTourSubtitle(text, 'TOWN LOCAL', true);
    await waitForAdvance();
    talking = false;
    pointing = false;
    hud.hideTourSubtitle();
    await wait(0.15);
  }

  async function play(playerName) {
    if (skip) {
      active = false;
      if (pedestrians?.adopt && pedestrians.adopt(local)) local.name = 'town-local';
      else local.removeFromParent();
      root.removeFromParent();
      return;
    }

    rig.beginCinematic();

    // Let the loading card finish revealing the home view, then leave a quiet
    // beat in which the empty town and its already-present resident register.
    await wait(0.75);
    await wait(1.25);

    await line(`「おーい！${playerName}！」`, { look: rig.camera.position });

    attention = town;
    pointing = true;
    talking = true;
    if (audio) audio.speechBlip();
    hud.showTourSubtitle('「見てみぃ！なんやこの町！」', 'TOWN LOCAL', true);
    // Advancing early acknowledges the input, but the next beat waits for the
    // push-in to finish so the camera is never stranded between viewpoints.
    await Promise.all([
      waitForAdvance(),
      rig.flyTo(mediumCamera, mediumTarget, 2.25, Ease.cubicInOut),
    ]);
    talking = false;
    pointing = false;
    hud.hideTourSubtitle();
    await wait(0.15);

    await line('「建物、ぜんぜん足らへんやん！」', { look: emptyGround, point: true });
    await line(`「${playerName}、英語使えるんやろ？」`, { look: rig.camera.position });
    await line('「ほな、英語で建物つくってみぃ！」', { look: rig.camera.position, point: true });
    await line('「たとえばな…… "We have a stadium in Matsubara." や！」', { look: town, point: true });
    await line('「ほな、頼んだで！」', { look: rig.camera.position });

    talking = false;
    pointing = false;
    hud.hideTourSubtitle();
    await rig.returnHome(1.65);

    // He has done his one job, but he stays in the town. Handing him to the
    // pedestrian system turns him into an ordinary walker, which also gets him
    // off the buildable field before any landmark can claim it.
    active = false;
    if (pedestrians?.adopt && pedestrians.adopt(local)) local.name = 'town-local';
    else local.removeFromParent();
    root.removeFromParent();
  }

  return { play, update, root, local };
}

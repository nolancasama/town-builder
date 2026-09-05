import * as THREE from 'three';
import { makeGuide } from '../world/characters.js';
import { damp } from '../core/tween.js';

/**
 * SPEAKING PORTRAIT
 * -----------------
 * A large head-and-shoulders cut-in of the guide, shown whenever one of the
 * child's recordings plays. The tiny guide out in the town is easy to miss at
 * gameplay distance; this makes the point unmissable - *that is my character,
 * and it is talking with my voice.*
 *
 * It is a second little scene holding another copy of the same guide (built
 * from the same appearance spec, so it is literally the same person), drawn
 * into a corner of the main canvas with a scissored viewport. That means one
 * WebGL context, one renderer, no render-target read-back and no second copy of
 * the town - about twenty extra meshes in total.
 *
 * The world guide keeps its own gestures and mouth movement; this layer is
 * additional, never a replacement.
 */
export function createPortrait({ rng, spec }) {
  const scene = new THREE.Scene();

  // soft, flat lighting - a portrait, not a dramatic scene
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fa6b8, 1.5));
  const key = new THREE.DirectionalLight(0xfff4e2, 1.15);
  key.position.set(2.5, 4, 4);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe0ff, 0.45);
  rim.position.set(-3, 2, -2.5);
  scene.add(rim);

  /**
   * The backdrop is a rounded panel drawn to a canvas texture, so the cut-in
   * has the same soft corners and edge as every other panel in the game rather
   * than sitting in a hard rectangle cut out of the town.
   */
  function makePanelTexture(aspect) {
    const width = 512;
    const height = Math.round(width / Math.max(0.4, aspect));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const radius = Math.round(width * 0.055);

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(34, 62, 84, 0.94)');
    gradient.addColorStop(1, 'rgba(20, 40, 58, 0.94)');

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(0, 0, width, height, radius);
    else ctx.rect(0, 0, width, height);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = Math.max(3, width * 0.008);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  let panelAspect = 0.8;
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: makePanelTexture(panelAspect),
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    })
  );
  backdrop.position.set(0, 1.4, -2.4);
  scene.add(backdrop);

  const guide = makeGuide(rng, spec);
  guide.position.set(0, 0, 0);
  // the guide flag reads well in the town but crosses the face up close
  if (guide.userData.flagCloth) {
    const flag = guide.userData.flagCloth.parent;
    if (flag) flag.visible = false;
  }
  guide.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  scene.add(guide);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);

  const state = {
    visible: false,
    t: 0,            // 0 hidden, 1 fully in
    side: 'left',
    level: 0,
    blink: 2,
    blinkT: 0,
    breathe: 0,
    sway: 0,
  };

  return {
    scene,
    guide,

    get visible() {
      return state.visible || state.t > 0.001;
    },

    /** Slide in on the side that will not cover what is being talked about. */
    show(side = 'left') {
      state.side = side;
      state.visible = true;
    },

    hide() {
      state.visible = false;
    },

    /** Mouth openness, straight from the amplitude of the child's recording. */
    setLevel(level) {
      state.level = level;
    },

    update(dt) {
      const target = state.visible ? 1 : 0;
      state.t = damp(state.t, target, 11, dt);
      if (state.t < 0.002 && !state.visible) state.t = 0;

      const d = guide.userData;

      // mouth: smoothed so it never chatters, but clearly tied to the audio
      d.mouthLevel = damp(d.mouthLevel, state.level, 22, dt);
      const open = Math.max(0.05, d.mouthLevel);
      d.mouth.scale.set(1 + open * 0.55, 0.45 + open * 7, 1);
      d.mouth.position.y = 0.06 - open * 0.055;

      // breathing and a little sway - alive, not restless
      state.breathe += dt * 1.5;
      state.sway += dt * 0.55;
      guide.position.y = Math.sin(state.breathe) * 0.012;
      d.head.rotation.y = Math.sin(state.sway) * 0.1;
      d.head.rotation.x = Math.sin(state.breathe * 0.7) * 0.035 - d.mouthLevel * 0.05;
      d.head.rotation.z = Math.sin(state.sway * 0.8) * 0.03;

      // blinking
      state.blink -= dt;
      if (state.blink <= 0) {
        state.blinkT = 0.14;
        state.blink = 2.4 + Math.random() * 3.2;
      }
      const blinking = state.blinkT > 0;
      if (blinking) state.blinkT -= dt;
      for (const eye of d.eyes) {
        const wanted = blinking ? 0.12 : 1;
        eye.scale.y = damp(eye.scale.y, wanted, 30, dt);
      }

      // a small presenting gesture while talking
      const gesture = d.mouthLevel > 0.12 ? 1 : 0;
      d.arms[1].rotation.x = damp(d.arms[1].rotation.x, -0.5 - gesture * 0.35, 5, dt);
      d.arms[1].rotation.z = damp(d.arms[1].rotation.z, -0.12 - gesture * 0.1, 5, dt);
      d.arms[0].rotation.x = damp(d.arms[0].rotation.x, -0.12, 4, dt);
    },

    /**
     * Draw the portrait into a corner of the main canvas.
     * Called after the town has been rendered, with depth cleared so the
     * cut-in sits cleanly on top without a second render of the world.
     */
    render(renderer, width, height) {
      if (state.t <= 0.001) return null;

      // 25-35% of the screen on a Chromebook, smaller on little screens
      const frac = width < 700 ? 0.34 : width < 1100 ? 0.3 : 0.27;
      const panelW = Math.round(width * frac);
      const panelH = Math.round(Math.min(height * 0.62, panelW * 1.25));
      const margin = Math.round(Math.min(28, width * 0.025));
      const eased = state.t * state.t * (3 - 2 * state.t);
      const slide = (1 - eased) * (panelW + margin);

      const x = state.side === 'left'
        ? Math.round(margin - slide)
        : Math.round(width - panelW - margin + slide);
      const y = Math.round(height * 0.5 - panelH * 0.42);

      const aspect = panelW / panelH;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      // head and shoulders with headroom - a character portrait, not a webcam
      camera.position.set(0.12, 1.66, 3.9);
      camera.lookAt(0, 1.5, 0);

      // stretch the rounded panel to exactly fill the cut-in
      if (Math.abs(aspect - panelAspect) > 0.02) {
        panelAspect = aspect;
        backdrop.material.map.dispose();
        backdrop.material.map = makePanelTexture(aspect);
        backdrop.material.needsUpdate = true;
      }
      const depth = camera.position.distanceTo(backdrop.position);
      const frustumH = 2 * depth * Math.tan((camera.fov * Math.PI) / 360);
      backdrop.scale.set(frustumH * aspect * 1.02, frustumH * 1.02, 1);

      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, panelW, panelH);
      renderer.setScissor(x, y, panelW, panelH);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, width, height);
      renderer.autoClear = previousAutoClear;

      // hand the layout back so the HTML subtitle can dodge the panel
      return { x, y, width: panelW, height: panelH, side: state.side, t: eased };
    },

    dispose() {
      backdrop.geometry.dispose();
      backdrop.material.dispose();
    },
  };
}

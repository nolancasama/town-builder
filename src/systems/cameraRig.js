import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CAMERA } from '../config/town.js';
import { tween, Ease, clamp } from '../core/tween.js';

/**
 * CAMERA RIG
 * ----------
 * A city-builder camera with child-proof limits: it cannot dip under the map,
 * cannot spin below the horizon, and cannot wander away from the town. During
 * construction and the finale the rig takes over and flies itself; player input
 * is handed back afterwards without a snap.
 */
export function createCameraRig(camera, domElement) {
  camera.position.set(CAMERA.start.x, CAMERA.start.y, CAMERA.start.z);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.rotateSpeed = 0.42;
  controls.zoomSpeed = 0.75;
  controls.panSpeed = 0.55;
  controls.screenSpacePanning = false;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.minPolarAngle = CAMERA.minPolar;
  controls.maxPolarAngle = CAMERA.maxPolar;
  controls.enablePan = true;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.update();

  const home = {
    position: camera.position.clone(),
    target: controls.target.clone(),
  };

  let cinematic = false;
  const lookAt = new THREE.Vector3().copy(controls.target);

  // camera shake (used when a foundation slams into the ground)
  let shakeLeft = 0;
  let shakeDur = 0;
  let shakeAmp = 0;
  const shakeBase = new THREE.Vector3();

  function clampTarget() {
    const t = controls.target;
    const d = Math.hypot(t.x, t.z);
    if (d > CAMERA.panLimit) {
      const k = CAMERA.panLimit / d;
      t.x *= k;
      t.z *= k;
    }
    t.y = clamp(t.y, -2, 12);
  }

  /** Position that views `point` from the current azimuth (or a given one). */
  function viewpointFor(point, { distance = 52, azimuth = null, polar = 0.85 } = {}) {
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    const phi = clamp(polar, CAMERA.minPolar + 0.05, CAMERA.maxPolar - 0.05);
    const theta = azimuth === null ? sph.theta : azimuth;
    const out = new THREE.Vector3().setFromSpherical(new THREE.Spherical(distance, phi, theta));
    return out.add(point);
  }

  const rig = {
    controls,
    camera,

    get isCinematic() {
      return cinematic;
    },

    setPlayerControlEnabled(on) {
      controls.enabled = on;
    },

    update(dt) {
      if (shakeLeft > 0) {
        shakeLeft -= dt;
        if (shakeLeft <= 0) {
          camera.position.copy(shakeBase);
        } else {
          const k = (shakeLeft / shakeDur) ** 2;
          camera.position.set(
            shakeBase.x + (Math.random() - 0.5) * shakeAmp * k,
            shakeBase.y + (Math.random() - 0.5) * shakeAmp * k,
            shakeBase.z + (Math.random() - 0.5) * shakeAmp * k
          );
        }
      }
      if (cinematic) {
        camera.lookAt(lookAt);
      } else {
        clampTarget();
        controls.update();
      }
    },

    /**
     * Take the camera under script control without moving it yet - the guided
     * tour drives the position itself while following the group.
     */
    beginCinematic() {
      cinematic = true;
      controls.enabled = false;
    },

    /** A short, gentle shake. Never used outside of the construction impact. */
    shake(amplitude = 0.6, duration = 0.45) {
      shakeBase.copy(camera.position);
      shakeAmp = amplitude;
      shakeDur = duration;
      shakeLeft = duration;
    },

    /** Smoothly fly the camera to look at a point in the world. */
    async focusOn(point, opts = {}) {
      const { duration = 1.6, ease = Ease.cubicInOut } = opts;
      const targetPos = viewpointFor(point, opts);
      return rig.flyTo(targetPos, point, duration, ease);
    },

    /** Low-level move: camera position + look-at, both eased. */
    async flyTo(position, target, duration = 1.6, ease = Ease.cubicInOut) {
      cinematic = true;
      const fromPos = camera.position.clone();
      const fromLook = lookAt.clone();
      const toPos = position.clone();
      const toLook = target.clone();
      await tween(
        duration,
        (t) => {
          camera.position.lerpVectors(fromPos, toPos, t);
          lookAt.lerpVectors(fromLook, toLook, t);
        },
        { ease }
      ).promise;
      controls.target.copy(toLook);
      return rig;
    },

    /** Hand control back to the player from wherever the camera ended up. */
    releaseToPlayer() {
      cinematic = false;
      controls.target.copy(lookAt);
      controls.update();
    },

    /** Return to the default city-builder framing. */
    async returnHome(duration = 1.8) {
      await rig.flyTo(home.position, home.target, duration, Ease.cubicInOut);
      rig.releaseToPlayer();
    },

    /** Remember the current framing as "home" (used after the finale). */
    setHome(position, target) {
      home.position.copy(position);
      home.target.copy(target);
    },

    snapHome() {
      camera.position.copy(home.position);
      controls.target.copy(home.target);
      lookAt.copy(home.target);
      cinematic = false;
      controls.update();
    },

    lookAtVector: lookAt,
    viewpointFor,
  };

  return rig;
}

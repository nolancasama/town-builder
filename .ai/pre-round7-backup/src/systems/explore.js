import * as THREE from 'three';

/**
 * EXPLORE MODE
 * ------------
 * After the finale the player can wander the finished town and tap any building
 * to review its English name and sentence. Taps are distinguished from camera
 * drags by how far the pointer travelled, so rotating the view never fires a
 * selection by accident.
 */
export function createExplore({ domElement, camera, rig, hud, landmarks }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const down = { x: 0, y: 0, time: 0 };
  let enabled = false;
  let clearTimer = null;

  function onPointerDown(e) {
    down.x = e.clientX;
    down.y = e.clientY;
    down.time = performance.now();
  }

  function onPointerUp(e) {
    if (!enabled) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    if (moved > 12 || performance.now() - down.time > 600) return;

    const rect = domElement.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);

    const targets = [...landmarks.values()];
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) {
      hud.showLandmarkCard(null);
      return;
    }

    // walk up to the landmark holder that owns the hit mesh
    let node = hits[0].object;
    while (node && !node.userData.type) node = node.parent;
    if (!node) return;

    hud.showLandmarkCard(node.userData.type);
    clearTimeout(clearTimer);
    clearTimer = setTimeout(() => hud.showLandmarkCard(null), 6000);

    const lot = node.userData.lot;
    const span = Math.max(lot.size[0], lot.size[1]);
    const bounds = new THREE.Box3().setFromObject(node);
    const height = bounds.max.y;
    rig.focusOn(new THREE.Vector3(node.position.x, height * 0.4, node.position.z), {
      distance: Math.max(34, span * 1.7),
      polar: 0.86,
      duration: 1.5,
    }).then(() => rig.releaseToPlayer());
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      clearTimeout(clearTimer);
      hud.showLandmarkCard(null);
    },
    dispose() {
      domElement.removeEventListener('pointerdown', onPointerDown);
      domElement.removeEventListener('pointerup', onPointerUp);
    },
  };
}

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const base = 'http://127.0.0.1:4178/?dev=1&target=1&skipIntro=1';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];

function watch(page) {
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().includes('404')) errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
}

async function readyPage() {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  watch(page);
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-form button').click();
  await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
  await page.evaluate(() => {
    for (const child of document.body.children) {
      if (child.id !== 'scene') child.style.visibility = 'hidden';
    }
  });
  return page;
}

const cameraChecks = [];
for (const type of ['school', 'library', 'hospital']) {
  const page = await readyPage();
  await page.evaluate(async (landmarkType) => {
    // Leave the camera at the completed-building hold instead of returning
    // home so the final framing can be measured and captured.
    window.game.rig.returnHome = async () => {};
    await window.game.buildLandmark(landmarkType);
  }, type);
  const check = await page.evaluate((landmarkType) => {
    const game = window.game;
    const holder = game.landmarks.get(landmarkType);
    const lot = holder.userData.lot;
    const dx = lot.entrance[0] - lot.pos[0];
    const dz = lot.entrance[1] - lot.pos[1];
    const dl = Math.hypot(dx, dz);
    const vx = game.camera.position.x - lot.pos[0];
    const vz = game.camera.position.z - lot.pos[1];
    const vl = Math.hypot(vx, vz);
    return {
      type: landmarkType,
      lot: lot.id,
      rotation: lot.rot,
      expectedAzimuth: Math.atan2(dx, dz),
      actualAzimuth: Math.atan2(vx, vz),
      frontDot: (dx * vx + dz * vz) / (dl * vl),
      camera: game.camera.position.toArray(),
    };
  }, type);
  cameraChecks.push(check);
  if (type === 'school' || type === 'hospital') {
    await page.screenshot({ path: `qa-evidence/construction-front-${type}.png` });
  }
  await page.close();
}

const paddyPage = await readyPage();
const paddyAudit = await paddyPage.evaluate(async () => {
  const THREE = await import('/node_modules/three/build/three.module.js');
  const scene = window.game.scene;
  scene.updateMatrixWorld(true);
  const paddy = scene.getObjectByName('paddies');
  const plots = paddy.userData.plotRects;
  const scenery = scene.getObjectByName('scenery');
  const trees = scene.getObjectByName('trees');
  const intrusions = [];
  let checked = 0;

  const overlappingPlots = (box) => plots.filter((plot) => {
    const minX = plot.x - plot.w / 2;
    const maxX = plot.x + plot.w / 2;
    const minZ = plot.z - plot.d / 2;
    const maxZ = plot.z + plot.d / 2;
    return box.max.x > minX + 1e-4 && box.min.x < maxX - 1e-4
      && box.max.z > minZ + 1e-4 && box.min.z < maxZ - 1e-4;
  });

  for (const collection of scenery.children) {
    for (const object of collection.children) {
      checked++;
      const box = new THREE.Box3().setFromObject(object);
      const hits = overlappingPlots(box);
      if (hits.length) intrusions.push({
        kind: collection === scenery.children[0] ? 'building' : 'prop',
        id: object.name || object.uuid,
        position: object.position.toArray(),
        footprint: object.userData.footprint,
        box: { min: box.min.toArray(), max: box.max.toArray() },
        plots: hits,
      });
    }
  }

  const instanceMatrix = new THREE.Matrix4();
  const worldMatrix = new THREE.Matrix4();
  for (const instanced of trees.children) {
    instanced.geometry.computeBoundingBox();
    for (let i = 0; i < instanced.count; i++) {
      checked++;
      instanced.getMatrixAt(i, instanceMatrix);
      worldMatrix.multiplyMatrices(instanced.matrixWorld, instanceMatrix);
      const box = instanced.geometry.boundingBox.clone().applyMatrix4(worldMatrix);
      const hits = overlappingPlots(box);
      if (hits.length) intrusions.push({
        kind: 'tree', id: `${instanced.uuid}:${i}`,
        position: [worldMatrix.elements[12], worldMatrix.elements[13], worldMatrix.elements[14]],
        box: { min: box.min.toArray(), max: box.max.toArray() },
        plots: hits,
      });
    }
  }

  window.game.rig.beginCinematic();
  window.game.camera.position.set(-86, 34, 91);
  window.game.rig.lookAtVector.set(-54, 0, 62);
  return { plotCount: plots.length, checked, intrusionCount: intrusions.length, intrusions };
});
await paddyPage.waitForTimeout(500);
await paddyPage.screenshot({ path: 'qa-evidence/paddy-clearance.png' });
await paddyPage.close();

const report = { cameraChecks, paddyAudit, errors };
await writeFile('qa-evidence/camera-paddy-verification.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (errors.length || cameraChecks.some((check) => check.frontDot < 0.999)
  || paddyAudit.intrusionCount !== 0) process.exitCode = 1;

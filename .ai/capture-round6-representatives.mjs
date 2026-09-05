import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const types = [
  'bakery', 'house',
  'library', 'hospital', 'aquarium', 'pool',
  'mall', 'zoo', 'airport', 'school', 'station', 'amusementPark',
  'stadium',
];
const outputDir = 'qa-evidence/round6';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  const value = message.text();
  if (message.type() === 'error' && !value.includes('assets/buildings/')) errors.push(value);
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto('http://127.0.0.1:4184/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
await page.evaluate(() => {
  for (const child of document.body.children) {
    if (child.id !== 'scene') child.style.visibility = 'hidden';
  }
  window.game.rig.beginCinematic();
});

const results = [];
for (const type of types) {
  const mounted = await page.evaluate(async (requestedType) => {
    const game = window.game;
    if (game.__round6Holder) game.scene.remove(game.__round6Holder);
    if (game.__round6Lot) {
      const oldDressing = game.world.dressings.get(game.__round6Lot.id);
      if (oldDressing) oldDressing.group.visible = true;
    }
    game.world.clearLotSidewalks();

    const [{ loadLandmark, selectLot }, { makeRng }, THREE] = await Promise.all([
      import('/src/buildings/index.js'),
      import('/src/core/rng.js'),
      import('/node_modules/.vite/deps/three.js'),
    ]);
    const lot = selectLot(requestedType, new Set());
    const holder = await loadLandmark(requestedType, lot, makeRng(0x600d + requestedType.length));
    holder.visible = true;
    game.scene.add(holder);
    game.world.addLotSidewalk(lot);
    const dressing = game.world.dressings.get(lot.id);
    if (dressing) dressing.group.visible = false;
    game.__round6Holder = holder;
    game.__round6Lot = lot;

    holder.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(holder);
    const height = bounds.max.y - bounds.min.y;
    return { lot, height };
  }, type);

  await page.evaluate(() => {
    const game = window.game;
    game.camera.position.set(68, 76, 96);
    game.rig.lookAtVector.set(0, 0, -4);
  });
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${outputDir}/${type}-builder.png` });

  await page.evaluate(({ lot, height }) => {
    const game = window.game;
    const cx = lot.pos[0];
    const cz = lot.pos[1];
    let dx = lot.entrance[0] - cx;
    let dz = lot.entrance[1] - cz;
    const length = Math.hypot(dx, dz) || 1;
    dx /= length;
    dz /= length;
    const span = Math.max(...(lot.buildSize || lot.size));
    const distance = Math.max(25, span * 1.15);
    game.camera.position.set(
      cx + dx * distance - dz * distance * 0.2,
      Math.max(12, height * 0.75),
      cz + dz * distance + dx * distance * 0.2
    );
    game.rig.lookAtVector.set(cx, Math.min(height * 0.34, 7), cz);
  }, mounted);
  await page.waitForTimeout(220);
  await page.screenshot({ path: `${outputDir}/${type}-close.png` });

  if (type === 'airport') {
    await page.evaluate(({ lot, height }) => {
      const game = window.game;
      const [cx, cz] = lot.pos;
      game.camera.position.set(cx - 34, Math.max(22, height * 1.1), cz - 31);
      game.rig.lookAtVector.set(cx, 3, cz);
    }, mounted);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${outputDir}/airport-oblique.png` });

    await page.evaluate(({ lot }) => {
      const game = window.game;
      const [cx, cz] = lot.pos;
      game.camera.position.set(cx, 62, cz + 1);
      game.rig.lookAtVector.set(cx, 0, cz);
    }, mounted);
    await page.waitForTimeout(220);
    await page.screenshot({ path: `${outputDir}/airport-top.png` });
  }
  results.push({ type, lot: mounted.lot.id, class: mounted.lot.plotClass });
}

console.log(JSON.stringify({ results, errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;

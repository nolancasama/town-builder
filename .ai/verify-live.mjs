/**
 * Confirms the deployed site loads, builds the town, transfers no house-model
 * assets, and reaches playable state without errors.
 *
 * Usage: node .ai/verify-live.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] || 'https://nolancasama.github.io/town-builder/';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

const errs = [];
const failed = [];
let bytes = 0;
let buildingReqs = 0;
page.on('pageerror', (e) => errs.push(e.message));
page.on('requestfailed', (r) => failed.push(r.url().split('/').pop()));
page.on('response', async (r) => {
  if (/assets\/buildings/.test(r.url())) buildingReqs++;
  try {
    const len = Number((await r.allHeaders())['content-length'] || 0);
    if (Number.isFinite(len)) bytes += len;
  } catch { /* header read races with navigation; ignore */ }
});

const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#name-form button').click();
await page.waitForFunction(() => window.game && window.game.phase === 'choosing', null, { timeout: 90000 });
const playable = Date.now() - t0;

const stats = await page.evaluate(() => {
  let meshes = 0;
  const mats = new Set();
  window.game.scene.traverse((o) => { if (o.isMesh) { meshes++; mats.add(o.material.uuid); } });
  return { meshes, materials: mats.size };
});

await page.evaluate(() => window.game.rig.beginCinematic());
await page.evaluate(() => {
  const c = window.game.rig.camera;
  c.position.set(0, 55, 95);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'qa-evidence/live-after-spruce.png' });

console.log('url                ', url);
console.log('time to playable   ', playable + 'ms');
console.log('meshes / materials ', stats.meshes, '/', stats.materials);
console.log('building-asset reqs', buildingReqs, '(expect 0)');
console.log('transferred        ', (bytes / 1048576).toFixed(2) + 'MB');
console.log('page errors        ', errs.length, errs.slice(0, 3));
console.log('failed requests    ', failed.length, failed.slice(0, 5));

await browser.close();
process.exit(errs.length || buildingReqs ? 1 : 0);

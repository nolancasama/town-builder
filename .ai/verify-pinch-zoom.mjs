/**
 * Drives a real two-finger pinch at the canvas via CDP touch events and checks
 * the camera distance actually changes, in both directions.
 *
 * Usage: node .ai/verify-pinch-zoom.mjs [port]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5220;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
// hasTouch is what makes the page report touch support to OrbitControls
const context = await browser.newContext({
  viewport: { width: 900, height: 700 },
  hasTouch: true,
  isMobile: false,
});
const page = await context.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });
await page.waitForTimeout(600);

const cdp = await context.newCDPSession(page);
const dist = () => page.evaluate(() => {
  const c = window.game.rig.camera;
  const t = window.game.rig.controls ? window.game.rig.controls.target : { x: 0, y: 0, z: 0 };
  return Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z);
});

/** One pinch: two fingers moving from `from` half-separation to `to`. */
async function pinch(from, to, steps = 14) {
  const cx = 450;
  const cy = 350;
  const pt = (dx) => ({ x: cx + dx, y: cy, radiusX: 3, radiusY: 3, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [pt(-from), pt(from)],
  });
  for (let i = 1; i <= steps; i++) {
    const d = from + (to - from) * (i / steps);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [pt(-d), pt(d)],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
}

const start = await dist();
await pinch(40, 200);            // fingers apart => zoom in => distance shrinks
const afterOut = await dist();
await pinch(200, 40);            // fingers together => zoom out => distance grows
const afterIn = await dist();

const zoomedIn = afterOut < start - 0.5;
const zoomedBack = afterIn > afterOut + 0.5;
console.log(`start distance      ${start.toFixed(2)}`);
console.log(`after spreading     ${afterOut.toFixed(2)}   ${zoomedIn ? 'PASS zoomed in' : 'FAIL no change'}`);
console.log(`after pinching      ${afterIn.toFixed(2)}   ${zoomedBack ? 'PASS zoomed out' : 'FAIL no change'}`);
console.log('page errors:', errs.length, errs.slice(0, 3));

await browser.close();
process.exit(zoomedIn && zoomedBack && !errs.length ? 0 : 1);

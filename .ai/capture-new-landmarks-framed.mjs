/**
 * Re-framed photographs of the four 2026-11 landmarks. Aims at each holder's
 * WORLD position (holders are nested, so `.position` alone misleads) and faces
 * the entrance using the holder's world rotation (entrance is local +Z).
 *
 * Usage: node .ai/capture-new-landmarks-framed.mjs [port] [outDir]
 */
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const { chromium } = createRequire('C:/Users/nolan/ui-verify/')('playwright');

const port = Number(process.argv[2]) || 4191;
const outDir = process.argv[3] || 'qa-evidence/new-landmarks';
mkdirSync(outDir, { recursive: true });
const TYPES = ['hairSalon', 'vet', 'florist', 'sushiRestaurant'];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
const waitPhase = (x) => page.waitForFunction((w) => window.game && window.game.phase === w, x, { timeout: 90000 });
await waitPhase('choosing');

for (const want of TYPES) {
  await page.evaluate((w) => window.game.chooseType(w), want);
  await waitPhase('ready');
  await page.evaluate(() => window.game.succeed());
  await waitPhase('choosing');
  await page.waitForTimeout(2200);
}
// hide the choice UI so it does not cover the buildings
await page.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }' });

const frames = await page.evaluate((types) => {
  const out = {};
  for (const t of types) {
    const h = window.game.landmarks.get(t);
    h.updateMatrixWorld(true);
    const p = h.position.clone();
    h.getWorldPosition(p);
    const fwd = h.position.clone().set(0, 0, 1).transformDirection(h.matrixWorld);
    out[t] = { x: p.x, z: p.z, fx: fwd.x, fz: fwd.z };
  }
  return out;
}, TYPES);

const shoot = async (name, cam, look) => {
  await page.evaluate(({ cam, look }) => {
    window.game.rig.beginCinematic();
    const c = window.game.rig.camera;
    c.position.set(cam[0], cam[1], cam[2]);
    // the rig re-aims at its own lookAt vector every cinematic frame
    window.game.rig.lookAtVector.set(look[0], look[1], look[2]);
    c.lookAt(look[0], look[1], look[2]);
    c.updateMatrixWorld(true);
  }, { cam, look });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
};

const rot = (fx, fz, a) => [fx * Math.cos(a) - fz * Math.sin(a), fx * Math.sin(a) + fz * Math.cos(a)];
for (const t of TYPES) {
  const f = frames[t];
  const at = (a, r, h) => { const [dx, dz] = rot(f.fx, f.fz, a); return [f.x + dx * r, h, f.z + dz * r]; };
  await shoot(`${t}-front`, at(0.35, 17, 6.5), [f.x, 2.8, f.z]);
  await shoot(`${t}-close`, at(-0.2, 10, 3.2), [f.x, 2.4, f.z]);
  await shoot(`${t}-rear`, at(Math.PI - 0.6, 18, 8), [f.x, 2.8, f.z]);
}

// fire every phase-2 activity, then photograph the result
await page.evaluate(async (types) => {
  const { LANDMARKS } = await import('/src/config/landmarks.js');
  const g = window.game;
  for (const t of types) for (const a of LANDMARKS[t].actionDefs) g.activities.trigger(t, a, g.landmarks.get(t));
}, TYPES);
await page.waitForTimeout(3500);
for (const t of TYPES) {
  const f = frames[t];
  const [dx, dz] = rot(f.fx, f.fz, 0.25);
  await shoot(`${t}-activity`, [f.x + dx * 15, 6, f.z + dz * 15], [f.x, 1.5, f.z]);
}

console.log('page errors:', errs.length, JSON.stringify(errs.slice(0, 5)));
await browser.close();

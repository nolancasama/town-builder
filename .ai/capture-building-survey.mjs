/**
 * Survey shot set for the "spruce up the buildings" pass.
 * Photographs the starting-town houses/shops plus a spread of landmarks so the
 * current look can be judged before anything is changed.
 *
 * Usage: node .ai/capture-building-survey.mjs [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const port = Number(process.argv[2]) || 5199;
const outDir = process.argv[3] || 'qa-evidence/survey';
mkdirSync(outDir, { recursive: true });

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
const waitPhase = (x) => page.waitForFunction((w) => window.game && window.game.phase === w, x, { timeout: 60000 });
await waitPhase('choosing');
await page.evaluate(() => window.game.rig.beginCinematic());

const shoot = async (name, cam, look) => {
  await page.evaluate(({ cam, look }) => {
    const c = window.game.rig.camera;
    c.position.set(cam[0], cam[1], cam[2]);
    c.lookAt(look[0], look[1], look[2]);
    c.updateMatrixWorld(true);
  }, { cam, look });
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log('shot', name);
};

// Starting town: the procedural houses and shops that line the streets.
await shoot('town-overview', [0, 55, 95], [0, 0, 0]);
await shoot('houses-street', [18, 9, 34], [2, 3, 8]);
await shoot('houses-close', [-26, 7, 26], [-14, 3, 12]);
await shoot('shops-street', [-6, 8, -26], [4, 3, -12]);

// Build a spread of landmarks, then photograph each one.
const wanted = ['school', 'hospital', 'bakery', 'library', 'station', 'park'];
for (const want of wanted) {
  const ok = await page.evaluate(async (w) => {
    const g = window.game;
    if (g.landmarks.get(w)) return true;
    try { g.chooseType(w); } catch { return false; }
    return true;
  }, want);
  if (!ok) { console.log('skip', want); continue; }
  try {
    await waitPhase('ready');
    await page.evaluate(() => window.game.succeed());
    await waitPhase('choosing');
  } catch { console.log('could not build', want); continue; }
  await page.waitForTimeout(2600);
  await page.evaluate(() => window.game.rig.beginCinematic());

  const t = await page.evaluate(async (w) => {
    const { LANDMARK_LOTS } = await import('/src/config/town.js');
    const obj = window.game.landmarks.get(w);
    if (!obj) return null;
    const best = LANDMARK_LOTS.reduce((b, l) => {
      const d = Math.hypot(l.pos[0] - obj.position.x, l.pos[1] - obj.position.z);
      return (!b || d < b.d) ? { l, d } : b;
    }, null);
    return best && best.d < 2 ? { pos: best.l.pos, ent: best.l.entrance } : null;
  }, want);
  if (!t) { console.log('no lot for', want); continue; }
  const a = Math.atan2(t.ent[0] - t.pos[0], t.ent[1] - t.pos[1]) + 0.6;
  await shoot(`landmark-${want}`, [t.pos[0] + Math.sin(a) * 30, 12, t.pos[1] + Math.cos(a) * 30], [t.pos[0], 4, t.pos[1]]);
}

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();

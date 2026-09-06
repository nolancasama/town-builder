/**
 * Renders every Kenney character key in-game and saves a labelled contact sheet,
 * so a character can be chosen by looking at it rather than guessing from its
 * UV atlas.
 *
 * Usage: node .ai/capture-character-sheet.mjs [port]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5199;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1400, height: 400 } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 160)));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

const keys = await page.evaluate(async () => {
  const mod = await import('/src/world/characterModels.js');
  return mod.CHARACTER_MODEL_KEYS || 'abcdefghijklmnopqr'.split('');
});

// Hide the HUD so it does not sit over the line-up.
await page.evaluate(() => { document.getElementById('hud').style.display = 'none'; });

const rows = [];
const perRow = 6;
for (let i = 0; i < keys.length; i += perRow) rows.push(keys.slice(i, i + perRow));

let n = 0;
for (const row of rows) {
  await page.evaluate(async (row) => {
    const THREE_MOD = await import('/src/world/characterModels.js');
    const g = window.game;
    const old = g.scene.getObjectByName('__sheet');
    if (old) old.removeFromParent();
    const holder = new g.scene.constructor();
    holder.name = '__sheet';
    row.forEach((key, i) => {
      const c = THREE_MOD.createCharacterModel(g.rng, { model: key });
      if (!c) return;
      c.position.set((i - (row.length - 1) / 2) * 2.4, 0, 0);
      c.rotation.y = 0;
      holder.add(c);
    });
    g.scene.add(holder);
    g.rig.beginCinematic();
    const cam = g.rig.camera;
    cam.position.set(0, 2.2, 9);
    cam.lookAt(0, 1.1, 0);
    cam.updateMatrixWorld(true);
  }, row);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `qa-evidence/char-row-${n}.png` });
  console.log('row', n, row.join(' '));
  n++;
}
await browser.close();

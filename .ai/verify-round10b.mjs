import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4200;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{ if(m.type()==='error'&&!m.text().includes('assets/buildings/')) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=6`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:60000});

// --- unlock-all shortcut ---
const before = await page.evaluate(async () => {
  const { ALL_TYPES } = await import('/src/config/landmarks.js');
  return { total: ALL_TYPES.length, unlocked: window.game.progression.unlockedSet().size };
});
await page.keyboard.press('u');
await page.waitForTimeout(600);
const after = await page.evaluate(() => ({
  unlocked: window.game.progression.unlockedSet().size,
  locked: window.game.progression.lockedTypes().length,
}));
// persists across reload?
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const persisted = await page.evaluate(() => window.game.progression.unlockedSet().size);
await page.keyboard.press('U');                       // shift+U resets
await page.waitForTimeout(400);
const reset = await page.evaluate(() => window.game.progression.unlockedSet().size);

// --- bus wheel orientation ---
await page.keyboard.press('u');
await waitPhase('choosing');
await page.evaluate(() => window.game.chooseType('busStation'));
await waitPhase('ready');
await page.evaluate(() => window.game.succeed());
await waitPhase('choosing');
await page.waitForTimeout(2500);
const bus = await page.evaluate(() => {
  const g = window.game.landmarks.get('busStation');
  if (!g) return { error: 'busStation not built', built: window.game.built };
  const wheels = [];
  g.traverse(o => {
    if (o.geometry?.type === 'CylinderGeometry'
      && Math.abs(o.geometry.parameters.radiusTop - 0.55) < 1e-6) {
      wheels.push({ rx:+o.rotation.x.toFixed(3), ry:+o.rotation.y.toFixed(3), rz:+o.rotation.z.toFixed(3) });
    }
  });
  return { built: window.game.built, wheelCount: wheels.length, wheels };
});
console.log(JSON.stringify({ before, after, persisted, reset, busWheels: bus, errors: errs }, null, 2));
await browser.close();

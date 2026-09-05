import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4193;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=8`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:90000});
for (let i=0;i<5;i++){ await waitPhase('choosing'); await page.keyboard.press('Shift+B');
  await waitPhase('ready'); await page.keyboard.press('Shift+B'); await page.waitForTimeout(300); }
await waitPhase('choosing');
await page.waitForTimeout(2500);

// Reproduce the Phase 2 shrink exactly: a large population drop while agents
// are on screen. Watch every frame for an agent that blinks out in place.
const r = await page.evaluate(async () => {
  const root = window.game.scene.getObjectByName('pedestrians');
  const before = root.children.filter(c => c.visible).length;
  const seen = new Map();
  let instantHides = 0, sampled = 0;
  const record = () => {
    for (const g of root.children) {
      const prev = seen.get(g.uuid);
      if (prev && prev.vis && !g.visible) {
        // an agent that vanished without having reached the retiring state
        if (prev.state !== 'retiring' && !prev.retiring) instantHides++;
      }
      seen.set(g.uuid, { vis: g.visible, state: g.userData.motionState, retiring: g.userData.retiring });
    }
    sampled++;
  };
  record();
  window.game.pedestrians.setPopulation(Math.max(1, Math.round(before * 0.6)));  // the ~40% drop
  await new Promise(res => {
    let n = 0;
    const tick = () => { record(); if (++n < 240) requestAnimationFrame(tick); else res(); };
    requestAnimationFrame(tick);
  });
  const after = root.children.filter(c => c.visible).length;
  const retiring = root.children.filter(c => c.userData.retiring).length;
  return { before, requested: Math.max(1, Math.round(before * 0.6)), after, retiring, instantHides, framesSampled: sampled };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();

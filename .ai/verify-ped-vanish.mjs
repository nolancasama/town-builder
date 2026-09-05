import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4191;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=3`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

// install tracker BEFORE the finale so we catch the boundary
await page.evaluate(() => {
  const root = window.game.scene.getObjectByName('pedestrians');
  window.__t = { events: [], phases: [] };
  const last = new Map();
  let lastPhase = null;
  const tick = () => {
    const g0 = window.game;
    if (g0.phase !== lastPhase) {
      window.__t.phases.push({ phase: g0.phase, visible: root.children.filter(c => c.visible).length });
      lastPhase = g0.phase;
    }
    let vanishedThisFrame = 0;
    for (const g of root.children) {
      const prev = last.get(g.uuid);
      if (prev && prev.vis && !g.visible) vanishedThisFrame++;
      last.set(g.uuid, { vis: g.visible });
    }
    if (vanishedThisFrame > 0) {
      window.__t.events.push({ phase: g0.phase, vanished: vanishedThisFrame,
        stillVisible: root.children.filter(c => c.visible).length });
    }
    window.__raf = requestAnimationFrame(tick);
  };
  tick();
});

const waitPhase = async (want, timeout = 60000) => {
  await page.waitForFunction((w) => window.game && window.game.phase === w, want, { timeout });
};
for (let i = 0; i < 3; i++) {
  await waitPhase('choosing');
  await page.keyboard.press('Shift+B');          // pick the first card
  await waitPhase('ready');
  await page.keyboard.press('Shift+B');          // succeed without speaking
  await page.waitForTimeout(500);
}
// ride through the finale and into the speaking tour
await page.waitForFunction(() => window.game.phase === 'finale', null, { timeout: 90000 });
try {
  await page.waitForFunction(() => window.game.phase !== 'finale', null, { timeout: 150000 });
} catch { console.log('NOTE: never left finale within 150s'); }
await page.waitForTimeout(8000);

const r = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  return { phases: window.__t.phases, vanishEvents: window.__t.events,
           totalVanished: window.__t.events.reduce((s, e) => s + e.vanished, 0) };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();

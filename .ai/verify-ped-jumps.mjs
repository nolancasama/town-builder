import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4191;
const builds = Number(process.argv[3]) || 10;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

// build up the town so liveliness is at full load
for (let i = 0; i < builds; i++) {
  await page.keyboard.press('Shift+B');
  await page.waitForTimeout(900);
  await page.keyboard.press('Shift+B');
  await page.waitForTimeout(2600);
}

// install a per-frame tracker inside the live game
await page.evaluate(() => {
  const root = window.game.scene.getObjectByName('pedestrians');
  window.__track = { jumps: [], vanish: [], frames: 0, maxLegit: 2.5 * 0.05 };
  const last = new Map();
  const tick = () => {
    const t = window.__track;
    t.frames++;
    for (const g of root.children) {
      const prev = last.get(g.uuid);
      const cur = { x: g.position.x, z: g.position.z, vis: g.visible,
                    st: g.userData.motionState, y: g.userData.yielding };
      if (prev && prev.vis && cur.vis) {
        const d = Math.hypot(cur.x - prev.x, cur.z - prev.z);
        if (d > 0.3) t.jumps.push({ d: +d.toFixed(2), from: prev.st, to: cur.st, yielding: prev.y });
      }
      if (prev && prev.vis && !cur.vis) t.vanish.push({ st: prev.st, at: [+prev.x.toFixed(1), +prev.z.toFixed(1)] });
      last.set(g.uuid, cur);
    }
    window.__raf = requestAnimationFrame(tick);
  };
  tick();
});

await page.waitForTimeout(30000);

const r = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  const t = window.__track;
  const ds = t.jumps.map(j => j.d).sort((a, b) => a - b);
  const byTransition = {};
  for (const j of t.jumps) {
    const k = `${j.from} -> ${j.to}`;
    byTransition[k] = byTransition[k] || { n: 0, max: 0 };
    byTransition[k].n++;
    byTransition[k].max = Math.max(byTransition[k].max, j.d);
  }
  const vanishBy = {};
  for (const v of t.vanish) vanishBy[v.st] = (vanishBy[v.st] || 0) + 1;
  return {
    frames: t.frames,
    peds: window.game.scene.getObjectByName('pedestrians').children.length,
    maxLegitFrameMove: t.maxLegit,
    jumpCount: ds.length,
    jumpMedian: ds.length ? ds[(ds.length / 2) | 0] : 0,
    jumpMax: ds.length ? ds[ds.length - 1] : 0,
    jumpsOver5m: ds.filter(d => d > 5).length,
    jumpsOver20m: ds.filter(d => d > 20).length,
    byTransition,
    vanishCount: t.vanish.length,
    vanishBy,
  };
});
console.log(JSON.stringify(r, null, 2));
await browser.close();

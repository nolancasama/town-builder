/**
 * Extended traffic-flow audit, focused on junctions.
 *
 * Runs for minutes rather than seconds and reports, per vehicle, the longest
 * continuous period with no meaningful forward progress, where that happened,
 * and what the vehicle believed it was doing. Also reports throughput - total
 * distance covered - so a "fix" that simply freezes everything cannot pass.
 *
 * Usage: node .ai/audit-traffic-deadlock.mjs [port] [seconds]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5175;
const seconds = Number(process.argv[3]) || 180;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 900, height: 520 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

// Heavy traffic: this is about congestion, so load the roads up.
await page.evaluate(() => {
  window.game.pedestrians.setPopulation(48);
  window.game.vehicles.setTraffic(22, 0);
});
await page.waitForTimeout(1000);

await page.evaluate(() => {
  const g = window.game;
  const STILL_SPEED = 0.25;          // m/s below which a car counts as stopped
  const state = new Map();
  window.__t = {
    frames: 0,
    worstStall: 0,
    worstWhere: null,
    stallsOver3s: 0,
    stallsOver8s: 0,
    stallsOver15s: 0,
    distance: 0,
    junctionStallSamples: 0,
    samples: 0,
  };
  // Junction positions, so a stall can be attributed to an intersection.
  const nodes = [...g.world.graph.nodes].map((n) => ({ x: n.pos.x, z: n.pos.y }));
  const nearJunction = (x, z) => nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 11);

  let last = performance.now();
  window.__tick = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    const t = window.__t;
    t.frames++;
    const cars = g.vehicles.root.children.filter((c) => c.visible && c.userData.length);
    for (const c of cars) {
      const id = c.uuid;
      let s = state.get(id);
      if (!s) { s = { x: c.position.x, z: c.position.z, stillMs: 0 }; state.set(id, s); }
      const moved = Math.hypot(c.position.x - s.x, c.position.z - s.z);
      t.distance += moved;
      const speed = (c.userData.speed || 0);
      t.samples++;
      if (speed < STILL_SPEED && moved < 0.04) {
        s.stillMs += dt;
        if (nearJunction(c.position.x, c.position.z)) t.junctionStallSamples++;
        if (s.stillMs > t.worstStall) {
          t.worstStall = s.stillMs;
          t.worstWhere = {
            x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1),
            atJunction: nearJunction(c.position.x, c.position.z),
            yielding: Boolean(c.userData.yielding),
            speed: +speed.toFixed(2),
          };
        }
      } else {
        if (s.stillMs > 15000) t.stallsOver15s++;
        else if (s.stillMs > 8000) t.stallsOver8s++;
        else if (s.stillMs > 3000) t.stallsOver3s++;
        s.stillMs = 0;
      }
      s.x = c.position.x;
      s.z = c.position.z;
    }
  };
  const loop = () => { window.__tick(); window.__raf = requestAnimationFrame(loop); };
  loop();
});

await page.waitForTimeout(seconds * 1000);

const out = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  const t = window.__t;
  return {
    ...t,
    worstStall: Math.round(t.worstStall),
    distance: Math.round(t.distance),
    junctionStallShare: t.samples ? +(t.junctionStallSamples / t.samples * 100).toFixed(1) : 0,
  };
});

console.log(`ran ${seconds}s, ${out.frames} frames`);
console.log('total distance driven   :', out.distance, 'm');
console.log('worst single stall      :', out.worstStall, 'ms');
console.log('  where                 :', JSON.stringify(out.worstWhere));
console.log('stalls  >3s / >8s / >15s:', out.stallsOver3s, '/', out.stallsOver8s, '/', out.stallsOver15s);
console.log('samples stalled at a junction:', out.junctionStallShare + '%');
console.log('page errors             :', errs.length, errs.slice(0, 3));

await browser.close();

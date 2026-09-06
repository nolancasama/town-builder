/**
 * Fast-forward traffic audit.
 *
 * Drives pedestrians.update() and vehicles.update() directly at a fixed 1/60s
 * timestep instead of relying on the render loop. Under SwiftShader the render
 * loop manages about 4.6 FPS, so each step is ~216ms and a car teleports ~1.5m
 * per frame - which hides precisely the tight frame-to-frame interactions that
 * cause gridlock on a real machine at 60 FPS. This simulates minutes of traffic
 * in seconds, at the timestep players actually get.
 *
 * Reports the deadlock signature specifically: several cars stopped around the
 * SAME junction at the SAME time, and for how long.
 *
 * Usage: node .ai/audit-traffic-fastforward.mjs [port] [simSeconds] [cars]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5175;
const simSeconds = Number(process.argv[3]) || 300;
const cars = Number(process.argv[4]) || 22;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

const out = await page.evaluate(async ({ simSeconds, cars }) => {
  const g = window.game;
  g.pedestrians.setPopulation(48);
  g.vehicles.setTraffic(cars, 10);       // bikes included: they share the road

  const DT = 1 / 60;
  const STEPS = Math.round(simSeconds / DT);
  const STILL_SPEED = 0.25;

  // The vehicle timers (yield breaker, follow creep, overlap rollback) are keyed
  // to performance.now(). Fast-forwarding advances simulation time far faster
  // than wall-clock, so without this those breakers would never fire and the
  // harness would invent deadlocks that do not happen in real play. Advance a
  // virtual clock in lockstep with the simulation instead.
  const realNow = performance.now.bind(performance);
  let virtual = realNow();
  performance.now = () => virtual;

  const nodes = [...g.world.graph.nodes].map((n) => ({ x: n.pos.x, z: n.pos.y }));
  const nearestJunction = (x, z) => {
    let best = -1;
    let bestD = 12;
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const state = new Map();
  const res = {
    steps: 0, distance: 0,
    worstStall: 0, worstWhere: null,
    stalls3: 0, stalls8: 0, stalls15: 0,
    worstCluster: 0, worstClusterMs: 0, worstClusterAt: null,
    clusterEvents: 0,
  };
  // junction index -> ms that 2+ cars have been simultaneously stopped there
  const clusterMs = new Map();

  for (let step = 0; step < STEPS; step++) {
    virtual += DT * 1000;
    g.pedestrians.update(DT);
    g.vehicles.update(DT);
    res.steps++;

    const list = g.vehicles.root.children.filter((c) => c.visible && c.userData.length);
    const stalledAt = new Map();

    for (const c of list) {
      const id = c.uuid;
      let s = state.get(id);
      if (!s) { s = { x: c.position.x, z: c.position.z, stillMs: 0 }; state.set(id, s); }
      const moved = Math.hypot(c.position.x - s.x, c.position.z - s.z);
      res.distance += moved;
      const speed = c.userData.speed || 0;

      if (speed < STILL_SPEED && moved < 0.004) {
        s.stillMs += DT * 1000;
        if (s.stillMs > res.worstStall) {
          const j = nearestJunction(c.position.x, c.position.z);
          res.worstStall = s.stillMs;
          res.worstWhere = {
            x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1),
            atJunction: j >= 0, yielding: Boolean(c.userData.yielding),
            junctionState: c.userData.junctionState,
            waitingFor: c.userData.waitingFor,
            followGap: Number.isFinite(c.userData.followGap)
              ? +c.userData.followGap.toFixed(2) : 'clear',
          };
        }
        if (s.stillMs > 400) {
          const j = nearestJunction(c.position.x, c.position.z);
          if (j >= 0) stalledAt.set(j, (stalledAt.get(j) || 0) + 1);
        }
      } else {
        if (s.stillMs > 15000) res.stalls15++;
        else if (s.stillMs > 8000) res.stalls8++;
        else if (s.stillMs > 3000) res.stalls3++;
        s.stillMs = 0;
      }
      s.x = c.position.x;
      s.z = c.position.z;
    }

    // deadlock signature: two or more cars stopped around one junction
    for (const [j, n] of stalledAt) {
      if (n >= 2) {
        const ms = (clusterMs.get(j) || 0) + DT * 1000;
        clusterMs.set(j, ms);
        if (ms > res.worstClusterMs) {
          res.worstClusterMs = ms;
          res.worstCluster = n;
          res.worstClusterAt = { x: +nodes[j].x.toFixed(1), z: +nodes[j].z.toFixed(1), cars: n };
        }
      }
    }
    for (const j of [...clusterMs.keys()]) {
      if (!stalledAt.has(j) || stalledAt.get(j) < 2) {
        if (clusterMs.get(j) > 3000) res.clusterEvents++;
        clusterMs.delete(j);
      }
    }
  }

  performance.now = realNow;
  return {
    ...res,
    distance: Math.round(res.distance),
    worstStall: Math.round(res.worstStall),
    worstClusterMs: Math.round(res.worstClusterMs),
    activeCars: g.vehicles.root.children.filter((c) => c.visible && c.userData.length).length,
    recycles: g.vehicles.stats ? g.vehicles.stats().recycles : -1,
  };
}, { simSeconds, cars });

console.log(`simulated ${simSeconds}s at 1/60 (${out.steps} steps), ${out.activeCars} cars`);
console.log('total distance driven      :', out.distance, 'm');
console.log('worst single stall         :', out.worstStall, 'ms', JSON.stringify(out.worstWhere));
console.log('stalls  >3s / >8s / >15s   :', out.stalls3, '/', out.stalls8, '/', out.stalls15);
console.log('worst junction pile-up     :', out.worstCluster, 'cars for', out.worstClusterMs, 'ms',
  JSON.stringify(out.worstClusterAt));
console.log('pile-ups lasting over 3s   :', out.clusterEvents);
console.log('failsafe recycles          :', out.recycles, `(1 per ${out.recycles ? Math.round(300 / out.recycles) : '-'}s of sim)`);
console.log('page errors                :', errs.length, errs.slice(0, 3));

await browser.close();

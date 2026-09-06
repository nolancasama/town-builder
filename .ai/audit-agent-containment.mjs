/**
 * Baseline measurement for the containment work. Answers four questions with
 * numbers instead of guesses:
 *
 *   1. do pedestrians walk through buildings?      (reserved-rect penetration)
 *   2. do pedestrians leave the playable map?      (distance past flatRadius)
 *   3. do cars stay on the road network?           (distance to carriageway)
 *   4. do cars spawn on top of each other?         (overlap at t=0)
 *
 * Car-to-car overlap is reported for information only. Cars deliberately pass
 * through one another - see DESIGN_DECISIONS.md - so a non-zero count here is
 * expected behaviour, not a defect.
 *
 * Reads the live Occupancy rects, so "inside a building" means the same thing
 * the game's own placement code means by it.
 *
 * Usage: node .ai/audit-agent-containment.mjs [port]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5174;
const DURATION_MS = 40_000;

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

// Build a spread of landmarks first: their footprints are the big ones, and an
// empty town would only ever test the ambient houses.
await page.evaluate(async () => {
  const g = window.game;
  for (const type of ['school', 'hospital', 'bakery', 'library', 'park', 'hotel']) {
    try {
      g.chooseType(type);
      await new Promise((r) => setTimeout(r, 60));
      g.succeed();
      await new Promise((r) => setTimeout(r, 900));
    } catch { /* not offerable right now; skip it */ }
  }
});
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 60000 });
await page.waitForTimeout(800);

// Busy town: plenty of agents and traffic to catch the rare cases.
await page.evaluate(() => {
  window.game.pedestrians.setPopulation(48);
  window.game.vehicles.setTraffic(16, 0);
});
await page.waitForTimeout(1200);

// Spawn-time car overlap, sampled by re-seeding traffic a few times.
const spawnOverlaps = await page.evaluate(() => {
  let worst = 0;
  let overlaps = 0;
  for (let round = 0; round < 6; round++) {
    window.game.vehicles.setTraffic(0, 0);
    window.game.vehicles.setTraffic(16, 0);
    const cars = window.game.vehicles.root.children.filter((c) => c.visible);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const d = Math.hypot(
          cars[i].position.x - cars[j].position.x,
          cars[i].position.z - cars[j].position.z
        );
        const need = ((cars[i].userData.length || 4) + (cars[j].userData.length || 4)) / 2;
        if (d < need) { overlaps++; worst = Math.max(worst, need - d); }
      }
    }
  }
  return { overlaps, worstPenetration: +worst.toFixed(2) };
});

await page.evaluate(() => {
  const g = window.game;

  /**
   * Real building footprints, not reserved lots.
   *
   * occ.rects covers whole landmark plots including their perimeter walk, so
   * testing against it counts a walker legitimately using a building's own
   * pavement as "inside the building". These are the actual wall footprints:
   * each ambient house/shop, and each landmark's built model, measured as an
   * oriented box from its local bounds plus its yaw.
   */
  const boxes = [];
  const addFrom = (obj, yaw) => {
    const pos = obj.position.clone();
    const rot = obj.rotation.y;
    obj.position.set(0, 0, 0);
    obj.rotation.y = 0;
    obj.updateMatrixWorld(true);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    obj.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      const e = m.matrixWorld.elements;
      for (const px of [bb.min.x, bb.max.x]) {
        for (const py of [bb.min.y, bb.max.y]) {
          for (const pz of [bb.min.z, bb.max.z]) {
            const wx = e[0] * px + e[4] * py + e[8] * pz + e[12];
            const wz = e[2] * px + e[6] * py + e[10] * pz + e[14];
            if (wx < minX) minX = wx; if (wx > maxX) maxX = wx;
            if (wz < minZ) minZ = wz; if (wz > maxZ) maxZ = wz;
          }
        }
      }
    });
    obj.position.copy(pos);
    obj.rotation.y = rot;
    obj.updateMatrixWorld(true);
    if (!Number.isFinite(minX)) return;
    const a = yaw !== undefined ? yaw : rot;
    boxes.push({
      x: pos.x, z: pos.z,
      hw: (maxX - minX) / 2, hd: (maxZ - minZ) / 2,
      cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
      cos: Math.cos(-a), sin: Math.sin(-a),
    });
  };

  const scenery = g.scene.getObjectByName('scenery');
  if (scenery) {
    for (const group of scenery.children) {
      for (const b of group.children) if (b.userData.footprint) addFrom(b);
    }
  }
  for (const holder of g.landmarks.values()) addFrom(holder, holder.rotation.y);

  /** Penetration depth into an oriented building box, 0 if outside. */
  const depthInto = (it, x, z) => {
    const ox = x - it.x - (it.cx * Math.cos(-it.cos * 0) );
    // rotate the query point into the box frame, about the object origin
    const rx = (x - it.x) * it.cos - (z - it.z) * it.sin;
    const rz = (x - it.x) * it.sin + (z - it.z) * it.cos;
    const dx = it.hw - Math.abs(rx - it.cx);
    const dz = it.hd - Math.abs(rz - it.cz);
    return (dx > 0 && dz > 0) ? Math.min(dx, dz) : 0;
  };


  const CAR_W = 1.9;
  /**
   * Separating-axis overlap depth between two car bodies, 0 when clear.
   * Returns the smallest overlap across the four box axes - i.e. how deep one
   * body is inside the other.
   */
  const obbPenetration = (a, b) => {
    const boxOf = (c) => {
      const len = c.userData.length || 3.8;
      const yaw = c.rotation.y;
      return {
        x: c.position.x, z: c.position.z,
        ax: Math.sin(yaw), az: Math.cos(yaw),   // forward axis
        hl: len / 2, hw: CAR_W / 2,
      };
    };
    const A = boxOf(a), B = boxOf(b);
    const dx = B.x - A.x, dz = B.z - A.z;
    let best = Infinity;
    const axes = [
      [A.ax, A.az], [-A.az, A.ax],
      [B.ax, B.az], [-B.az, B.ax],
    ];
    for (const [ux, uz] of axes) {
      const dist = Math.abs(dx * ux + dz * uz);
      const ra = A.hl * Math.abs(A.ax * ux + A.az * uz) + A.hw * Math.abs(-A.az * ux + A.ax * uz);
      const rb = B.hl * Math.abs(B.ax * ux + B.az * uz) + B.hw * Math.abs(-B.az * ux + B.ax * uz);
      const overlap = ra + rb - dist;
      // Signed: positive means interpenetrating, negative is real clearance.
      // Once any axis separates, the true clearance is the largest such gap.
      if (overlap < best) best = overlap;
    }
    return best;
  };

  window.__probe = {
    frames: 0, buildings: boxes.length,
    carOffRoad: 0, carOffRoadWorst: 0,
    pedInBuilding: 0, pedInBuildingWorst: 0,
    pedOffMap: 0, pedOffMapWorst: 0,
    carCarOverlapFrames: 0, carCarWorst: 0, minCarGap: Infinity,
    flatRadius: 136,
  };

  window.__probeTick = () => {
    const p = window.__probe;
    p.frames++;
    const peds = g.pedestrians.root.children.filter((a) => a.visible);
    const cars = g.vehicles.root.children.filter((c) => c.visible && c.userData.length);

    for (const a of peds) {
      const x = a.position.x;
      const z = a.position.z;
      for (const it of boxes) {
        const d = depthInto(it, x, z);
        // 0.35m of grazing is tolerated: eaves, steps and porch trim are not walls
        if (d > 0.35) {
          p.pedInBuilding++;
          if (d > p.pedInBuildingWorst) p.pedInBuildingWorst = d;
          break;
        }
      }
      const out = Math.hypot(x, z) - p.flatRadius;
      if (out > 0) { p.pedOffMap++; if (out > p.pedOffMapWorst) p.pedOffMapWorst = out; }
    }

    // Oriented-box overlap, not centre distance: a circular test demands 3.8m
    // of separation between two 3.8m cars, so it reports oncoming traffic
    // passing 3.5m apart in opposite lanes as a collision when the bodies are
    // nowhere near touching. Cars are 1.9m wide, so orientation matters.
    for (const c of cars) {
      // Cars ride the road graph; more than half a metre outside the
      // carriageway would mean the path logic has gone wrong.
      const d = g.world.graph.distanceToRoad(c.position.x, c.position.z);
      if (d > 0.5) {
        p.carOffRoad++;
        if (d > p.carOffRoadWorst) p.carOffRoadWorst = d;
      }
    }

    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const pen = obbPenetration(a, b);
        const gap = -pen;
        if (gap < p.minCarGap) p.minCarGap = gap;
        if (pen > 0) { p.carCarOverlapFrames++; if (pen > p.carCarWorst) p.carCarWorst = pen; }
      }
    }
  };
  const loop = () => { window.__probeTick(); window.__raf = requestAnimationFrame(loop); };
  loop();
});

await page.waitForTimeout(DURATION_MS);

const out = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  const p = window.__probe;
  return {
    ...p,
    minCarGap: Number.isFinite(p.minCarGap) ? +p.minCarGap.toFixed(2) : null,
    pedInBuildingWorst: +p.pedInBuildingWorst.toFixed(2),
    pedOffMapWorst: +p.pedOffMapWorst.toFixed(2),
    carCarWorst: +p.carCarWorst.toFixed(2),
    carOffRoadWorst: +p.carOffRoadWorst.toFixed(2),
  };
});

console.log('building footprints      :', out.buildings);
console.log('flatRadius              :', out.flatRadius);
console.log('frames                  :', out.frames);
console.log('--- 1. pedestrians inside building footprints ---');
console.log('  agent-frames intruding:', out.pedInBuilding, ' worst depth:', out.pedInBuildingWorst, 'm');
console.log('--- 3. pedestrians off the map ---');
console.log('  agent-frames outside  :', out.pedOffMap, ' worst:', out.pedOffMapWorst, 'm');
console.log('--- 3. cars off the road network ---');
console.log('  car-frames off road   :', out.carOffRoad, ' worst:', (+out.carOffRoadWorst).toFixed(2), 'm');
console.log('--- car-car overlap (informational: cars pass through by design) ---');
console.log('  overlap frames        :', out.carCarOverlapFrames, ' worst:', out.carCarWorst, 'm');
console.log('  closest gap seen      :', out.minCarGap, 'm');
console.log('  spawn overlaps        :', spawnOverlaps.overlaps, ' worst:', spawnOverlaps.worstPenetration, 'm');
console.log('page errors             :', errs.length, errs.slice(0, 3));

await browser.close();

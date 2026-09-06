/**
 * Finds ambient buildings (houses/shops) whose real footprint overhangs the
 * sidewalk.
 *
 * Measures each building's LOCAL bounds rotated by its own yaw - the true
 * oriented outline - and samples that outline against graph.distanceToRoad(),
 * which already returns distance to the road EDGE. Anything closer than the
 * sidewalk width is standing on the walking surface.
 *
 * Usage: node .ai/audit-sidewalk-intrusion.mjs [base-url]
 */
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 160)));

await page.goto(`${base}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#name-form button').click();
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

const result = await page.evaluate(async () => {
  const SIDEWALK = 2.2;
  // Local bounds without importing three: transform each mesh's geometry bbox
  // corners by its own matrixWorld while the building sits unrotated at origin.
  const localBounds = (root) => {
    const b = {
      minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
    };
    root.traverse((m) => {
      if (!m.isMesh || !m.geometry) return;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      const e = m.matrixWorld.elements;
      for (const px of [bb.min.x, bb.max.x]) {
        for (const py of [bb.min.y, bb.max.y]) {
          for (const pz of [bb.min.z, bb.max.z]) {
            const wx = e[0] * px + e[4] * py + e[8] * pz + e[12];
            const wz = e[2] * px + e[6] * py + e[10] * pz + e[14];
            if (wx < b.minX) b.minX = wx;
            if (wx > b.maxX) b.maxX = wx;
            if (wz < b.minZ) b.minZ = wz;
            if (wz > b.maxZ) b.maxZ = wz;
          }
        }
      }
    });
    return b;
  };
  const graph = window.game.world.graph;
  const scenery = window.game.scene.getObjectByName('scenery');
  const buildings = scenery?.children.find((c) => c.children.some((b) => b.userData.footprint));
  if (!buildings) return { error: 'building group not found' };

  const rows = [];
  for (const b of buildings.children) {
    if (!b.userData.footprint) continue;
    // local outline: strip the placement transform, measure, then restore
    const pos = b.position.clone();
    const rot = b.rotation.y;
    b.position.set(0, 0, 0);
    b.rotation.y = 0;
    b.updateMatrixWorld(true);
    const local = localBounds(b);
    b.position.copy(pos);
    b.rotation.y = rot;
    b.updateMatrixWorld(true);

    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const mx = (local.minX + local.maxX) / 2;
    const mz = (local.minZ + local.maxZ) / 2;
    let worst = Infinity;
    for (const lx of [local.minX, mx, local.maxX]) {
      for (const lz of [local.minZ, mz, local.maxZ]) {
        const wx = pos.x + lx * cos + lz * sin;
        const wz = pos.z - lx * sin + lz * cos;
        const d = graph.distanceToRoad(wx, wz);
        if (d < worst) worst = d;
      }
    }
    // Does the front (+Z, rotated) actually point at the nearest street? Compare
    // the facing direction against the inward road-distance gradient.
    const e = 0.5;
    const gx = graph.distanceToRoad(pos.x + e, pos.z) - graph.distanceToRoad(pos.x - e, pos.z);
    const gz = graph.distanceToRoad(pos.x, pos.z + e) - graph.distanceToRoad(pos.x, pos.z - e);
    const glen = Math.hypot(gx, gz) || 1;
    // front vector for yaw `rot` is (sin rot, cos rot); toward-road is -gradient
    const dot = (Math.sin(rot) * -gx / glen) + (Math.cos(rot) * -gz / glen);
    const faceDeg = +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(0);

    rows.push({
      x: +pos.x.toFixed(1),
      z: +pos.z.toFixed(1),
      clearance: +worst.toFixed(2),
      intrusion: +(SIDEWALK - worst).toFixed(2),
      faceDeg,
    });
  }
  return { total: rows.length, rows };
});

if (result.error) { console.error(result.error); await browser.close(); process.exit(1); }

const onWalk = result.rows.filter((r) => r.intrusion > 0.05);
const onRoad = result.rows.filter((r) => r.clearance < 0);
onWalk.sort((a, b) => b.intrusion - a.intrusion);

// Anything more than 90 degrees off is presenting its back to the street.
const turnedAway = result.rows.filter((r) => r.faceDeg > 90);
const wellFaced = result.rows.filter((r) => r.faceDeg <= 30);

console.log(`ambient buildings measured: ${result.total}`);
console.log(`overhanging the sidewalk:   ${onWalk.length}`);
console.log(`actually over the roadway:  ${onRoad.length}`);
console.log(`facing the street (<=30deg): ${wellFaced.length}`);
console.log(`backs to the street (>90deg): ${turnedAway.length}`);
if (onWalk.length) {
  console.log('\nworst offenders (intrusion in metres past the sidewalk edge):');
  for (const r of onWalk.slice(0, 12)) {
    console.log(`  (${r.x}, ${r.z})  clearance ${r.clearance}m  intrudes ${r.intrusion}m`);
  }
}
await browser.close();
process.exit(onWalk.length ? 1 : 0);

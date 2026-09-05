/**
 * Measures every landmark's built geometry against the lot it is given.
 *
 * Builds each type through the real loadLandmark() and reads the model's LOCAL
 * bounding box - the model sits under a holder that carries the lot rotation, so
 * local space is already the lot's own frame and no rotation maths is needed.
 * Measuring a rotated building's world AABB instead badly overstates its size.
 *
 * Usage: node .ai/audit-landmark-extents.mjs [base-url]   (needs the dev server)
 */
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://localhost:5173';
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).slice(0, 160)));

await page.goto(`${base}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.locator('#name-form').waitFor({ timeout: 30000 });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 60000 });

const rows = await page.evaluate(async () => {
  const { LANDMARKS } = await import('/src/config/landmarks.js');
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const { loadLandmark } = await import('/src/buildings/index.js');

  const rng = window.game.rng;
  const out = [];
  for (const type of Object.keys(LANDMARKS)) {
    const def = LANDMARKS[type];
    // a lot of the right size class, unrotated so local space is easy to read
    const lot = LANDMARK_LOTS.find((l) => l.plotClass === def.sizeClass);
    if (!lot) continue;
    let holder;
    try {
      holder = await loadLandmark(type, { ...lot, rot: 0 }, rng);
    } catch (e) {
      out.push({ type, error: String(e).slice(0, 120) });
      continue;
    }
    const model = holder.userData.model;
    // the holder carries the lot transform; without updating from it the child
    // world matrices are still local and every measurement is offset by the lot
    holder.updateMatrixWorld(true);

    // true extent in the lot's own frame, from real vertices
    let maxX = 0, maxZ = 0;
    const worst = { x: null, z: null };
    model.traverse((m) => {
      if (!m.isMesh || !m.geometry?.attributes?.position) return;
      const pos = m.geometry.attributes.position;
      const e = m.matrixWorld.elements;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
        const wx = e[0] * px + e[4] * py + e[8] * pz + e[12];
        const wz = e[2] * px + e[6] * py + e[10] * pz + e[14];
        const ax = Math.abs(wx - holder.position.x);
        const az = Math.abs(wz - holder.position.z);
        if (ax > maxX) { maxX = ax; worst.x = m.name || m.parent?.name || '(unnamed)'; }
        if (az > maxZ) { maxZ = az; worst.z = m.name || m.parent?.name || '(unnamed)'; }
      }
    });

    const env = def.footprint;                       // usable envelope
    const plot = lot.size;                           // envelope + perimeter walk
    out.push({
      type,
      sizeClass: def.sizeClass,
      envelope: [env[0], env[1]],
      plot: [plot[0], plot[1]],
      builtW: +(maxX * 2).toFixed(2),
      builtD: +(maxZ * 2).toFixed(2),
      overEnvW: +(maxX * 2 - env[0]).toFixed(2),
      overEnvD: +(maxZ * 2 - env[1]).toFixed(2),
      overPlotW: +(maxX * 2 - plot[0]).toFixed(2),
      overPlotD: +(maxZ * 2 - plot[1]).toFixed(2),
      widestPart: worst.x, deepestPart: worst.z,
      source: holder.userData.source,
    });
  }
  return out;
});

const spilling = rows.filter((r) => !r.error && (r.overPlotW > 0.05 || r.overPlotD > 0.05));
const overEnvelope = rows.filter((r) => !r.error && (r.overEnvW > 0.05 || r.overEnvD > 0.05));
console.log(`landmarks measured: ${rows.length}`);
console.log(`\npast their PLOT (spills onto the public sidewalk): ${spilling.length}`);
for (const r of spilling.sort((a, b) => Math.max(b.overPlotW, b.overPlotD) - Math.max(a.overPlotW, a.overPlotD))) {
  console.log(' ', JSON.stringify(r));
}
console.log(`\npast their ENVELOPE but inside the plot (uses its own perimeter band): ${overEnvelope.length - spilling.length}`);
for (const r of overEnvelope.filter((r) => !spilling.includes(r)).slice(0, 10)) {
  console.log(' ', r.type, `+${Math.max(r.overEnvW, r.overEnvD)}m`, `(${r.deepestPart})`);
}
const errs = rows.filter((r) => r.error);
if (errs.length) console.log('\nfailed to build:', errs.map((e) => `${e.type}: ${e.error}`));

await browser.close();

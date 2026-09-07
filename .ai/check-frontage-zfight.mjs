// The lot frontage added when a landmark is built sits at WALK_TOP, the same
// height as the baked pavement. Any shared area between them z-fights.
import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:5177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const result = await page.evaluate(async () => {
  const { WALK_POLYGONS } = await import('/src/config/sidewalks.js');
  const { ALL_TYPES } = await import('/src/config/landmarks.js');
  const g = window.game;
  const built = []; const failed = [];
  for (const t of ALL_TYPES) {
    try { await g.buildLandmark(t); built.push(t); }
    catch (e) { failed.push(t + ': ' + (e && e.message)); }
  }

  const inside = (x, z, poly) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  };
  const onWalk = (x, z) => WALK_POLYGONS.some((p) => inside(x, z, p));

  const fronts = g.scene.children.filter((o) => o.name && o.name.startsWith('lot-frontage:'));
  let sampled = 0, overlapping = 0; const heights = [];
  const worst = [];
  for (const f of fronts) {
    f.updateMatrixWorld(true);
    const pos = f.geometry.getAttribute('position');
    const e = f.matrixWorld.elements;
    // sample triangle vertices in world space (manual transform: no bare 'three' import in page)
    let hits = 0, n = 0;
    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const wy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const wz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (Math.abs(wy - 0.28) > 0.05) continue; // top face only
      n++; sampled++;
      if (onWalk(wx, wz)) { hits++; overlapping++; heights.push(+wy.toFixed(4)); }
    }
    if (hits) worst.push({ lot: f.name, verticesOnPavement: hits, of: n });
  }
  const uniq = [...new Set(heights)];
  const coplanar = heights.filter((h) => Math.abs(h - 0.28) < 0.001).length;
  return { built: built.length, frontages: fronts.length, overlapHeights: uniq,
    verticesCoplanarWithPavement: coplanar, sampledTopVertices: sampled,
    verticesOverlappingPavement: overlapping, worst: worst.slice(0, 10) };
});
console.log(JSON.stringify(result, null, 2));
console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();

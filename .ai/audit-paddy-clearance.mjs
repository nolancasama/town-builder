import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 4191;
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('assets/buildings/')) {
    errors.push(message.text());
  }
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, {
  waitUntil: 'domcontentloaded',
});
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

const result = await page.evaluate(async () => {
  const { PADDY_FIELDS } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const plots = window.game.scene.getObjectByName('paddies')?.userData.plotRects || [];
  const edges = window.game.world.graph.edges;

  const pointSegmentDistance = (x, z, ax, az, bx, bz) => {
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t = lengthSq
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq))
      : 0;
    return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
  };

  const pointRectDistance = (x, z, minX, maxX, minZ, maxZ) => {
    const dx = x < minX ? minX - x : (x > maxX ? x - maxX : 0);
    const dz = z < minZ ? minZ - z : (z > maxZ ? z - maxZ : 0);
    return Math.hypot(dx, dz);
  };

  const segmentRectDistance = (edge, plot) => {
    const ax = edge.a.pos.x;
    const az = edge.a.pos.y;
    const bx = edge.b.pos.x;
    const bz = edge.b.pos.y;
    const minX = plot.x - plot.w / 2;
    const maxX = plot.x + plot.w / 2;
    const minZ = plot.z - plot.d / 2;
    const maxZ = plot.z + plot.d / 2;
    const dx = bx - ax;
    const dz = bz - az;
    let lo = 0;
    let hi = 1;
    for (const [p, v, min, max] of [[ax, dx, minX, maxX], [az, dz, minZ, maxZ]]) {
      if (Math.abs(v) < 1e-10) {
        if (p < min || p > max) { lo = 1; hi = 0; break; }
      } else {
        let t0 = (min - p) / v;
        let t1 = (max - p) / v;
        if (t0 > t1) [t0, t1] = [t1, t0];
        lo = Math.max(lo, t0);
        hi = Math.min(hi, t1);
      }
    }
    if (lo <= hi) return 0;
    return Math.min(
      pointRectDistance(ax, az, minX, maxX, minZ, maxZ),
      pointRectDistance(bx, bz, minX, maxX, minZ, maxZ),
      pointSegmentDistance(minX, minZ, ax, az, bx, bz),
      pointSegmentDistance(maxX, minZ, ax, az, bx, bz),
      pointSegmentDistance(maxX, maxZ, ax, az, bx, bz),
      pointSegmentDistance(minX, maxZ, ax, az, bx, bz)
    );
  };

  const clearances = plots.map((plot) => {
    let nearest = { clearance: Infinity };
    for (const edge of edges) {
      const roadSurfaceRadius = edge.width / 2
        + (SIDEWALK_BY_CLASS[edge.cls] || SIDEWALK_BY_CLASS.minor);
      const clearance = segmentRectDistance(edge, plot) - roadSurfaceRadius;
      if (clearance < nearest.clearance) nearest = { clearance, edge };
    }
    return {
      plot: [plot.x, plot.z],
      size: [plot.w, plot.d],
      clearance: +nearest.clearance.toFixed(4),
      road: [nearest.edge.a.pos.toArray(), nearest.edge.b.pos.toArray()],
      roadClass: nearest.edge.cls,
    };
  });
  const conflicts = clearances.filter((entry) => entry.clearance < -1e-4);
  const plotOverlaps = [];
  for (let i = 0; i < plots.length; i++) {
    for (let j = i + 1; j < plots.length; j++) {
      const a = plots[i];
      const b = plots[j];
      const overlapX = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
      const overlapZ = (a.d + b.d) / 2 - Math.abs(a.z - b.z);
      if (overlapX > 1e-4 && overlapZ > 1e-4) {
        plotOverlaps.push({ plots: [[a.x, a.z], [b.x, b.z]], overlapX, overlapZ });
      }
    }
  }
  const fieldsPlaced = PADDY_FIELDS.map((field) => ({
    position: field.pos,
    size: field.size,
    placed: plots.some((plot) => (
      Math.abs(plot.x - field.pos[0]) <= field.size[0] / 2
      && Math.abs(plot.z - field.pos[1]) <= field.size[1] / 2
    )),
  }));

  return {
    authoredFieldCount: PADDY_FIELDS.length,
    authoredFieldsPlaced: fieldsPlaced.filter((field) => field.placed).length,
    renderedPlotCount: plots.length,
    conflictCount: conflicts.length,
    plotOverlapCount: plotOverlaps.length,
    minimumClearance: Math.min(...clearances.map((entry) => entry.clearance)),
    conflicts,
    plotOverlaps,
    fieldsPlaced,
    clearances,
  };
});

console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
if (errors.length || result.authoredFieldsPlaced !== result.authoredFieldCount
  || result.conflictCount !== 0 || result.plotOverlapCount !== 0) process.exitCode = 1;

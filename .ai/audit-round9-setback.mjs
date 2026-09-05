import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4191;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

const out = await page.evaluate(async () => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;

  // distance from point to a road edge's centreline segment
  const segDist = (px, pz, e) => {
    const ax = e.a.pos.x, az = e.a.pos.y, bx = e.b.pos.x, bz = e.b.pos.y;
    const dx = bx - ax, dz = bz - az;
    const L2 = dx * dx + dz * dz;
    let t = L2 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  };

  const lots = LANDMARK_LOTS.map((lot) => {
    const [w, d] = lot.size, [cx, cz] = lot.pos;
    // sample the plot rectangle outline densely, find min gap to any road surface
    let best = { gap: Infinity };
    for (const e of graph.edges) {
      const walkW = SIDEWALK_BY_CLASS[e.cls] || 2.2;
      let minEdge = Infinity;
      for (let i = 0; i <= 40; i++) {
        for (const [sx, sz] of [[-1,-1],[1,-1],[1,1],[-1,1]]) {}
      }
      // sample perimeter
      for (let i = 0; i < 4; i++) {
        for (let t = 0; t <= 1; t += 0.02) {
          const corners = [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
          const p0 = corners[i], p1 = corners[(i+1)%4];
          const lx = p0[0] + (p1[0]-p0[0])*t, lz = p0[1] + (p1[1]-p0[1])*t;
          const a = lot.rot || 0, cos = Math.cos(a), sin = Math.sin(a);
          const x = cx + lx*cos + lz*sin, z = cz - lx*sin + lz*cos;
          minEdge = Math.min(minEdge, segDist(x, z, e) - e.width/2);
        }
      }
      const gapToWalkOuter = minEdge - walkW;
      if (minEdge < best.gap) best = { gap: minEdge, gapToWalkOuter, road: e.cls, roadW: e.width, walkW };
    }
    return { id: lot.id, cls: lot.plotClass, size: lot.size, gapToCarriageway: +best.gap.toFixed(2),
             gapToSidewalkOuter: +best.gapToWalkOuter.toFixed(2), nearestRoad: best.road };
  });

  // paddy plots vs roads
  const paddies = window.game.scene.getObjectByName('paddies');
  const plots = paddies?.userData.plotRects || [];
  const bad = [];
  for (const p of plots) {
    for (const e of graph.edges) {
      const walkW = SIDEWALK_BY_CLASS[e.cls] || 2.2;
      let minD = Infinity;
      for (let i = 0; i < 4; i++) {
        for (let t = 0; t <= 1; t += 0.05) {
          const c = [[-p.w/2,-p.d/2],[p.w/2,-p.d/2],[p.w/2,p.d/2],[-p.w/2,p.d/2]];
          const p0 = c[i], p1 = c[(i+1)%4];
          const x = p.x + p0[0] + (p1[0]-p0[0])*t, z = p.z + p0[1] + (p1[1]-p0[1])*t;
          minD = Math.min(minD, segDist(x, z, e) - e.width/2);
        }
      }
      if (minD < 0) bad.push({ plot: [ +p.x.toFixed(1), +p.z.toFixed(1) ], size: [p.w, p.d],
        overlapIntoCarriageway: +(-minD).toFixed(2), road: [[e.a.pos.x,e.a.pos.y],[e.b.pos.x,e.b.pos.y]], cls: e.cls });
      else if (minD < walkW) bad.push({ plot: [ +p.x.toFixed(1), +p.z.toFixed(1) ], size: [p.w, p.d],
        intrudesIntoSidewalkBy: +(walkW - minD).toFixed(2), road: [[e.a.pos.x,e.a.pos.y],[e.b.pos.x,e.b.pos.y]], cls: e.cls });
    }
  }
  return { lots, paddyConflicts: bad, paddyPlots: plots.length };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();

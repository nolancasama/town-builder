import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4192;
const TARGET_PLOT_GAP = Number(process.argv[3]) || 1.0;   // plot edge -> road sidewalk outer edge
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const out = await page.evaluate(async (TARGET) => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;
  const segDist = (px, pz, e) => {
    const ax=e.a.pos.x, az=e.a.pos.y, bx=e.b.pos.x, bz=e.b.pos.y;
    const dx=bx-ax, dz=bz-az, L2=dx*dx+dz*dz;
    let t = L2 ? ((px-ax)*dx + (pz-az)*dz)/L2 : 0; t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+dx*t), pz-(az+dz*t));
  };
  // world-space half extents of a rotated plot rect
  const halfExtent = (lot) => {
    const [w,d] = lot.size, a = lot.rot||0;
    const c=Math.abs(Math.cos(a)), s=Math.abs(Math.sin(a));
    return { x: (w*c + d*s)/2, z: (w*s + d*c)/2 };
  };
  const minGapToAnyRoad = (cx, cz, lot) => {
    const [w,d]=lot.size, a=lot.rot||0, cos=Math.cos(a), sin=Math.sin(a);
    let best=Infinity, worst=null;
    for (const e of graph.edges) {
      const walkW = SIDEWALK_BY_CLASS[e.cls] || 2.2;
      let m=Infinity;
      for (let i=0;i<4;i++) for (let t=0;t<=1;t+=0.02) {
        const c=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
        const p0=c[i], p1=c[(i+1)%4];
        const lx=p0[0]+(p1[0]-p0[0])*t, lz=p0[1]+(p1[1]-p0[1])*t;
        const x=cx+lx*cos+lz*sin, z=cz-lx*sin+lz*cos;
        m=Math.min(m, segDist(x,z,e) - e.width/2 - walkW);
      }
      if (m<best){best=m; worst=e.cls;}
    }
    return { gap:+best.toFixed(2), road:worst };
  };
  const overlaps = (A, ca, B, cb) => {                     // AABB on world extents
    const ea=halfExtent(A), eb=halfExtent(B);
    return Math.abs(ca[0]-cb[0]) < ea.x+eb.x && Math.abs(ca[1]-cb[1]) < ea.z+eb.z;
  };

  const proposals = [];
  const newPos = new Map(LANDMARK_LOTS.map(l => [l.id, [...l.pos]]));
  for (const lot of LANDMARK_LOTS) {
    const cur = minGapToAnyRoad(lot.pos[0], lot.pos[1], lot);
    // unit direction from plot centre toward its entrance (always axis-aligned here)
    let dx = lot.entrance[0]-lot.pos[0], dz = lot.entrance[1]-lot.pos[1];
    const len = Math.hypot(dx,dz)||1; dx/=len; dz/=len;
    // step toward the road until the min gap to ANY road hits the target
    let best = { move: 0, gap: cur.gap };
    for (let m = 0; m <= 14; m += 0.1) {
      const nx = lot.pos[0]+dx*m, nz = lot.pos[1]+dz*m;
      const g = minGapToAnyRoad(nx, nz, lot);
      if (g.gap < TARGET) break;
      best = { move:+m.toFixed(1), gap:g.gap };
    }
    // Relocate the entrance onto the adjacent road's sidewalk centreline so it
    // stays outside the advanced plot and still names the correct road edge.
    const nx = lot.pos[0]+dx*best.move, nz = lot.pos[1]+dz*best.move;
    let near=null, nearD=Infinity;
    for (const e of graph.edges) {
      const d0 = segDist(lot.entrance[0], lot.entrance[1], e);
      if (d0 < nearD) { nearD=d0; near=e; }
    }
    const walkW = SIDEWALK_BY_CLASS[near.cls] || 2.2;
    const sideSign = Math.sign((nx-near.a.pos.x)*near.right.x + (nz-near.a.pos.y)*near.right.y) || 1;
    const along = Math.max(0, Math.min(near.length,
      (nx-near.a.pos.x)*near.dir.x + (nz-near.a.pos.y)*near.dir.y));
    const lat = near.width/2 + walkW/2;
    const entX = near.a.pos.x + near.dir.x*along + near.right.x*sideSign*lat;
    const entZ = near.a.pos.y + near.dir.y*along + near.right.y*sideSign*lat;
    const he = halfExtent(lot);
    const outside = Math.abs(entX-nx) > he.x - 0.01 || Math.abs(entZ-nz) > he.z - 0.01;
    proposals.push({ id:lot.id, cls:lot.plotClass, from:[...lot.pos], move:best.move,
      dir:[+dx.toFixed(0),+dz.toFixed(0)], gapBefore:cur.gap, gapAfter:best.gap,
      to:[+(lot.pos[0]+dx*best.move).toFixed(1), +(lot.pos[1]+dz*best.move).toFixed(1)],
      entranceFrom:[...lot.entrance], entranceTo:[+entX.toFixed(1), +entZ.toFixed(1)],
      entranceOutsidePlot: outside, road: near.cls });
    newPos.set(lot.id, [lot.pos[0]+dx*best.move, lot.pos[1]+dz*best.move]);
  }
  // parcel-parcel check with all proposals applied
  const collisions = [];
  for (let i=0;i<LANDMARK_LOTS.length;i++) for (let j=i+1;j<LANDMARK_LOTS.length;j++) {
    const A=LANDMARK_LOTS[i], B=LANDMARK_LOTS[j];
    if (overlaps(A,newPos.get(A.id),B,newPos.get(B.id))) collisions.push([A.id,B.id]);
  }
  return { proposals, collisions };
}, TARGET_PLOT_GAP);

console.log(JSON.stringify(out, null, 2));
await browser.close();

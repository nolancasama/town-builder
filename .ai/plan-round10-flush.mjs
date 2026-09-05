import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4194;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const out = await page.evaluate(async () => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;

  const closestEdgeTo = (x, z) => {
    let best=null, bestD=Infinity;
    for (const e of graph.edges) {
      const ax=e.a.pos.x, az=e.a.pos.y;
      let t=(x-ax)*e.dir.x + (z-az)*e.dir.y;
      t=Math.max(0,Math.min(e.length,t));
      const px=ax+e.dir.x*t, pz=az+e.dir.y*t;
      const d=Math.hypot(x-px,z-pz);
      if(d<bestD){bestD=d; best={e,t,px,pz};}
    }
    return best;
  };
  const halfExtent = (w,d,a) => {
    const c=Math.abs(Math.cos(a)), s=Math.abs(Math.sin(a));
    return { x:(w*c+d*s)/2, z:(w*s+d*c)/2 };
  };

  const plan=[];
  for (const lot of LANDMARK_LOTS) {
    // the street this lot addresses = road nearest its authored entrance
    const hit = closestEdgeTo(lot.entrance[0], lot.entrance[1]);
    const e = hit.e;
    const walkW = SIDEWALK_BY_CLASS[e.cls] || 2.2;
    const outer = e.width/2 + walkW;

    // unit normal from the road centreline toward the lot
    const along = Math.max(0, Math.min(e.length,
      (lot.pos[0]-e.a.pos.x)*e.dir.x + (lot.pos[1]-e.a.pos.y)*e.dir.y));
    const projX = e.a.pos.x + e.dir.x*along, projZ = e.a.pos.y + e.dir.y*along;
    // Perpendicular to the street, pointing to the lot's side. Using the
    // centre-to-road vector instead would go wrong wherever the projection
    // clamps at a segment end, leaving the building a few degrees off.
    const side = Math.sign((lot.pos[0]-e.a.pos.x)*e.right.x + (lot.pos[1]-e.a.pos.y)*e.right.y) || 1;
    const nx = e.right.x*side, nz = e.right.y*side;

    // front faces the street => front vector is -normal; building sits parallel
    const rot = Math.atan2(-nx, -nz);
    const [ew, ed] = lot.buildSize;
    const centreDist = outer + ed/2;            // envelope front flush with pavement
    const cx = projX + nx*centreDist, cz = projZ + nz*centreDist;
    // entrance on the pavement centreline directly in front of the door
    const lat = e.width/2 + walkW/2;
    const entX = projX + nx*lat, entZ = projZ + nz*lat;

    plan.push({ id:lot.id, cls:lot.plotClass, road:e.cls,
      rotFrom:+(lot.rot||0).toFixed(4), rotTo:+rot.toFixed(4),
      rotDeltaDeg:+(((rot-(lot.rot||0))*180/Math.PI+540)%360-180).toFixed(1),
      posFrom:[...lot.pos], posTo:[+cx.toFixed(2),+cz.toFixed(2)],
      entTo:[+entX.toFixed(2),+entZ.toFixed(2)],
      plotHalf: halfExtent(lot.size[0], lot.size[1], rot),
      edgeDir: [e.dir.x, e.dir.y] });
  }

  const hits = () => {
    const c=[];
    for(let i=0;i<plan.length;i++) for(let j=i+1;j<plan.length;j++){
      const A=plan[i],B=plan[j];
      if(Math.abs(A.posTo[0]-B.posTo[0]) < A.plotHalf.x+B.plotHalf.x
      && Math.abs(A.posTo[1]-B.posTo[1]) < A.plotHalf.z+B.plotHalf.z) c.push([A.id,B.id]);
    }
    return c;
  };
  // Slide a colliding lot ALONG its own street: that keeps it both parallel and
  // flush, unlike pushing it back off the pavement.
  const slid=[];
  for (let pass=0; pass<40 && hits().length; pass++) {
    const [aId,bId] = hits()[0];
    const A=plan.find(x=>x.id===aId), B=plan.find(x=>x.id===bId);
    let moved=false;
    for (const L of [B,A]) {
      const e=L.edgeDir;
      for (const step of [1,-1]) {
        for (let m=0.5; m<=22; m+=0.5) {
          const nx=L.posTo[0]+e[0]*step*m, nz=L.posTo[1]+e[1]*step*m;
          const clash = plan.some(O => O!==L
            && Math.abs(nx-O.posTo[0]) < L.plotHalf.x+O.plotHalf.x
            && Math.abs(nz-O.posTo[1]) < L.plotHalf.z+O.plotHalf.z);
          if (!clash) {
            L.posTo=[+nx.toFixed(2),+nz.toFixed(2)];
            L.entTo=[+(L.entTo[0]+e[0]*step*m).toFixed(2), +(L.entTo[1]+e[1]*step*m).toFixed(2)];
            slid.push({ id:L.id, alongRoad:+(step*m).toFixed(1) });
            moved=true; break;
          }
        }
        if (moved) break;
      }
      if (moved) break;
    }
    if (!moved) break;
  }
  return { plan, collisions: hits(), slid };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

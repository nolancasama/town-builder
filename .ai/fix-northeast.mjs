import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4196;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const out = await page.evaluate(async () => {
  const { LANDMARK_LOTS, RAILWAY, railwayWorldX } = await import('/src/config/town.js');
  const graph = window.game.world.graph;
  const lot = LANDMARK_LOTS.find(l => l.id === 'medium-northeast');
  const station = LANDMARK_LOTS.find(l => l.id === 'large-station');
  const railX = railwayWorldX(station);
  const corridorMin = railX - RAILWAY.deckWidth/2, corridorMax = railX + RAILWAY.deckWidth/2;
  // its street
  let e=null,bd=Infinity;
  for(const g of graph.edges){const ax=g.a.pos.x,az=g.a.pos.y;
    let t=(lot.entrance[0]-ax)*g.dir.x+(lot.entrance[1]-az)*g.dir.y;t=Math.max(0,Math.min(g.length,t));
    const d=Math.hypot(lot.entrance[0]-(ax+g.dir.x*t), lot.entrance[1]-(az+g.dir.y*t)); if(d<bd){bd=d;e=g;}}
  const a=lot.rot||0, c=Math.abs(Math.cos(a)), s=Math.abs(Math.sin(a));
  const halfX=(lot.size[0]*c+lot.size[1]*s)/2, halfZ=(lot.size[0]*s+lot.size[1]*c)/2;
  const others = LANDMARK_LOTS.filter(l=>l.id!==lot.id).map(l=>{
    const b=l.rot||0, cc=Math.abs(Math.cos(b)), ss=Math.abs(Math.sin(b));
    return { id:l.id, x:l.pos[0], z:l.pos[1],
      hx:(l.size[0]*cc+l.size[1]*ss)/2, hz:(l.size[0]*ss+l.size[1]*cc)/2 };
  });
  for (let m=0.25; m<=30; m+=0.25) {
    for (const dir of [-1,1]) {
      const nx=lot.pos[0]+e.dir.x*dir*m, nz=lot.pos[1]+e.dir.y*dir*m;
      if (nx+halfX >= corridorMin - 0.5 && nx-halfX <= corridorMax + 0.5) continue;   // still over the line
      if (others.some(o => Math.abs(nx-o.x) < halfX+o.hx && Math.abs(nz-o.z) < halfZ+o.hz)) continue;
      return { railX, corridorMin, corridorMax, curMaxX:lot.pos[0]+halfX,
        slide:+(dir*m).toFixed(2), pos:[+nx.toFixed(2),+nz.toFixed(2)],
        ent:[+(lot.entrance[0]+e.dir.x*dir*m).toFixed(2), +(lot.entrance[1]+e.dir.y*dir*m).toFixed(2)] };
    }
  }
  return { error:'no clear slide found', railX, corridorMin, corridorMax };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4195;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
page.on('console',m=>{ if(m.type()==='error' && !m.text().includes('assets/buildings/')) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const out = await page.evaluate(async () => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;
  const closestEdgeTo=(x,z)=>{let b=null,bd=Infinity;for(const e of graph.edges){
    const ax=e.a.pos.x,az=e.a.pos.y;let t=(x-ax)*e.dir.x+(z-az)*e.dir.y;t=Math.max(0,Math.min(e.length,t));
    const px=ax+e.dir.x*t,pz=az+e.dir.y*t,d=Math.hypot(x-px,z-pz);if(d<bd){bd=d;b={e,px,pz};}}return b;};

  const rows = LANDMARK_LOTS.map(lot => {
    const hit = closestEdgeTo(lot.entrance[0], lot.entrance[1]);
    const e = hit.e, walkW = SIDEWALK_BY_CLASS[e.cls]||2.2, outer = e.width/2 + walkW;
    const a = lot.rot||0, fx=Math.sin(a), fz=Math.cos(a);
    const [, ed] = lot.buildSize;
    // envelope front-centre
    const fcx = lot.pos[0]+fx*ed/2, fcz = lot.pos[1]+fz*ed/2;
    // distance from road centreline to that front face
    const along = Math.max(0,Math.min(e.length,(fcx-e.a.pos.x)*e.dir.x+(fcz-e.a.pos.y)*e.dir.y));
    const px=e.a.pos.x+e.dir.x*along, pz=e.a.pos.y+e.dir.y*along;
    const distToCentre = Math.hypot(fcx-px, fcz-pz);
    // parallelism: angle between building face and road direction
    const faceX=Math.cos(a), faceZ=-Math.sin(a);
    const dot=Math.abs(faceX*e.dir.x + faceZ*e.dir.y);
    return { id:lot.id, road:e.cls,
      frontGapToPavement:+(distToCentre-outer).toFixed(2),
      parallelDeg:+(Math.acos(Math.min(1,dot))*180/Math.PI).toFixed(2) };
  });
  return { rows,
    houses: window.game.world.sceneryStats.placed,
    roads: graph.edges.length,
    paddies: window.game.scene.getObjectByName('paddies')?.children.length };
});
console.log(JSON.stringify({ ...out, errors: errs }, null, 2));
await browser.close();

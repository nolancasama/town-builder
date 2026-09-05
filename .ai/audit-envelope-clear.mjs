import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4197;
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
  const segDist=(px,pz,e)=>{const ax=e.a.pos.x,az=e.a.pos.y,dx=e.b.pos.x-ax,dz=e.b.pos.y-az,L2=dx*dx+dz*dz;
    let t=L2?((px-ax)*dx+(pz-az)*dz)/L2:0;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+dx*t),pz-(az+dz*t));};
  const scan=(w,d,cx,cz,a)=>{const cos=Math.cos(a),sin=Math.sin(a);
    let carriage=Infinity, surface=Infinity;
    for(const e of graph.edges){const walkW=SIDEWALK_BY_CLASS[e.cls]||2.2;
      for(let i=0;i<4;i++)for(let t=0;t<=1;t+=0.01){
        const c=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];const p0=c[i],p1=c[(i+1)%4];
        const lx=p0[0]+(p1[0]-p0[0])*t, lz=p0[1]+(p1[1]-p0[1])*t;
        const x=cx+lx*cos+lz*sin, z=cz-lx*sin+lz*cos;
        const dd=segDist(x,z,e);
        carriage=Math.min(carriage, dd-e.width/2);
        surface=Math.min(surface, dd-e.width/2-walkW);
      }}
    return { carriage:+carriage.toFixed(2), surface:+surface.toFixed(2) };};
  return LANDMARK_LOTS.map(l => ({ id:l.id,
    envelope: scan(l.buildSize[0], l.buildSize[1], l.pos[0], l.pos[1], l.rot||0),
    plot:     scan(l.size[0],      l.size[1],      l.pos[0], l.pos[1], l.rot||0) }));
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

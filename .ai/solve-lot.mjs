import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4197;
const targetId = process.argv[3] || 'medium-northeast';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const out = await page.evaluate(async (targetId) => {
  const { LANDMARK_LOTS, RAILWAY, railwayWorldX } = await import('/src/config/town.js');
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;
  const lot = LANDMARK_LOTS.find(l => l.id === targetId);
  const station = LANDMARK_LOTS.find(l => l.id === 'large-station');
  const railX = railwayWorldX(station);
  const corr = [railX - RAILWAY.deckWidth/2 - 1, railX + RAILWAY.deckWidth/2 + 1];

  const segDist=(px,pz,e)=>{const ax=e.a.pos.x,az=e.a.pos.y,dx=e.b.pos.x-ax,dz=e.b.pos.y-az,L2=dx*dx+dz*dz;
    let t=L2?((px-ax)*dx+(pz-az)*dz)/L2:0;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+dx*t),pz-(az+dz*t));};
  const scan=(w,d,cx,cz,a)=>{const cos=Math.cos(a),sin=Math.sin(a);let carr=Infinity,surf=Infinity;
    for(const e of graph.edges){const ww=SIDEWALK_BY_CLASS[e.cls]||2.2;
      for(let i=0;i<4;i++)for(let t=0;t<=1;t+=0.02){
        const c=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];const p0=c[i],p1=c[(i+1)%4];
        const lx=p0[0]+(p1[0]-p0[0])*t,lz=p0[1]+(p1[1]-p0[1])*t;
        const x=cx+lx*cos+lz*sin,z=cz-lx*sin+lz*cos;const dd=segDist(x,z,e);
        carr=Math.min(carr,dd-e.width/2); surf=Math.min(surf,dd-e.width/2-ww);
      }} return {carr,surf};};
  const he=(w,d,a)=>{const c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));
    return {x:(w*c+d*s)/2, z:(w*s+d*c)/2};};
  const others = LANDMARK_LOTS.filter(l=>l.id!==lot.id).map(l=>({hx:he(l.size[0],l.size[1],l.rot||0).x, hz:he(l.size[0],l.size[1],l.rot||0).z, x:l.pos[0], z:l.pos[1]}));

  // Stay on this lot's own street and keep it parallel; find the SMALLEST
  // setback off the pavement that clears every road, neighbour and the
  // viaduct. Flush is preferred, but not at the cost of relocating the lot.
  const ed=lot.buildSize[1];
  let own=null,bd=Infinity;
  for(const g of graph.edges){const ax=g.a.pos.x,az=g.a.pos.y;
    let t=(lot.entrance[0]-ax)*g.dir.x+(lot.entrance[1]-az)*g.dir.y;t=Math.max(0,Math.min(g.length,t));
    const d=Math.hypot(lot.entrance[0]-(ax+g.dir.x*t),lot.entrance[1]-(az+g.dir.y*t));if(d<bd){bd=d;own=g;}}
  const cands=[];
  for (const e of [own]) {
    const ww=SIDEWALK_BY_CLASS[e.cls]||2.2, outer=e.width/2+ww;
    for (const side of [Math.sign((lot.pos[0]-e.a.pos.x)*e.right.x+(lot.pos[1]-e.a.pos.y)*e.right.y)||1]) {
      const nx=e.right.x*side, nz=e.right.y*side;
      const rot=Math.atan2(-nx,-nz);
      const H=he(lot.size[0],lot.size[1],rot);
      for (let along=0; along<=e.length; along+=0.5)
      for (let back=0; back<=14; back+=0.25) {
        const px=e.a.pos.x+e.dir.x*along, pz=e.a.pos.y+e.dir.y*along;
        const cx=px+nx*(outer+ed/2+back), cz=pz+nz*(outer+ed/2+back);
        if(cx+H.x>corr[0] && cx-H.x<corr[1]) continue;
        if(others.some(o=>Math.abs(cx-o.x)<H.x+o.hx && Math.abs(cz-o.z)<H.z+o.hz)) continue;
        const env=scan(lot.buildSize[0],lot.buildSize[1],cx,cz,rot);
        if(env.carr<0.3||env.surf<-0.05) continue;
        const drift=Math.hypot(cx-lot.pos[0], cz-lot.pos[1]);
        cands.push({setback:+back.toFixed(2), drift:+drift.toFixed(2), road:e.cls,
          pos:[+cx.toFixed(2),+cz.toFixed(2)],
          ent:[+(px+nx*(e.width/2+ww/2)).toFixed(2),+(pz+nz*(e.width/2+ww/2)).toFixed(2)],
          rot:+rot.toFixed(4), envCarr:+env.carr.toFixed(2), envSurf:+env.surf.toFixed(2)});
      }
    }
  }
  cands.sort((a,b)=>(a.setback-b.setback) || (a.drift-b.drift));
  return { corridor:corr, best:cands.slice(0,3), total:cands.length };
}, targetId);
console.log(JSON.stringify(out, null, 2));
await browser.close();

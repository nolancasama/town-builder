import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4200;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const out = await page.evaluate(async () => {
  const { SIDEWALK_BY_CLASS } = await import('/src/world/roads.js');
  const graph = window.game.world.graph;
  const distToSeg = (px,pz,e)=>{const ax=e.a.pos.x,az=e.a.pos.y,dx=e.b.pos.x-ax,dz=e.b.pos.y-az,L2=dx*dx+dz*dz;
    let t=L2?((px-ax)*dx+(pz-az)*dz)/L2:0;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+dx*t),pz-(az+dz*t));};

  const bad = [];
  for (const e of graph.edges) {
    const cx=(e.a.pos.x+e.b.pos.x)/2, cz=(e.a.pos.y+e.b.pos.y)/2;
    const SW = SIDEWALK_BY_CLASS[e.cls] || 2.2;
    const endTrim = (node) => { let widest=0;
      for (const other of node.edges) if (other!==e) widest=Math.max(widest, other.width/2);
      return widest + SW/2 + 0.6; };
    const startAlong = endTrim(e.a), endAlong = e.length - endTrim(e.b);
    const walkLen = endAlong - startAlong;
    if (walkLen < 1.5) continue;                            // no walk drawn here
    const midAlong = (startAlong + endAlong)/2;
    const mx = e.a.pos.x + e.dir.x*midAlong, mz = e.a.pos.y + e.dir.y*midAlong;
    for (const side of [-1,1]) {
      const ox=e.right.x*side, oz=e.right.y*side;
      const off=e.width/2 + SW/2;
      const sx=mx+ox*off, sz=mz+oz*off;                     // strip centre
      // sample the strip rectangle (walkLen along the edge, SW across)
      let worst=null;
      for (let u=-0.5; u<=0.5; u+=0.02) for (let v=-0.5; v<=0.5; v+=0.25) {
        const px = sx + e.dir.x*walkLen*u + ox*SW*v;
        const pz = sz + e.dir.y*walkLen*u + oz*SW*v;
        for (const o of graph.edges) {
          if (o===e) continue;
          const d = distToSeg(px,pz,o) - o.width/2;
          if (d < 0 && (!worst || d < worst.depth)) {
            worst = { depth:+d.toFixed(2), into:o.cls,
              otherEdge:[[+o.a.pos.x.toFixed(1),+o.a.pos.y.toFixed(1)],[+o.b.pos.x.toFixed(1),+o.b.pos.y.toFixed(1)]] };
          }
        }
      }
      if (worst) bad.push({ edge:[[+e.a.pos.x.toFixed(1),+e.a.pos.y.toFixed(1)],[+e.b.pos.x.toFixed(1),+e.b.pos.y.toFixed(1)]],
        cls:e.cls, len:+e.length.toFixed(1), walkLen:+walkLen.toFixed(1), side, ...worst });
    }
  }
  return { totalEdges: graph.edges.length, crossings: bad };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

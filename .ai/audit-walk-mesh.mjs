import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4202;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
// Read the ACTUAL merged sidewalk mesh, not a reimplementation of the maths.
const out = await page.evaluate(() => {
  const graph = window.game.world.graph;
  const walk = window.game.scene.getObjectByName('sidewalks');
  if (!walk) return { error: 'no sidewalks mesh' };
  const pos = walk.geometry.attributes.position;
  const distToSeg=(px,pz,e)=>{const ax=e.a.pos.x,az=e.a.pos.y,dx=e.b.pos.x-ax,dz=e.b.pos.y-az,L2=dx*dx+dz*dz;
    let t=L2?((px-ax)*dx+(pz-az)*dz)/L2:0;t=Math.max(0,Math.min(1,t));
    return Math.hypot(px-(ax+dx*t),pz-(az+dz*t));};
  let worst = 0, offenders = 0, checked = 0;
  const seen = new Set();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < 0.01) continue;                       // top face vertices only
    const key = `${x.toFixed(1)},${z.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key); checked++;
    for (const e of graph.edges) {
      const d = distToSeg(x, z, e) - e.width / 2;
      if (d < -0.05) { offenders++; worst = Math.min(worst, d); break; }
    }
  }
  return { verticesChecked: checked, sidewalkCornersInsideACarriageway: offenders,
           worstDepth: +worst.toFixed(2) };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

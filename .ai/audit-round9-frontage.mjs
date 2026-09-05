import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4192;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=6`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:90000});
for (let i=0;i<6;i++){ await waitPhase('choosing'); await page.keyboard.press('b');
  await waitPhase('ready'); await page.keyboard.press('b'); await page.waitForTimeout(400); }
await page.waitForTimeout(3000);

const out = await page.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js?v=1').catch(()=>null);
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const g = window.game;
  const res = [];
  let ringLike = 0;
  g.scene.traverse(o => {
    if (!o.name || !o.name.startsWith('lot-frontage:')) return;
    const id = o.name.split(':')[1];
    const lot = LANDMARK_LOTS.find(l => l.id === id);
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const w = +(bb.max.x - bb.min.x).toFixed(2);
    const d = +(bb.max.z - bb.min.z).toFixed(2);
    const area = +(w * d).toFixed(1);
    const plotArea = lot ? lot.size[0]*lot.size[1] : null;
    res.push({ id, cls: lot?.plotClass, bboxW: w, bboxD: d, bboxArea: area,
               plot: lot?.size, plotArea, ratio: plotArea ? +(area/plotArea).toFixed(2) : null,
               tris: o.geometry.index ? o.geometry.index.count/3 : o.geometry.attributes.position.count/3 });
  });
  // any leftover full-ring sidewalks?
  g.scene.traverse(o => { if (o.name && o.name.startsWith('lot-sidewalk:')) ringLike++; });
  return { frontages: res, legacyRingMeshes: ringLike };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();

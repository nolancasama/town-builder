import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });
await page.goto('http://127.0.0.1:4177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const at = await page.evaluate(async () => {
  const g = window.game;
  await g.buildLandmark('school');
  await g.buildLandmark('bakery');
  for (const c of document.body.children) if (c.id !== 'scene') c.style.visibility = 'hidden';
  const f = g.scene.children.find((o) => o.name && o.name.startsWith('lot-frontage:'));
  f.geometry.computeBoundingBox();
  const b = f.geometry.boundingBox;
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  g.rig.beginCinematic();
  // very shallow angle: worst case for coplanar flicker
  g.camera.position.set(cx + 16, 1.6, cz + 16);
  g.rig.lookAtVector.set(cx, 0.3, cz);
  return [f.name, cx, cz];
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-evidence/frontage-graze.png' });
console.log(JSON.stringify(at));
await browser.close();

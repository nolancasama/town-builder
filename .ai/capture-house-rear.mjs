import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('http://127.0.0.1:5177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
// Put a known house in front of the camera: render makeHouse directly.
const info = await page.evaluate(async () => {
  const props = await import('/src/world/props.js');
  const { makeRng } = await import('/src/core/rng.js');
  const g = window.game;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const h = props.makeHouse(makeRng(101 + i * 7));
    h.position.set(i * 14 - 14, 0, 0);
    h.rotation.y = Math.PI; // face rear elevation toward -Z camera
    g.scene.add(h);
    out.push(h.position.toArray());
  }
  for (const c of document.body.children) if (c.id !== 'scene') c.style.visibility = 'hidden';
  g.rig.beginCinematic();
  g.camera.position.set(0, 6.5, -30);
  g.rig.lookAtVector.set(0, 2.0, 0);
  return out;
});
await page.waitForTimeout(800);
await page.screenshot({ path: 'qa-evidence/house-rear-check.png' });
console.log('placed', JSON.stringify(info));
await browser.close();

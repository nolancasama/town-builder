import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://127.0.0.1:4177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
await page.evaluate(() => {
  for (const c of document.body.children) if (c.id !== 'scene') c.style.visibility = 'hidden';
  const g = window.game;
  g.rig.beginCinematic();
  g.camera.position.set(0, 95, 0.1);
  g.rig.lookAtVector.set(0, 0, 0);
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'qa-evidence/corner-check-topdown.png' });
await page.evaluate(() => {
  const g = window.game;
  g.camera.position.set(-18, 14, 18);
  g.rig.lookAtVector.set(-2, 0, 2);
});
await page.waitForTimeout(700);
await page.screenshot({ path: 'qa-evidence/corner-check-oblique.png' });
console.log('console errors:', errors.length ? errors : 'none');
await browser.close();

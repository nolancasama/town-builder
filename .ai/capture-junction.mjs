import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1200, height: 1200 } });
await page.goto('http://127.0.0.1:4177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
await page.evaluate(() => {
  for (const c of document.body.children) if (c.id !== 'scene') c.style.visibility = 'hidden';
  window.game.rig.beginCinematic();
});
const shots = [['node1', -54, 0], ['mid', 7, 0]];
for (const [name, x, z] of shots) {
  await page.evaluate(([x, z]) => {
    const g = window.game;
    g.camera.position.set(x, 34, z + 0.1);
    g.rig.lookAtVector.set(x, 0, z);
  }, [x, z]);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `qa-evidence/junction-${name}.png` });
}
await browser.close();
console.log('ok');

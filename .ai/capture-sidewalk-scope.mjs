import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:4177/?dev=1&target=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
await page.evaluate(() => {
  for (const child of document.body.children) {
    if (child.id !== 'scene') child.style.visibility = 'hidden';
  }
  const game = window.game;
  game.rig.beginCinematic();
  game.camera.position.set(-82, 24, 38);
  game.rig.lookAtVector.set(-48, 2, 14);
});
await page.waitForTimeout(500);
const emptyCount = await page.evaluate(() => window.game.scene.children.filter((o) => o.name.startsWith('lot-sidewalk:')).length);
await page.screenshot({ path: 'qa-evidence/undeveloped-lot-no-sidewalk.png' });

await page.evaluate(async () => {
  await window.game.buildLandmark('school');
  window.game.rig.beginCinematic();
  window.game.camera.position.set(-82, 24, 38);
  window.game.rig.lookAtVector.set(-48, 2, 14);
});
await page.waitForTimeout(500);
const built = await page.evaluate(() => ({
  count: window.game.scene.children.filter((o) => o.name.startsWith('lot-sidewalk:')).length,
  names: window.game.scene.children.filter((o) => o.name.startsWith('lot-sidewalk:')).map((o) => o.name),
  schoolVisible: window.game.landmarks.get('school')?.visible,
}));
await page.screenshot({ path: 'qa-evidence/developed-lot-sidewalk.png' });
console.log(JSON.stringify({ emptyCount, built, errors }, null, 2));
await browser.close();

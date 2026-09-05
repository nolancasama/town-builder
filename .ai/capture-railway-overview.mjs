import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4184';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('assets/buildings/')) errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));
await page.goto(`${base}/?dev=1&target=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.game));
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
await page.evaluate(async () => {
  await window.game.buildLandmark('station');
  window.game.rig.beginCinematic();
  window.game.camera.position.set(108, 184, 118);
  window.game.rig.lookAtVector.set(5, 0, 0);
  for (const child of document.body.children) {
    if (child.id !== 'scene') child.style.visibility = 'hidden';
  }
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'qa-evidence/railway-straight-overview.png' });
const result = await page.evaluate(() => {
  const station = window.game.landmarks.get('station');
  const model = station.userData.model;
  const deck = station.getObjectByName('station-track-deck');
  deck.geometry.computeBoundingBox();
  return {
    deckY: model.userData.deckY,
    localDeckBounds: {
      min: deck.geometry.boundingBox.min.toArray(),
      max: deck.geometry.boundingBox.max.toArray(),
    },
    trainRoll: model.userData.train.rotation.z,
  };
});
console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;

import { chromium } from 'playwright';

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
await page.goto('http://127.0.0.1:4184/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
const result = await page.evaluate(() => {
  const paddies = window.game.scene.getObjectByName('paddies');
  return {
    paddyPlots: paddies?.userData.plotRects || [],
    paddyChildren: paddies?.children.length || 0,
    sceneryStats: window.game.world.scenery?.userData.stats || null,
  };
});
console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();

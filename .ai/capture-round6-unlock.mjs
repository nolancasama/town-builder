import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  const value = message.text();
  if (message.type() === 'error' && !value.includes('assets/buildings/')) errors.push(value);
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:4184/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.waitForFunction(() => window.game.phase === 'choosing', null, { timeout: 20000 });
await page.evaluate(() => {
  document.querySelector('#choice-panel')?.classList.add('hidden');
  document.querySelector('#progress-panel')?.classList.add('hidden');
  void window.game.unlockReveal.show('stadium');
});
await page.waitForTimeout(2100);
await page.screenshot({ path: 'qa-evidence/round6/unlock-stadium.png' });
console.log(JSON.stringify({ errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;

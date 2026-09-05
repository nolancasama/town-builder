import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:4177/?dev=1&target=1', { waitUntil: 'domcontentloaded' });
await page.locator('#player-name').fill('Yuki');
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

await page.locator('#choice-cards .choice-card:not(.locked)').first().click();
await page.waitForFunction(() => window.game?.phase === 'ready', null, { timeout: 10000 });
await page.keyboard.press('b');
await page.waitForFunction(() => window.game?.built.length === 1, null, { timeout: 30000 });

const result = await page.evaluate(() => ({
  phase: window.game.phase,
  built: [...window.game.built],
  sidewalkNames: window.game.scene.children
    .filter((object) => object.name.startsWith('lot-sidewalk:'))
    .map((object) => object.name),
  openingNpcPresent: Boolean(window.game.scene.getObjectByName('opening-town-local')),
}));
const report = { ...result, errors };
await writeFile('qa-evidence/round3-playthrough.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (errors.length || result.built.length !== 1 || result.sidewalkNames.length !== 1 || result.openingNpcPresent) {
  process.exitCode = 1;
}

import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4184';
const lines = [
  '「おーい！Yuki！」',
  '「見てみぃ！なんやこの町！」',
  '「建物、ぜんぜん足らへんやん！」',
  '「Yuki、英語使えるんやろ？」',
  '「ほな、英語で建物つくってみぃ！」',
  '「たとえばな…… "We have a stadium in Matsubara." や！」',
  '「ほな、頼んだで！」',
];
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.addInitScript(() => localStorage.clear());
const errors = [];
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && !(text.includes('assets/buildings/') && text.includes('404'))) errors.push(text);
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`${base}/?dev=1&target=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.game));
await page.locator('#player-name').fill('Yuki');
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
for (const line of lines) {
  await page.locator('#subtitle-text').getByText(line, { exact: true }).waitFor({ timeout: 15000 });
  await page.keyboard.press('Space');
}
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 10000 });
await page.locator('#choice-cards .choice-card:not(.locked)').first().click();
await page.waitForFunction(() => window.game.phase === 'ready', null, { timeout: 10000 });
await page.keyboard.press('b');

await page.locator('#finale.show').waitFor({ timeout: 90000 });
await page.locator('#btn-tour').click();
await page.locator('#tour-panel:not(.hidden)').waitFor({ timeout: 20000 });
await page.locator('#tour-skip').click();
await page.locator('#tour-summary.show').waitFor({ timeout: 15000 });
await page.locator('#btn-finish').click();

const deadline = Date.now() + 90000;
while (Date.now() < deadline) {
  const phase = await page.evaluate(() => window.game.phase);
  if (phase === 'guided-end') break;
  if (await page.locator('#unlock-reveal:not(.hidden)').isVisible().catch(() => false)) {
    await page.locator('#unlock-reveal').click({ position: { x: 20, y: 20 } });
  }
  await page.waitForTimeout(400);
}

const result = await page.evaluate(() => ({
  phase: window.game.phase,
  built: [...window.game.built],
  sidewalkCount: window.game.scene.children.filter((object) => object.name.startsWith('lot-sidewalk:')).length,
  openingNpcPresent: Boolean(window.game.scene.getObjectByName('opening-town-local')),
}));
const report = { ...result, errors };
await writeFile('qa-evidence/round4-playthrough.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (result.phase !== 'guided-end' || result.built.length !== 1 || result.sidewalkCount !== 1 || errors.length) {
  process.exitCode = 1;
}

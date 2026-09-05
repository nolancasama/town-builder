import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:4177/?dev=1&target=1', { waitUntil: 'domcontentloaded' });
await page.locator('#player-name').fill('Yuki');
await page.locator('#name-form button').click();

const subtitle = page.locator('#subtitle-text');
await subtitle.getByText('「おーい！Yuki！」', { exact: true }).waitFor({ timeout: 25000 });
await page.screenshot({ path: 'qa-evidence/opening-wide-establishing.png' });

await subtitle.getByText('「建物、ぜんぜん足らへんやん！」', { exact: true }).waitFor({ timeout: 15000 });
await page.screenshot({ path: 'qa-evidence/opening-medium-dialogue.png' });

await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 25000 });
const result = await page.evaluate(() => ({
  phase: window.game.phase,
  built: [...window.game.built],
  cards: document.querySelectorAll('#choice-cards .choice-card').length,
  npcPresent: Boolean(window.game.scene.getObjectByName('opening-town-local')),
  stadiumPresent: window.game.landmarks.has('stadium'),
  ownerHouse: window.game.offered.includes('house')
    ? document.querySelector('.choice-name')?.textContent
    : null,
}));
const report = { ...result, errors };
await writeFile('qa-evidence/opening-verification.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length || result.phase !== 'choosing' || result.built.length || result.cards !== 3 || result.npcPresent || result.stadiumPresent) {
  process.exitCode = 1;
}

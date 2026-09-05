import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4184';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];

page.on('console', (message) => {
  const value = message.text();
  const expectedProbe = value.includes('assets/buildings/') && value.includes('404');
  if (message.type() === 'error' && !expectedProbe) errors.push(`console: ${value}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
page.on('requestfailed', (request) => {
  const url = request.url();
  if (!/\/assets\/buildings\/[^/]+\.glb(?:\?|$)/.test(url)) {
    errors.push(`requestfailed: ${url} (${request.failure()?.errorText || 'unknown'})`);
  }
});

await page.addInitScript(() => localStorage.clear());
await page.goto(`${base}/?dev=1&target=10&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.game));
await page.locator('#player-name').fill('Round Six');
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
await page.waitForFunction(() => window.game.phase === 'choosing', null, { timeout: 20000 });

// Keep every authored transition, but advance its game-clock at the existing
// 20 fps safety cap so this full three-phase QA run finishes promptly.
await page.evaluate(() => {
  window.game.clock.getDelta = () => 0.05;
});

for (let index = 0; index < 10; index += 1) {
  await page.waitForFunction(
    (count) => window.game.built.length === count && window.game.phase === 'choosing',
    index,
    { timeout: 30000 }
  );
  await page.keyboard.press('b');
  await page.waitForFunction(() => window.game.phase === 'ready', null, { timeout: 5000 });
  await page.keyboard.press('b');
  await page.waitForFunction((count) => window.game.built.length === count, index + 1, { timeout: 30000 });
  console.log(`built ${index + 1}/10`);
}

await page.locator('#finale.show').waitFor({ timeout: 45000 });
console.log('phase 1 complete');
await page.locator('#btn-tour').click();

let skipped = 0;
while (skipped < 10) {
  const summaryVisible = await page.locator('#tour-summary.show').isVisible().catch(() => false);
  if (summaryVisible) break;
  await page.locator('#tour-panel:not(.hidden)').waitFor({ timeout: 20000 });
  await page.locator('#tour-skip').click();
  skipped += 1;
  console.log(`tour stop ${skipped}/10`);
  await page.waitForTimeout(80);
}
await page.locator('#tour-summary.show').waitFor({ timeout: 20000 });
console.log('phase 2 complete');
await page.locator('#btn-finish').click();

const guidedDeadline = Date.now() + 180000;
while (Date.now() < guidedDeadline) {
  const phase = await page.evaluate(() => window.game.phase);
  if (phase === 'guided-end') break;
  if (await page.locator('#unlock-reveal:not(.hidden)').isVisible().catch(() => false)) {
    await page.locator('#unlock-reveal').click({ position: { x: 20, y: 20 } });
  }
  await page.waitForTimeout(250);
}

const result = await page.evaluate(() => ({
  phase: window.game.phase,
  built: [...window.game.built],
  takenLots: [...window.game.takenLots],
  sidewalks: window.game.scene.children
    .filter((object) => object.name.startsWith('lot-sidewalk:')).length,
}));
const report = { ...result, skippedTourStops: skipped, errors };
await mkdir('qa-evidence/round6', { recursive: true });
await writeFile('qa-evidence/round6/full-playthrough.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();

if (
  result.phase !== 'guided-end'
  || result.built.length !== 10
  || result.takenLots.length !== 10
  || result.sidewalks !== 10
  || skipped !== 10
  || errors.length
) {
  process.exitCode = 1;
}

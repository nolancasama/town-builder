/**
 * Checks a player can rename a place, that the name persists, that the English
 * word and the lesson sentence are unaffected, and that clearing restores it.
 *
 * Usage: node .ai/verify-rename.mjs [port]
 */
import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 5220;
const browser = await chromium.launch({ headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
const errs = []; page.on('pageerror', (e) => errs.push(e.message));
let ok = true;
const rec = (n, got, want) => { const p = got === want; ok = ok && p;
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}  (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`); };

const boot = async () => {
  await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-form').evaluate((f) => f.requestSubmit());
  await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });
};
await boot();
await page.evaluate(() => window.game.buildingNames.clearAll());

await page.evaluate(() => window.game.hud.showLandmarkCard('school'));
rec('card shows the default name', (await page.locator('#landmark-name').textContent()).trim(), 'SCHOOL');
rec('real-word line hidden when not renamed',
  await page.locator('#landmark-realname').evaluate((e) => e.classList.contains('hidden')), true);
const sentenceBefore = (await page.locator('#landmark-sentence').textContent()).trim();

await page.locator('#landmark-rename').click();
rec('rename form opens',
  await page.locator('#landmark-name-form').evaluate((e) => e.classList.contains('hidden')), false);
await page.locator('#landmark-name-input').fill("Ken's School");
await page.locator('#landmark-name-form').evaluate((f) => f.requestSubmit());

rec('card shows the new name', (await page.locator('#landmark-name').textContent()).trim(), "Ken's School");
rec('English word still shown underneath', (await page.locator('#landmark-realname').textContent()).trim(), 'SCHOOL');
rec('real-word line now visible',
  await page.locator('#landmark-realname').evaluate((e) => e.classList.contains('hidden')), false);
rec('lesson sentence unchanged', (await page.locator('#landmark-sentence').textContent()).trim(), sentenceBefore);

// persistence
await boot();
await page.evaluate(() => window.game.hud.showLandmarkCard('school'));
rec('name persists across reload', (await page.locator('#landmark-name').textContent()).trim(), "Ken's School");

// other buildings untouched
await page.evaluate(() => window.game.hud.showLandmarkCard('library'));
rec('other places keep their default', (await page.locator('#landmark-name').textContent()).trim(), 'LIBRARY');

// clearing restores the default
await page.evaluate(() => window.game.buildingNames.set('school', '   '));
await page.evaluate(() => window.game.hud.showLandmarkCard('school'));
rec('empty name restores the default', (await page.locator('#landmark-name').textContent()).trim(), 'SCHOOL');

// length cap
await page.evaluate(() => window.game.buildingNames.set('school', 'x'.repeat(80)));
rec('name is capped', await page.evaluate(() => window.game.buildingNames.get('school').length), 24);
await page.evaluate(() => window.game.buildingNames.clearAll());

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(ok && !errs.length ? 0 : 1);

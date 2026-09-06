/**
 * Checks that "type it instead" is gone from the speaking panel and now lives in
 * teacher settings: off by default, revealing the type form when switched on,
 * persisting across a reload, and still actually building a place when used.
 *
 * Usage: node .ai/verify-typing-setting.mjs [port]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5212;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

const check = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
  return ok;
};
let allOk = true;
const rec = (...a) => { allOk = allOk && check(...a); };

const start = async () => {
  await page.goto(`${base}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-form button').click();
  await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });
};
await start();

rec('old "Type it instead" button is gone', await page.locator('#type-toggle').count(), 0);
rec('typing toggle exists in settings', await page.locator('#btn-toggle-typing').count(), 1);
rec('defaults to オフ', (await page.locator('#typing-state').textContent()).trim(), 'オフ');

// Ask a prompt that would previously have offered typing.
await page.evaluate(() => window.game.hud.offerTyping(true));
rec('type form stays hidden while setting is オフ',
  await page.locator('#type-form').evaluate((f) => f.classList.contains('hidden')), true);

// Turn it on from settings.
await page.locator('#settings-btn').click();
await page.locator('#btn-toggle-typing').click();
rec('label switches to オン', (await page.locator('#typing-state').textContent()).trim(), 'オン');
rec('type form appears once permitted',
  await page.locator('#type-form').evaluate((f) => f.classList.contains('hidden')), false);

// Persistence across reload.
await start();
rec('setting persists across reload', (await page.locator('#typing-state').textContent()).trim(), 'オン');

// Typing still builds a place. Pick a building first - the target sentence only
// exists once something has been chosen and the game is in the 'ready' phase.
const before = await page.evaluate(() => window.game.landmarks.size);
await page.evaluate(() => {
  const g = window.game;
  const type = g.currentChoices?.[0]?.type || g.currentChoices?.[0];
  g.chooseType(typeof type === 'string' ? type : 'school');
});
await page.waitForFunction(() => window.game?.phase === 'ready', null, { timeout: 30000 });
await page.evaluate(() => window.game.hud.offerTyping(true));
const target = await page.locator('#target-sentence').textContent();
console.log('       target sentence:', JSON.stringify(target));
await page.locator('#type-input').fill(target);
// submit programmatically: the 3D canvas sits over the panel and eats the click
await page.locator('#type-form').evaluate((f) => f.requestSubmit());
await page.waitForTimeout(2500);
const after = await page.evaluate(() => window.game.landmarks.size);
rec('typing the sentence still builds', after > before, true);

// Turning it back off hides the form again.
await page.locator('#settings-btn').click();
await page.locator('#btn-toggle-typing').click();
rec('switches back to オフ', (await page.locator('#typing-state').textContent()).trim(), 'オフ');
rec('type form hidden again',
  await page.locator('#type-form').evaluate((f) => f.classList.contains('hidden')), true);

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(allOk && !errs.length ? 0 : 1);

/**
 * Checks that finishing stage one (build) and stage two (speak) each award an
 * unlock, that a stage pays out only once per run, and that startRun resets it.
 *
 * Usage: node .ai/verify-stage-unlocks.mjs [port]
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
  console.log(`${p ? 'PASS' : 'FAIL'}  ${n}  (got ${got}, want ${want})`); };

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

// start from a profile with plenty still locked
await page.evaluate(() => { window.game.progression.resetAll(); window.game.progression.startRun(10); });

const locked = () => page.evaluate(() => window.game.progression.lockedTypes().length);
const before = await locked();
rec('there are locked places to award', before > 2, true);

const a = await page.evaluate(() => window.game.progression.completeStage('build'));
rec('stage one awards a place', typeof a === 'string', true);
rec('locked count drops by one', await locked(), before - 1);

const again = await page.evaluate(() => window.game.progression.completeStage('build'));
rec('stage one cannot be farmed twice', again, null);

const b = await page.evaluate(() => window.game.progression.completeStage('speak'));
rec('stage two awards a separate place', typeof b === 'string', true);
rec('locked count drops again', await locked(), before - 2);
rec('the two stages award different places', a !== b, true);

await page.evaluate(() => window.game.progression.startRun(10));
const c = await page.evaluate(() => window.game.progression.completeStage('build'));
rec('a new run can award stage one again', typeof c === 'string', true);

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(ok && !errs.length ? 0 : 1);

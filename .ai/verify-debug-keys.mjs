import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4203;
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=6`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const phase = () => page.evaluate(() => window.game.phase);
const unlocked = () => page.evaluate(() => window.game.progression.unlockedSet().size);

const r = { start: { phase: await phase(), unlocked: await unlocked() } };

// shift+U
await page.keyboard.press('Shift+U'); await page.waitForTimeout(500);
r.afterShiftU = { unlocked: await unlocked() };
// shift+R
await page.keyboard.press('Shift+R'); await page.waitForTimeout(500);
r.afterShiftR = { unlocked: await unlocked() };

// shift+B from 'choosing' should start a build
await page.keyboard.press('Shift+B'); await page.waitForTimeout(700);
r.afterShiftB_fromChoosing = { phase: await phase() };
// then shift+B again to accept without speaking
await page.waitForFunction(()=>['ready','listening'].includes(window.game.phase), null, {timeout:20000}).catch(()=>{});
await page.keyboard.press('Shift+B'); await page.waitForTimeout(1500);
r.afterShiftB_accept = { phase: await phase(), built: await page.evaluate(()=>window.game.built) };

// plain b must now do nothing
await page.waitForFunction(()=>window.game.phase==='choosing', null, {timeout:40000}).catch(()=>{});
const beforePlain = await page.evaluate(()=>window.game.built.length);
await page.keyboard.press('b'); await page.waitForTimeout(800);
r.plainB = { builtBefore: beforePlain, builtAfter: await page.evaluate(()=>window.game.built.length) };

console.log(JSON.stringify({ ...r, errors: errs }, null, 2));
await browser.close();

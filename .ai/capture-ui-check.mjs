/**
 * Screenshots the speaking panel, progress panel and tour banner so the UI
 * changes can be judged.
 *
 * Usage: node .ai/capture-ui-check.mjs [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const port = Number(process.argv[2]) || 5220;
const out = process.argv[3] || 'qa-evidence/ui-check';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

await page.locator('#choice-panel').screenshot({ path: `${out}/choice-title.png` });

// Fill the progress row so the 5-over-5 shape is visible.
await page.evaluate(() => {
  const g = window.game;
  const icons = document.getElementById('progress-icons');
  [...icons.children].slice(0, 7).forEach((p) => { p.classList.add('done'); p.textContent = '🏫'; });
  document.getElementById('progress-count').textContent = '7';
});
await page.locator('#progress-panel').screenshot({ path: `${out}/progress.png` });

// Speaking panel: pick a building so the target sentence is real.
await page.evaluate(() => {
  const g = window.game;
  const c = g.currentChoices?.[0];
  g.chooseType(typeof c === 'string' ? c : (c?.type || 'school'));
});
await page.waitForFunction(() => window.game?.phase === 'ready', null, { timeout: 30000 });
await page.waitForTimeout(400);
await page.locator('#speech-panel').screenshot({ path: `${out}/speech-panel.png` });

// Tour banner.
await page.evaluate(() => window.game.hud.enterTourMode(true));
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/tour-banner.png`, clip: { x: 333, y: 0, width: 700, height: 120 } });

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();

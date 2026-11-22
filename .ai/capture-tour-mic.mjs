/**
 * Compares the first-phase speech panel against the Town Speaking Tour panel
 * at a normal Chromebook viewport and a short one, to verify the mic no
 * longer overlaps the sentence card and stays centered.
 *
 * Usage: node .ai/capture-tour-mic.mjs [port] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const port = Number(process.argv[2]) || 5220;
const out = process.argv[3] || 'qa-evidence/tour-mic-fix';
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});

async function capture(viewport, tag) {
  const page = await browser.newPage({ viewport });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-form button').click();
  await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

  // First speaking phase.
  await page.evaluate(() => {
    const g = window.game;
    const c = g.currentChoices?.[0];
    g.chooseType(typeof c === 'string' ? c : (c?.type || 'school'));
  });
  await page.waitForFunction(() => window.game?.phase === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.locator('#speech-panel').screenshot({ path: `${out}/${tag}-01-speech-panel.png` });

  // Town Speaking Tour.
  await page.evaluate(() => {
    window.game.hud.enterTourMode(true);
    window.game.hud.showTourPrompt('school', { index: 1, total: 5 });
  });
  await page.waitForTimeout(300);
  await page.locator('#tour-panel').screenshot({ path: `${out}/${tag}-02-tour-panel.png` });

  console.log(tag, 'page errors:', errs.length, errs.slice(0, 3));
  await page.close();
}

await capture({ width: 1366, height: 768 }, 'chromebook');
await capture({ width: 1024, height: 600 }, 'short');

await browser.close();

/**
 * Checks the music engine, the dialogue sound effects, the removed portrait
 * mouth and the guided-tour exit button.
 *
 * Audio cannot be "heard" headlessly, so the music check asserts the sequencer
 * is actually scheduling: it counts oscillators created on the AudioContext
 * over a window, which is what a running sequencer produces and a stopped one
 * does not.
 *
 * Usage: node .ai/verify-audio-and-tour.mjs [port]
 */
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5220;
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

let ok = true;
const rec = (name, got, want) => {
  const pass = got === want;
  ok = ok && pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
};

// Count oscillator creations before any app code runs.
await page.addInitScript(() => {
  window.__oscCount = 0;
  const AC = window.AudioContext || window.webkitAudioContext;
  const orig = AC.prototype.createOscillator;
  AC.prototype.createOscillator = function patched(...a) {
    window.__oscCount++;
    return orig.apply(this, a);
  };
});

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form').evaluate((f) => f.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });

// --- music ---
rec('music not running before audio.start()', await page.evaluate(() => window.__oscCount) === 0, true);
await page.evaluate(() => window.game.audio.start());
await page.waitForTimeout(1500);
const afterStart = await page.evaluate(() => window.__oscCount);
rec('sequencer schedules notes after start', afterStart > 0, true);
await page.waitForTimeout(1500);
const later = await page.evaluate(() => window.__oscCount);
rec('music keeps playing (more notes scheduled)', later > afterStart, true);

await page.evaluate(() => window.game.audio.stopMusic());
const atStop = await page.evaluate(() => window.__oscCount);
await page.waitForTimeout(1200);
const afterStop = await page.evaluate(() => window.__oscCount);
rec('stopMusic halts the sequencer', afterStop === atStop, true);

// --- dialogue sfx exist and are callable ---
rec('speechAdvance exists', await page.evaluate(() => typeof window.game.audio.speechAdvance), 'function');
rec('speechBlip exists', await page.evaluate(() => typeof window.game.audio.speechBlip), 'function');
await page.evaluate(() => { window.game.audio.speechAdvance(); window.game.audio.speechBlip(); });

// --- portrait mouth removed ---
const mouths = await page.evaluate(() => {
  let n = 0;
  window.game.scene.traverse((o) => { if (o.name === 'portrait-mouth') n++; });
  return n;
});
rec('no portrait mouth in the scene', mouths, 0);

// --- guided tour exit ---
rec('tour exit hidden outside the tour',
  await page.locator('#tour-exit').evaluate((b) => b.classList.contains('hidden')), true);
await page.evaluate(() => window.game.hud.enterGuidedMode(true));
rec('tour exit visible during the guided tour',
  await page.locator('#tour-exit').evaluate((b) => b.classList.contains('hidden')), false);
rec('tour banner visible during the guided tour',
  await page.locator('#tour-title').evaluate((b) => b.classList.contains('hidden')), false);

// clicking it leaves the tour
await page.evaluate(() => { window.game.phase = 'guided'; });
await page.locator('#tour-exit').click();
await page.waitForTimeout(400);
rec('exit leaves the guided tour', await page.evaluate(() => window.game.phase), 'explore');
rec('tour exit hidden again',
  await page.locator('#tour-exit').evaluate((b) => b.classList.contains('hidden')), true);

console.log('page errors:', errs.length, errs.slice(0, 3));
await browser.close();
process.exit(ok && !errs.length ? 0 : 1);

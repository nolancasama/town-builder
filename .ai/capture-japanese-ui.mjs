/**
 * Captures the translated UI states and checks their text containers at the
 * target classroom viewport and the small-screen breakpoint.
 *
 * Usage: node .ai/capture-japanese-ui.mjs [port]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 5199;
const base = `http://127.0.0.1:${port}`;
const outputDir = path.join(os.tmpdir(), 'town-builder-japanese-ui');
fs.mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

const reports = [];

async function boot(width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${base}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
  await page.locator('#name-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 90000 });
  await page.waitForTimeout(500);
}

async function inspectState(name, selectors, collisionPairs = []) {
  const report = await page.evaluate(({ selectors, collisionPairs }) => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) > 0
        && rect.width > 0
        && rect.height > 0;
    };
    const box = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left * 10) / 10,
        top: Math.round(rect.top * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        bottom: Math.round(rect.bottom * 10) / 10,
      };
    };
    const intersects = (a, b) => (
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );

    const elements = selectors.flatMap((selector) => (
      [...document.querySelectorAll(selector)].map((element) => ({ selector, element }))
    )).filter(({ element }) => visible(element));

    const failures = [];
    const measurements = elements.map(({ selector, element }) => {
      const rect = box(element);
      const outsideViewport = rect.left < -1
        || rect.top < -1
        || rect.right > innerWidth + 1
        || rect.bottom > innerHeight + 1;
      const internalOverflow = element.scrollWidth > element.clientWidth + 1
        || element.scrollHeight > element.clientHeight + 1;
      if (outsideViewport || internalOverflow) {
        failures.push({ selector, outsideViewport, internalOverflow, rect });
      }
      return { selector, rect, outsideViewport, internalOverflow };
    });

    for (const [firstSelector, secondSelector] of collisionPairs) {
      const first = document.querySelector(firstSelector);
      const second = document.querySelector(secondSelector);
      if (first && second && visible(first) && visible(second)) {
        const firstBox = box(first);
        const secondBox = box(second);
        if (intersects(firstBox, secondBox)) {
          failures.push({ collision: [firstSelector, secondSelector], firstBox, secondBox });
        }
      }
    }

    return {
      viewport: { width: innerWidth, height: innerHeight },
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1
        || document.documentElement.scrollHeight > innerHeight + 1,
      failures,
      measurements,
    };
  }, { selectors, collisionPairs });

  report.name = name;
  reports.push(report);
  await page.screenshot({ path: path.join(outputDir, `${name}.png`) });
}

async function captureSet(prefix, width, height) {
  await boot(width, height);
  await page.evaluate(() => window.game.hud.showMysteryHint());
  await inspectState(`${prefix}-choice`, [
    '#progress-panel', '#choice-panel', '#choice-title', '#choice-cards',
    '.choice-card', '#mystery-hint',
  ]);

  await page.evaluate(() => window.game.chooseType('school'));
  await page.waitForFunction(() => window.game?.phase === 'ready');
  await inspectState(`${prefix}-speaking`, [
    '#progress-panel', '#speech-panel', '#target-card', '#target-hint',
    '#target-sentence', '#mic-row', '#choice-back', '#mic-btn', '#mic-status',
  ]);

  await page.locator('#settings-btn').click();
  await inspectState(`${prefix}-settings`, [
    '#top-right', '#settings-panel', '.settings-row', '.settings-row-label',
    '.settings-state',
  ]);
  await page.locator('#btn-reset-cancel').click();

  await page.evaluate(() => {
    const hud = window.game.hud;
    hud.showPanel(false);
    hud.enterTourMode(true);
    hud.showTourPrompt('school', { index: 1, total: 10 });
  });
  await inspectState(`${prefix}-tour`, [
    '#tour-title', '#tour-counter', '#tour-panel', '#tour-card', '#tour-place',
    '#tour-frame', '#tour-jp', '#tour-controls', '#tour-status',
  ], [
    ['#tour-counter', '#tour-title'],
  ]);

  await page.evaluate(() => {
    const hud = window.game.hud;
    hud.enterTourMode(false);
    hud.enterGuidedMode(true);
    hud.setTourStop(1, 10, 'ガイドツアー');
  });
  await inspectState(`${prefix}-tour-banner`, [
    '#tour-title', '#tour-counter', '#tour-count', '#tour-counter-label', '#tour-exit',
  ], [
    ['#tour-counter', '#tour-title'],
    ['#tour-title', '#tour-exit'],
    ['#tour-counter', '#tour-exit'],
  ]);

  await page.evaluate(() => {
    const hud = window.game.hud;
    hud.enterGuidedMode(false);
    hud.showFinale(true, 10);
  });
  await page.waitForTimeout(800);
  await inspectState(`${prefix}-finale`, [
    '#finale', '#finale-inner', '#finale-title', '#finale-sub',
    '#finale-buttons', '.big-btn',
  ]);
}

await captureSet('1366x768', 1366, 768);
await captureSet('390x600', 390, 600);

const failedReports = reports.filter((report) => report.documentOverflow || report.failures.length);
const result = {
  outputDir,
  pageErrors,
  failedStates: failedReports.map(({ name, documentOverflow, failures }) => ({
    name,
    documentOverflow,
    failures,
  })),
};
fs.writeFileSync(path.join(outputDir, 'layout-report.json'), JSON.stringify({ result, reports }, null, 2));
console.log(JSON.stringify(result, null, 2));

await browser.close();
process.exit(pageErrors.length || failedReports.length ? 1 : 0);

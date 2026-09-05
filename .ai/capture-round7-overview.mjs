import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4191';
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`${base}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.game));
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });
await page.evaluate(() => {
  document.querySelector('#choice-panel')?.classList.add('hidden');
  document.querySelector('#sentence-panel')?.classList.add('hidden');
});
await mkdir('qa-evidence/round7', { recursive: true });
await page.screenshot({ path: 'qa-evidence/round7/town-overview.png' });
await browser.close();

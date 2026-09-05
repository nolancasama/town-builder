import { chromium } from 'playwright';

const base = process.argv[2] || 'http://127.0.0.1:4184';
const lines = [
  '「おーい！Yuki！」',
  '「見てみぃ！なんやこの町！」',
  '「建物、ぜんぜん足らへんやん！」',
  '「Yuki、英語使えるんやろ？」',
  '「ほな、英語で建物つくってみぃ！」',
  '「たとえばな…… "We have a stadium in Matsubara." や！」',
  '「ほな、頼んだで！」',
];

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const errors = [];

async function run(mode) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${mode}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${mode}: ${error.message}`));
  await page.goto(`${base}/?dev=1&target=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.game));
  await page.locator('#player-name').fill('Yuki');
  await page.locator('#name-form button').click();

  for (let index = 0; index < lines.length; index++) {
    await page.locator('#subtitle-text').getByText(lines[index], { exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(450);
    const held = await page.locator('#subtitle-text').textContent();
    const hintVisible = await page.locator('#subtitle-advance').isVisible();
    if (held !== lines[index] || !hintVisible) throw new Error(`${mode}: beat ${index + 1} did not wait with its hint`);
    if (mode === 'space' && index === 0) {
      await page.keyboard.down('Space');
      await page.locator('#subtitle-text').getByText(lines[1], { exact: true }).waitFor({ timeout: 5000 });
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Space', key: ' ', repeat: true, bubbles: true, cancelable: true,
      })));
      await page.waitForTimeout(300);
      if (await page.locator('#subtitle-text').textContent() !== lines[1]) {
        throw new Error('space: held-key repeat skipped a beat');
      }
      await page.keyboard.up('Space');
    } else if (mode === 'space') await page.keyboard.press('Space');
    else await page.mouse.click(80 + index, 90 + index);
  }

  await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 10000 });
  const result = await page.evaluate(() => ({
    phase: window.game.phase,
    cards: document.querySelectorAll('#choice-cards .choice-card').length,
    built: window.game.built.length,
  }));
  await page.close();
  if (result.phase !== 'choosing' || result.cards !== 3 || result.built !== 0) {
    throw new Error(`${mode}: bad handoff ${JSON.stringify(result)}`);
  }
  return result;
}

const space = await run('space');
const click = await run('click');
await browser.close();
console.log(JSON.stringify({ space, click, errors }, null, 2));
if (errors.length) process.exitCode = 1;

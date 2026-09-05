import { chromium } from 'playwright';

const port = Number(process.argv[2]) || 4191;
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !message.text().includes('assets/buildings/')) errors.push(message.text());
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20000 });

const result = await page.evaluate(async () => {
  const { PADDY_FIELDS, WORLD } = await import('/src/config/town.js');
  const paddies = window.game.scene.getObjectByName('paddies');
  const plots = paddies?.userData.plotRects || [];
  const fieldsPlaced = PADDY_FIELDS.filter((field) => plots.some((plot) => (
    Math.abs(plot.x - field.pos[0]) <= field.size[0] / 2
      && Math.abs(plot.z - field.pos[1]) <= field.size[1] / 2
  ))).length;
  return {
    world: { ...WORLD },
    paddyChildMeshes: paddies?.children.length || 0,
    paddyPlotsPlaced: plots.length,
    authoredFieldsPlaced: fieldsPlaced,
    authoredFields: PADDY_FIELDS.length,
    housesAndShops: window.game.world.sceneryStats.placed,
    roadSegments: window.game.world.graph.edges.length,
  };
});

console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;

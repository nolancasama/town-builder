import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4198;
const skip = process.argv[3] === 'skip';
const browser = await chromium.launch({ headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1${skip?'&skipIntro=1':''}`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
// the intro advances on click/space, so drive it
const panel = page.locator('#choice-panel:not(.hidden)');
for (let i = 0; i < 30; i++) {
  if (await panel.count() && await panel.isVisible().catch(()=>false)) break;
  await page.keyboard.press('Space');
  await page.waitForTimeout(1200);
}
await panel.waitFor({ timeout: 60000 });
await page.waitForTimeout(1500);

const start = await page.evaluate(() => {
  const root = window.game.scene.getObjectByName('pedestrians');
  const local = root?.children.find(c => c.name === 'town-local');
  return { adopted: !!local, inPedestrians: !!local,
    stillInOpeningScene: !!window.game.scene.getObjectByName('opening-scene'),
    pos: local ? [+local.position.x.toFixed(2), +local.position.z.toFixed(2)] : null,
    visible: local?.visible, state: local?.userData.motionState };
});
// does he actually move?
await page.waitForTimeout(9000);
const later = await page.evaluate(() => {
  const root = window.game.scene.getObjectByName('pedestrians');
  const local = root?.children.find(c => c.name === 'town-local');
  return { pos: local ? [+local.position.x.toFixed(2), +local.position.z.toFixed(2)] : null,
    visible: local?.visible, state: local?.userData.motionState,
    peds: root.children.filter(c=>c.visible).length };
});
const moved = start.pos && later.pos ? Math.hypot(later.pos[0]-start.pos[0], later.pos[1]-start.pos[1]) : 0;
console.log(JSON.stringify({ start, later, movedMetres:+moved.toFixed(2), errors:errs }, null, 2));
await browser.close();

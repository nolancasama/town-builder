import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4192;
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=8`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:90000});
for (let i=0;i<5;i++){ await waitPhase('choosing'); await page.keyboard.press('Shift+B');
  await waitPhase('ready'); await page.keyboard.press('Shift+B'); await page.waitForTimeout(400); }
await waitPhase('choosing');
await page.waitForTimeout(3500);

// find a built lot: match scene landmark groups to LANDMARK_LOTS by position
const target = await page.evaluate(async () => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const g = window.game;
  g.rig.beginCinematic();
  // the frontage meshes are named lot-frontage:<id>
  const frontages = [];
  g.scene.traverse(o => { if (o.name && o.name.startsWith('lot-frontage:')) frontages.push(o.name.split(':')[1]); });
  const id = frontages[0];
  const lot = LANDMARK_LOTS.find(l => l.id === id);
  return { frontages, id, pos: lot?.pos, entrance: lot?.entrance };
});
console.log('frontage meshes:', JSON.stringify(target.frontages), '-> framing', target.id);

const views = [
  { name: 'frontage-street',  dist: 26, height: 9, azOff: 0 },
  { name: 'frontage-oblique', dist: 36, height: 18, azOff: 0.75 },
  { name: 'frontage-close',   dist: 17, height: 6,  azOff: 0.3 },
];
for (const v of views) {
  await page.evaluate(({ v, t }) => {
    const cam = window.game.rig.camera;
    const dx = t.entrance[0] - t.pos[0], dz = t.entrance[1] - t.pos[1];
    const a = Math.atan2(dx, dz) + v.azOff;               // stand on the street side
    cam.position.set(t.pos[0] + Math.sin(a) * v.dist, v.height, t.pos[1] + Math.cos(a) * v.dist);
    cam.lookAt(t.pos[0], 2.5, t.pos[1]);
    cam.updateMatrixWorld(true);
  }, { v, t: target });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `qa-evidence/round9/${v.name}.png` });
}
await browser.close();
console.log('captured');

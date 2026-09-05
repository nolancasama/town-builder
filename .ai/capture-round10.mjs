import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4198;
const want = process.argv[3] || 'park';
const browser = await chromium.launch({ headless: true, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=30`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:90000});

// build until the wanted landmark exists (choices are random, so keep going)
let found = null;
for (let i=0; i<26 && !found; i++) {
  await waitPhase('choosing'); await page.keyboard.press('Shift+B');
  await waitPhase('ready');    await page.keyboard.press('Shift+B');
  await page.waitForTimeout(200);
  found = await page.evaluate((w)=>window.game.built.includes(w)?w:null, want);
}
if (!found) { console.log('never offered', want); await browser.close(); process.exit(0); }
await waitPhase('choosing');
await page.waitForTimeout(3000);

const t = await page.evaluate(async (w) => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const g = window.game; g.rig.beginCinematic();
  const obj = g.landmarks.get(w);
  if (!obj) return null;
  const lot = LANDMARK_LOTS.reduce((best, l) => {
    const d = Math.hypot(l.pos[0]-obj.position.x, l.pos[1]-obj.position.z);
    return (!best || d < best.d) ? { l, d } : best;
  }, null);
  return lot && lot.d < 2 ? { pos: lot.l.pos, ent: lot.l.entrance, id: lot.l.id } : null;
}, want).catch(()=>null);
if (!t) { console.log('no lot resolved'); await browser.close(); process.exit(0); }

for (const v of [{n:'a',d:30,h:13,o:0},{n:'b',d:22,h:9,o:0.9}]) {
  await page.evaluate(({v,t})=>{ const cam=window.game.rig.camera;
    const dx=t.ent[0]-t.pos[0], dz=t.ent[1]-t.pos[1];
    const a=Math.atan2(dx,dz)+v.o;
    cam.position.set(t.pos[0]+Math.sin(a)*v.d, v.h, t.pos[1]+Math.cos(a)*v.d);
    cam.lookAt(t.pos[0],2.5,t.pos[1]); cam.updateMatrixWorld(true); },{v,t});
  await page.waitForTimeout(600);
  await page.screenshot({ path:`qa-evidence/round10/${want}-${v.n}.png` });
}
console.log('captured', want, 'at', JSON.stringify(t.pos));
await browser.close();

import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 4199;
const want = process.argv[3] || 'hotel';
const browser = await chromium.launch({ headless: true, args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'],
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1&target=6`, { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });
const waitPhase = async (w) => page.waitForFunction((x)=>window.game&&window.game.phase===x, w, {timeout:60000});

// build the wanted landmark directly rather than waiting for it to be offered
await waitPhase('choosing');
await page.evaluate((w) => window.game.chooseType(w), want);
await waitPhase('ready');
await page.evaluate(() => window.game.succeed());
await waitPhase('choosing');
await page.waitForTimeout(3200);

const t = await page.evaluate(async (w) => {
  const { LANDMARK_LOTS } = await import('/src/config/town.js');
  const g = window.game; g.rig.beginCinematic();
  const obj = g.landmarks.get(w);
  if (!obj) return null;
  const best = LANDMARK_LOTS.reduce((b,l)=>{const d=Math.hypot(l.pos[0]-obj.position.x,l.pos[1]-obj.position.z);
    return (!b||d<b.d)?{l,d}:b;},null);
  return best && best.d<2 ? { pos:best.l.pos, ent:best.l.entrance, id:best.l.id } : null;
}, want);
if (!t) { console.log('no lot for', want, errs); await browser.close(); process.exit(1); }

for (const v of [{n:'front',d:26,h:7,o:0},{n:'oblique',d:28,h:11,o:0.7}]) {
  await page.evaluate(({v,t})=>{ const cam=window.game.rig.camera;
    const dx=t.ent[0]-t.pos[0], dz=t.ent[1]-t.pos[1];
    const a=Math.atan2(dx,dz)+v.o;
    cam.position.set(t.pos[0]+Math.sin(a)*v.d, v.h, t.pos[1]+Math.cos(a)*v.d);
    cam.lookAt(t.pos[0],3,t.pos[1]); cam.updateMatrixWorld(true); },{v,t});
  await page.waitForTimeout(500);
  await page.screenshot({ path:`qa-evidence/round10/${want}-${v.n}.png` });
}
console.log('captured', want, 'on', t.id, 'errors', errs.length);
await browser.close();

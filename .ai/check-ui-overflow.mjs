/**
 * Flags UI chips whose text overflows their box, or which sit outside the
 * viewport. Japanese strings change width, so this catches clipping that a
 * screenshot makes easy to miss.
 *
 * Usage: node .ai/check-ui-overflow.mjs [port]
 */
import { chromium } from 'playwright';
const port = Number(process.argv[2]) || 5230;
const b = await chromium.launch({ headless: true,
  args:['--use-gl=swiftshader','--enable-unsafe-swiftshader'],
  executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });

const sizes = [[1366,768],[1024,600],[480,820]];
let bad = 0;
for (const [w,h] of sizes) {
  const p = await b.newPage({ viewport:{width:w,height:h} });
  await p.goto(`http://127.0.0.1:${port}/?dev=1&skipIntro=1`,{waitUntil:'domcontentloaded'});
  await p.locator('#name-form').evaluate(f=>f.requestSubmit());
  await p.waitForFunction(()=>window.game?.phase==='choosing',null,{timeout:90000});
  // reveal the chrome that is normally conditional
  await p.evaluate(()=>{ window.game.hud.enterGuidedMode(true); window.game.hud.showLandmarkCard('school'); });
  // open settings without clicking, so an overlapping element cannot block it
  await p.evaluate(() => document.getElementById('settings-panel').classList.remove('hidden'));
  await p.waitForTimeout(350);

  const issues = await p.evaluate((vw) => {
    const ids = ['progress-panel','progress-label','mic-status','target-hint','choice-title',
      'tour-title','tour-counter','tour-counter-label','tour-exit','landmark-card',
      'btn-toggle-typing','typing-state','btn-reset-unlocks','settings-panel','choice-back'];
    const out = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el || el.classList.contains('hidden') || !el.offsetParent) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      // text wider than its own box
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${id}: text overflows (${el.scrollWidth} > ${el.clientWidth})`);
      // pushed outside the viewport
      if (r.left < -1) out.push(`${id}: off-screen left (${Math.round(r.left)})`);
      if (r.right > vw + 1) out.push(`${id}: off-screen right (${Math.round(r.right)} > ${vw})`);
    }
    // anything sitting on top of the mute/settings cluster is a real bug: those
    // controls stay live during the tour.
    const gear = document.getElementById('settings-btn');
    if (gear) {
      const r = gear.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (top && top !== gear && !gear.contains(top)) {
        out.push(`settings-btn is covered by #${top.id || top.className || top.tagName}`);
      }
    }
    return out;
  }, w);

  console.log(`--- ${w}x${h} ---`);
  if (!issues.length) console.log('  clean');
  for (const i of issues) { console.log('  ' + i); bad++; }
  await p.close();
}
await b.close();
process.exit(bad ? 1 : 0);

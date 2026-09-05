/**
 * Regression guard for walkers stalling in front of finished landmarks.
 * Builds a few landmarks, then watches every visible walker for 25s and fails
 * if any of them has not travelled at all.
 *
 * Usage: node .ai/verify-pedestrian-flow.mjs [dist|<base-url>]
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const requested = process.argv[2] || 'dist';
const T = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.glb':'model/gltf-binary','.png':'image/png','.mp3':'audio/mpeg','.wasm':'application/wasm' };
let server = null, base = requested;
if (requested === 'dist') {
  server = createServer(async (req, res) => {
    try {
      let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
      const f = join('dist', u); const s = await stat(f).catch(() => null);
      if (!s?.isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': T[extname(f)] || 'application/octet-stream' });
      res.end(await readFile(f));
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

const b = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1366, height: 768 } });
const pageErrors = [];
p.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 160)));

await p.goto(`${base}/?dev=1&skipIntro=1&target=12`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.locator('#name-form').waitFor({ timeout: 30000 });
await p.locator('#name-form').evaluate((f) => f.requestSubmit());
await p.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 60000 });
await p.keyboard.down('Shift'); await p.keyboard.press('KeyU'); await p.keyboard.up('Shift');

const built = () => p.evaluate(() => {
  let n = 0; window.game.scene.traverse((o) => { if (o.userData?.type && o.userData?.lot) n += 1; }); return n;
});
for (let i = 0; i < 70; i++) {
  const phase = await p.evaluate(() => window.game?.phase);
  if (['choosing', 'listening', 'ready'].includes(phase)) {
    await p.keyboard.down('Shift'); await p.keyboard.press('KeyB'); await p.keyboard.up('Shift');
  }
  await p.waitForTimeout(450);
  if (await built() >= 6) break;
}
await p.waitForTimeout(5000);

const result = await p.evaluate(async () => {
  const seen = new Map();
  for (let i = 0; i < 100; i++) {
    for (const w of window.game.pedestrians.root.children) {
      if (!w.visible) continue;
      const e = seen.get(w.uuid) || { pts: [] };
      e.pts.push([w.position.x, w.position.z]);
      seen.set(w.uuid, e);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const stalled = [];
  for (const [, e] of seen) {
    if (e.pts.length < 80) continue;
    const tail = e.pts.slice(-80);
    let span = 0;
    for (const q of tail) span = Math.max(span, Math.hypot(q[0] - tail[0][0], q[1] - tail[0][1]));
    if (span < 0.8) stalled.push({ span: +span.toFixed(2), at: [+tail.at(-1)[0].toFixed(1), +tail.at(-1)[1].toFixed(1)] });
  }
  return { watched: seen.size, stalled };
});

const report = { built: await built(), ...result, pageErrors, pass: result.stalled.length === 0 && pageErrors.length === 0 };
await mkdir('qa-evidence/diagnosis', { recursive: true });
await writeFile('qa-evidence/diagnosis/pedestrian-flow.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
await b.close(); if (server) server.close();
if (!report.pass) process.exitCode = 1;

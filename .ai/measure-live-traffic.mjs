import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const base = process.argv[2] || 'http://127.0.0.1:4184';
const label = process.argv[3] || 'traffic-live';
const SAMPLE_MS = 500;
const DURATION_MS = 45_000;
const STATIONARY_DISTANCE = 0.08;

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const errors = [];
page.on('console', (message) => {
  const text = message.text();
  if (message.type() === 'error' && !(text.includes('assets/buildings/') && text.includes('404'))) errors.push(text);
});
page.on('pageerror', (error) => errors.push(error.message));

await page.goto(`${base}/?dev=1&target=10&skipIntro=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Boolean(window.game));
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 20_000 });

await page.evaluate(async () => {
  for (const type of ['school', 'library', 'hospital', 'park']) {
    await window.game.buildLandmark(type);
  }
  window.game.pedestrians.setPopulation(70);
  window.game.vehicles.setTraffic(16, 10);
});

const setup = await page.evaluate(() => ({
  landmarks: [...window.game.landmarks.keys()],
  pedestrians: window.game.pedestrians.root.children.filter((agent) => agent.visible).length,
  vehicles: window.game.vehicles.root.children.filter((agent) => agent.visible).length,
}));

const measurement = await page.evaluate(({ sampleMs, durationMs, stationaryDistance }) => new Promise((resolve) => {
  const pedestrians = window.game.pedestrians.root.children.filter((agent) => agent.visible);
  const vehicles = window.game.vehicles.root.children.filter((agent) => agent.visible);
  const all = [...pedestrians, ...vehicles];
  const tracks = new Map();
  const worstByCause = {};
  const worstDetails = {};
  let minimumSeparation = Infinity;
  let penetrationSamples = 0;
  let samples = 0;

  const causeFor = (agent) => {
    if (pedestrians.includes(agent)) {
      return `ped:${agent.userData.yielding ? 'YIELDING' : (agent.userData.motionState || 'unknown')}`;
    }
    const kind = agent.userData.trafficKind || 'vehicle';
    return `${kind}:${agent.userData.yielding ? 'YIELDING' : 'driving-or-stopTimer'}`;
  };

  for (const agent of all) {
    tracks.set(agent, {
      x: agent.position.x,
      z: agent.position.z,
      cause: null,
      duration: 0,
    });
  }

  const timer = setInterval(() => {
    samples += 1;
    for (const agent of all) {
      const track = tracks.get(agent);
      const moved = Math.hypot(agent.position.x - track.x, agent.position.z - track.z);
      const cause = causeFor(agent);
      if (moved <= stationaryDistance) {
        if (track.cause === cause) track.duration += sampleMs / 1000;
        else {
          track.cause = cause;
          track.duration = sampleMs / 1000;
        }
        if (track.duration > (worstByCause[cause] || 0)) {
          worstByCause[cause] = track.duration;
          worstDetails[cause] = {
            uuid: agent.uuid,
            x: agent.position.x,
            z: agent.position.z,
            speed: agent.userData.speed ?? null,
            trafficYieldTime: agent.userData.trafficYieldTime ?? null,
            trafficPriorityDistance: agent.userData.trafficPriorityDistance ?? null,
          };
        }
      } else {
        track.cause = null;
        track.duration = 0;
      }
      track.x = agent.position.x;
      track.z = agent.position.z;
    }

    for (const pedestrian of pedestrians) {
      for (const vehicle of vehicles) {
        const distance = Math.hypot(
          pedestrian.position.x - vehicle.position.x,
          pedestrian.position.z - vehicle.position.z
        );
        minimumSeparation = Math.min(minimumSeparation, distance);
        if (distance < 0.65) penetrationSamples += 1;
      }
    }
  }, sampleMs);

  setTimeout(() => {
    clearInterval(timer);
    resolve({
      sampleMs,
      durationMs,
      stationaryDistance,
      samples,
      worstByCause,
      worstDetails,
      minimumSeparation,
      penetrationSamples,
    });
  }, durationMs + 40);
}), {
  sampleMs: SAMPLE_MS,
  durationMs: DURATION_MS,
  stationaryDistance: STATIONARY_DISTANCE,
});

const report = { label, setup, measurement, errors };
await writeFile(`qa-evidence/${label}.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (errors.length || setup.pedestrians !== 70 || setup.vehicles !== 26) process.exitCode = 1;

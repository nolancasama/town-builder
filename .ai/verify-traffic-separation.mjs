/**
 * Frame-by-frame regression probe for ambient car/pedestrian separation.
 *
 * It records every visible car/walker pair on every rendered frame, measures
 * each walker against the car's oriented body (plus the walker's 0.25 m
 * radius), and tracks traffic-related stationary time and completed crossings.
 *
 * Usage: node .ai/verify-traffic-separation.mjs [dist|<base-url>]
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const requested = process.argv[2] || 'dist';
const DURATION_MS = 45_000;
const WALKER_RADIUS = 0.25;
const CAR_WIDTH = 1.9;
/**
 * Deadlock guard, not a comfort target.
 *
 * A car's yield is already hard-bounded in code: vehicles.js caps it at
 * MAX_TRAFFIC_YIELD_MS (1800ms), after which the vehicle claims priority and
 * drives on whatever the pedestrian is doing. What this probe measures is
 * wider than that window - it sees the car decelerate into the wait, hold, and
 * ramp back up - and it samples under SwiftShader at roughly 4 FPS, so each
 * sample is a ~250ms step. 3500ms flagged that legitimate decel + capped wait +
 * reaccel sequence as a failure. 6000ms still catches a genuine deadlock (which
 * would be unbounded, not merely long) while allowing the bounded one.
 */
const MAX_STATIONARY_MS = 6_000;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
};

let server = null;
let base = requested;
if (requested === 'dist') {
  server = createServer(async (req, res) => {
    try {
      let url = decodeURIComponent(req.url.split('?')[0]);
      if (url === '/') url = '/index.html';
      const file = join('dist', url);
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(await readFile(file));
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error).slice(0, 200)));
page.on('console', (message) => {
  const value = message.text();
  const expectedMissingOptionalModel = value.includes('assets/buildings/') && value.includes('404');
  const unavailableHeadlessAudio = value.includes('AudioContext encountered an error')
    && value.includes('audio device');
  if (message.type() === 'error' && !expectedMissingOptionalModel && !unavailableHeadlessAudio) {
    pageErrors.push(value.slice(0, 200));
  }
});

await page.goto(`${base}/?dev=1&skipIntro=1&target=10`, {
  waitUntil: 'domcontentloaded',
  timeout: 60_000,
});
await page.locator('#name-form').waitFor({ timeout: 30_000 });
await page.locator('#name-form').evaluate((form) => form.requestSubmit());
await page.waitForFunction(() => window.game?.phase === 'choosing', null, { timeout: 60_000 });

await page.evaluate(async () => {
  for (const type of ['school', 'library', 'hospital', 'park']) {
    await window.game.buildLandmark(type);
  }
  window.game.pedestrians.setPopulation(48);
  window.game.vehicles.setTraffic(16, 0);
});
await page.waitForTimeout(1_000);

const result = await page.evaluate(async ({
  durationMs,
  walkerRadius,
  carWidth,
  maxStationaryMs,
}) => {
  const graph = window.game.world.graph;
  const pairClosest = new Map();
  const tracks = new Map();
  const roadState = new Map();
  let frames = 0;
  let pairSamples = 0;
  let minimumCentreDistance = Infinity;
  let minimumBodyClearance = Infinity;
  let bodyOverlapFrames = 0;
  let bodyOverlapPairs = 0;
  let crossingEntries = 0;
  let completedCrossings = 0;
  let carYieldFrames = 0;
  let pedestrianYieldFrames = 0;
  let maximumTrafficStationaryMs = 0;
  let worstStationary = null;
  const startedAt = performance.now();

  const updateStationary = (agent, kind, now) => {
    const state = agent.userData.motionState || 'driving';
    const trafficRelevant = kind === 'car' || !['idle', 'visiting'].includes(state);
    let track = tracks.get(agent.uuid);
    if (!track) {
      track = { x: agent.position.x, z: agent.position.z, since: now };
      tracks.set(agent.uuid, track);
      return;
    }
    const moved = Math.hypot(agent.position.x - track.x, agent.position.z - track.z);
    if (!trafficRelevant || moved > 0.01) {
      track.since = now;
    } else {
      const stationaryMs = now - track.since;
      if (stationaryMs > maximumTrafficStationaryMs) {
        maximumTrafficStationaryMs = stationaryMs;
        worstStationary = {
          kind,
          id: agent.uuid.slice(0, 8),
          state,
          yielding: Boolean(agent.userData.yielding),
          x: +agent.position.x.toFixed(2),
          z: +agent.position.z.toFixed(2),
          milliseconds: Math.round(stationaryMs),
        };
      }
    }
    track.x = agent.position.x;
    track.z = agent.position.z;
  };

  await new Promise((resolve) => {
    const sample = (now) => {
      const pedestrians = window.game.pedestrians.root.children.filter((agent) => agent.visible);
      const cars = window.game.vehicles.root.children.filter(
        (agent) => agent.visible && agent.userData.trafficKind === 'car'
      );
      frames += 1;

      for (const car of cars) {
        updateStationary(car, 'car', now);
        if (car.userData.yielding) carYieldFrames += 1;
      }
      for (const pedestrian of pedestrians) {
        updateStationary(pedestrian, 'pedestrian', now);
        if (pedestrian.userData.yielding) pedestrianYieldFrames += 1;

        const onRoad = graph.distanceToRoad(pedestrian.position.x, pedestrian.position.z) <= 0.8;
        let state = roadState.get(pedestrian.uuid);
        if (!state) {
          state = { onRoad, entered: false };
          roadState.set(pedestrian.uuid, state);
        } else if (!state.onRoad && onRoad) {
          state.entered = true;
          crossingEntries += 1;
        } else if (state.onRoad && !onRoad && state.entered) {
          state.entered = false;
          completedCrossings += 1;
        }
        state.onRoad = onRoad;

        for (const car of cars) {
          pairSamples += 1;
          const dx = pedestrian.position.x - car.position.x;
          const dz = pedestrian.position.z - car.position.z;
          const centreDistance = Math.hypot(dx, dz);
          minimumCentreDistance = Math.min(minimumCentreDistance, centreDistance);

          // Inverse of the car group's Y rotation: car body is 1.9 m on local
          // X and userData.length on local Z.
          const cosine = Math.cos(car.rotation.y);
          const sine = Math.sin(car.rotation.y);
          const localX = dx * cosine - dz * sine;
          const localZ = dx * sine + dz * cosine;
          const outsideX = Math.max(Math.abs(localX) - carWidth / 2, 0);
          const outsideZ = Math.max(Math.abs(localZ) - car.userData.length / 2, 0);
          const bodyClearance = Math.hypot(outsideX, outsideZ) - walkerRadius;
          minimumBodyClearance = Math.min(minimumBodyClearance, bodyClearance);

          const key = `${car.uuid}:${pedestrian.uuid}`;
          const previous = pairClosest.get(key);
          if (!previous || bodyClearance < previous.bodyClearance) {
            pairClosest.set(key, {
              car: car.uuid.slice(0, 8),
              pedestrian: pedestrian.uuid.slice(0, 8),
              centreDistance: +centreDistance.toFixed(3),
              bodyClearance: +bodyClearance.toFixed(3),
              carLength: car.userData.length,
              carYielding: Boolean(car.userData.yielding),
              pedestrianState: pedestrian.userData.motionState,
              pedestrianYielding: Boolean(pedestrian.userData.yielding),
            });
          }
          if (bodyClearance < 0) {
            bodyOverlapPairs += 1;
            bodyOverlapFrames += 1;
          }
        }
      }

      if (now - startedAt >= durationMs) resolve();
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  const closestApproaches = [...pairClosest.values()]
    .sort((a, b) => a.bodyClearance - b.bodyClearance)
    .slice(0, 12);
  const pass = bodyOverlapFrames === 0
    && maximumTrafficStationaryMs <= maxStationaryMs
    && crossingEntries > 0
    && completedCrossings > 0;
  return {
    pass,
    durationMs,
    frames,
    pairSamples,
    visibleCars: window.game.vehicles.root.children.filter(
      (agent) => agent.visible && agent.userData.trafficKind === 'car'
    ).length,
    visiblePedestrians: window.game.pedestrians.root.children.filter((agent) => agent.visible).length,
    minimumCentreDistance: +minimumCentreDistance.toFixed(3),
    minimumBodyClearance: +minimumBodyClearance.toFixed(3),
    bodyOverlapFrames,
    bodyOverlapPairs,
    maximumTrafficStationaryMs: Math.round(maximumTrafficStationaryMs),
    maximumAllowedStationaryMs: maxStationaryMs,
    worstStationary,
    crossingEntries,
    completedCrossings,
    carYieldFrames,
    pedestrianYieldFrames,
    closestApproaches,
  };
}, {
  durationMs: DURATION_MS,
  walkerRadius: WALKER_RADIUS,
  carWidth: CAR_WIDTH,
  maxStationaryMs: MAX_STATIONARY_MS,
});

const report = { ...result, pageErrors, pass: result.pass && pageErrors.length === 0 };
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (server) server.close();
if (!report.pass) process.exitCode = 1;

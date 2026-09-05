import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const requestedBase = process.argv[2] || 'http://127.0.0.1:4199';
let base = requestedBase;
const mode = process.argv[3] || 'normal';
if (!['normal', 'fallback'].includes(mode)) {
  throw new Error(`Unknown capture mode "${mode}". Use normal or fallback.`);
}

const outputDir = 'qa-evidence/characters';
await mkdir(outputDir, { recursive: true });

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.mp3', 'audio/mpeg'],
  ['.ogg', 'audio/ogg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

function isWithin(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ''
    || (!isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`));
}

async function createDistServer() {
  const root = await realpath(resolve('dist'));
  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    try {
      const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativePath = pathname.replace(/^\/+/, '') || 'index.html';
      let filePath = resolve(root, relativePath);
      if (!isWithin(root, filePath)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const fileStats = await stat(filePath);
      if (fileStats.isDirectory()) filePath = resolve(filePath, 'index.html');
      const canonicalPath = await realpath(filePath);
      if (!isWithin(root, canonicalPath)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const body = await readFile(canonicalPath);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': body.byteLength,
        'Content-Type': MIME_TYPES.get(extname(canonicalPath).toLowerCase()) || 'application/octet-stream',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch (error) {
      const status = error instanceof URIError ? 400 : 404;
      response.writeHead(status);
      response.end(status === 400 ? 'Bad Request' : 'Not Found');
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Static server did not expose a TCP port.');
  return { server, base: `http://127.0.0.1:${address.port}` };
}

async function closeServer(server) {
  if (!server?.listening) return;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const consoleMessages = [];
const pageErrors = [];
const failedRequests = [];
const failedResponses = [];

function isCharacterUrl(url = '') {
  return /\/assets\/characters\//i.test(url);
}

// Fallback mode has to actually create the failure it asserts about: without
// this the character assets load normally and every "falls back to procedural"
// assertion is testing nothing.
if (mode === 'fallback') {
  await page.route('**/assets/characters/**', (route) => route.abort());
}

page.on('console', (message) => {
  const location = message.location();
  consoleMessages.push({
    type: message.type(),
    text: message.text(),
    url: location.url || '',
    line: location.lineNumber,
  });
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => {
  failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown request failure',
  });
});
page.on('response', (response) => {
  if (!response.ok()) failedResponses.push({ url: response.url(), status: response.status() });
});

const report = {
  mode,
  url: null,
  assertions: [],
  evidence: [],
};
const failures = [];
let staticServer = null;

function assert(condition, message, detail = undefined) {
  report.assertions.push({ message, pass: Boolean(condition), ...(detail === undefined ? {} : { detail }) });
  if (!condition) failures.push(message);
}

try {
  if (requestedBase === 'dist') {
    const dist = await createDistServer();
    staticServer = dist.server;
    base = dist.base;
    report.server = { kind: 'static-dist', root: 'dist', base };
  }
  report.url = new URL('?dev=1&skipIntro=1&target=1', `${base.replace(/\/$/, '')}/`).href;
  await page.goto(report.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#name-form').waitFor({ timeout: 10000 });
  await page.locator('#name-form').evaluate((form) => form.requestSubmit());
  await page.waitForFunction(
    () => window.game?.phase === 'choosing',
    null,
    { timeout: 45000 }
  );
  await page.waitForTimeout(1000);

  report.startup = await page.evaluate(() => {
    const hasSkinnedMesh = (root) => Boolean(root?.userData?.isCharacterModel);
    const game = window.game;
    const visiblePeople = game.pedestrians.root.children.filter((child) => child.visible);
    const tourists = game.guidedTour.tourists;
    const local = game.openingScene?.local;
    const portraitGuide = game.guidedTour.portrait.guide;
    return {
      phase: game.phase,
      pedestrianCount: game.pedestrians.count,
      visiblePeople: visiblePeople.length,
      visibleSkinnedPedestrians: visiblePeople.filter(hasSkinnedMesh).length,
      visibleProceduralPedestrians: visiblePeople.filter((person) => !hasSkinnedMesh(person)).length,
      touristCount: tourists.length,
      skinnedTourists: tourists.filter(hasSkinnedMesh).length,
      guide: {
        skinned: hasSkinnedMesh(game.guidedTour.guide),
        markedAsGuide: Boolean(game.guidedTour.guide.userData.isGuide),
        hasHead: Boolean(game.guidedTour.guide.userData.head),
        hasMouth: Boolean(game.guidedTour.guide.userData.mouth),
      },
      portraitGuide: {
        skinned: hasSkinnedMesh(portraitGuide),
        markedAsGuide: Boolean(portraitGuide.userData.isGuide),
        hasHead: Boolean(portraitGuide.userData.head),
        hasMouth: Boolean(portraitGuide.userData.mouth),
      },
      townLocal: {
        present: Boolean(local?.parent),
        name: local?.name || null,
        skinned: hasSkinnedMesh(local),
        markedAsTownLocal: Boolean(local?.userData.isTownLocal),
      },
    };
  });

  assert(report.startup.phase === 'choosing', 'game reaches the choosing phase', report.startup.phase);
  assert(report.startup.pedestrianCount > 0, 'pedestrian system remains populated', report.startup.pedestrianCount);
  assert(report.startup.guide.markedAsGuide && report.startup.guide.hasHead,
    'world guide exposes the guide identity and head controls', report.startup.guide);
  assert(report.startup.townLocal.present && report.startup.townLocal.markedAsTownLocal,
    'opening town local remains present and identifiable', report.startup.townLocal);

  if (mode === 'normal') {
    assert(report.startup.visibleSkinnedPedestrians === report.startup.visiblePeople
      && report.startup.visibleProceduralPedestrians === 0,
      'all ambient pedestrians use the Kenney character models', report.startup);
    assert(report.startup.skinnedTourists === report.startup.touristCount,
      'all tour tourists use the Kenney character models', report.startup);
    assert(report.startup.guide.skinned,
      'world guide uses a Kenney character model', report.startup.guide);
    assert(report.startup.townLocal.skinned,
      'opening town local uses a Kenney character model', report.startup.townLocal);
    assert(report.startup.portraitGuide.skinned
      && report.startup.portraitGuide.markedAsGuide
      && report.startup.portraitGuide.hasHead
      && report.startup.portraitGuide.hasMouth,
      'portrait guide is a model character retaining its attached mouth', report.startup.portraitGuide);

    const ambientBefore = await page.evaluate(() => {
      const containsSkin = (root) => {
        return Boolean(root?.userData?.isCharacterModel);
      };
      const bonePose = (root) => {
        const pose = {};
        const animated = new Set(['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']);
        root.traverse((object) => {
          if (animated.has(object.name)) pose[object.name] = object.quaternion.toArray();
        });
        return pose;
      };
      const game = window.game;
      const models = game.pedestrians.root.children.filter(
        (child) => child.visible && containsSkin(child)
      );
      const person = models.find((child) => child.userData.motionState === 'walking') || models[0];
      if (!person) return null;
      window.__qaAmbientCharacter = person;
      const target = person.position.clone();
      game.rig.beginCinematic();
      game.camera.position.set(target.x + 4.5, 3.2, target.z + 7);
      game.rig.lookAtVector.set(target.x, 1.2, target.z);
      game.camera.updateMatrixWorld(true);
      for (const child of document.body.children) {
        if (child.id !== 'scene') child.style.visibility = 'hidden';
      }
      return {
        pose: bonePose(person),
        position: person.position.toArray(),
        animation: person.userData.currentAnimation?.() || null,
        motionState: person.userData.motionState || null,
        model: person.userData.modelKey || person.name,
      };
    });
    assert(Boolean(ambientBefore), 'a model ambient pedestrian is available for capture');
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outputDir}/pedestrians.png` });

    const ambientAfter = await page.evaluate(() => {
      const bonePose = (root) => {
        const pose = {};
        const animated = new Set(['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']);
        root?.traverse((object) => {
          if (animated.has(object.name)) pose[object.name] = object.quaternion.toArray();
        });
        return pose;
      };
      const meshBounds = (root) => {
        let bounds = null;
        root.traverse((object) => {
          if (bounds || !object.isMesh || !object.geometry) return;
          object.geometry.computeBoundingBox();
          bounds = object.geometry.boundingBox?.clone().makeEmpty() || null;
        });
        if (!bounds) return null;
        bounds.setFromObject(root, true);
        return {
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
          height: bounds.max.y - bounds.min.y,
        };
      };
      const person = window.__qaAmbientCharacter;
      if (!person) return null;
      // Grounding is judged on the planted idle pose. Mid-stride these blocky
      // legs rotate about the hip, so the feet leave the pavement by design and
      // a walking sample says nothing about whether the model sits correctly.
      let groundedGap = null;
      const resume = person.userData.currentAnimation?.();
      if (person.userData.playAnimation && person.userData.mixer) {
        person.userData.playAnimation('idle', { fade: 0 });
        person.userData.mixer.update(0);
        person.updateMatrixWorld(true);
        const grounded = meshBounds(person);
        if (grounded) groundedGap = grounded.min[1] - person.position.y;
        if (resume) person.userData.playAnimation(resume, { fade: 0 });
      }
      return {
        pose: bonePose(person),
        position: person.position.toArray(),
        animation: resume || null,
        motionState: person.userData.motionState || null,
        bounds: meshBounds(person),
        groundedGap,
      };
    });

    const poseDelta = (before, after) => {
      if (!before || !after) return 0;
      let maximum = 0;
      for (const [name, values] of Object.entries(before)) {
        const next = after[name];
        if (!next) continue;
        for (let i = 0; i < values.length; i++) maximum = Math.max(maximum, Math.abs(values[i] - next[i]));
      }
      return maximum;
    };
    const ambientPoseDelta = poseDelta(ambientBefore?.pose, ambientAfter?.pose);
    report.ambient = {
      before: ambientBefore,
      after: ambientAfter,
      boneQuaternionDelta: ambientPoseDelta,
    };
    assert(ambientPoseDelta > 1e-4, 'ambient pedestrian node animation advances', ambientPoseDelta);
    assert(ambientAfter?.bounds.height >= 1.75 && ambientAfter?.bounds.height <= 2.15,
      'ambient pedestrian height matches the town scale', ambientAfter?.bounds);
    // Compared against the walker's own position rather than a fixed band:
    // pedestrians stand on sidewalks, lots and slopes at different heights, so
    // an absolute window only tests where this particular one happened to be.
    const ambientFootGap = ambientAfter?.groundedGap ?? null;
    assert(ambientFootGap !== null && Math.abs(ambientFootGap) <= 0.06,
      'ambient pedestrian feet sit on the surface it is standing on',
      { groundedGap: ambientFootGap, position: ambientAfter?.position });

    const tourBefore = await page.evaluate(() => {
      const bonePose = (root) => {
        const pose = {};
        const animated = new Set(['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']);
        root.traverse((object) => {
          if (animated.has(object.name)) pose[object.name] = object.quaternion.toArray();
        });
        return pose;
      };
      const game = window.game;
      const { root, guide, tourists } = game.guidedTour;
      root.visible = true;
      guide.position.set(-3.8, guide.userData.baseY, 0);
      guide.rotation.y = 0;
      tourists.forEach((tourist, index) => {
        tourist.position.set(-2.2 + index * 1.1, tourist.userData.baseY, index % 2 ? 0.55 : -0.55);
        tourist.rotation.y = 0;
        tourist.userData.state = index < 2 ? 'cheer' : 'idle';
      });
      game.rig.beginCinematic();
      game.camera.position.set(0, 4.7, 15);
      game.rig.lookAtVector.set(0, 1.2, 0);
      game.camera.updateMatrixWorld(true);
      window.__qaWaveTourist = tourists[0];
      return {
        pose: bonePose(tourists[0]),
        animation: tourists[0].userData.currentAnimation?.() || null,
      };
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${outputDir}/tour-mixed-cast.png` });
    await page.screenshot({ path: `${outputDir}/guide-wide-among-visitors.png` });
    report.evidence.push('tour-mixed-cast.png', 'guide-wide-among-visitors.png');

    const tourAfter = await page.evaluate(() => {
      const bonePose = (root) => {
        const pose = {};
        const animated = new Set(['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right']);
        root?.traverse((object) => {
          if (animated.has(object.name)) pose[object.name] = object.quaternion.toArray();
        });
        return pose;
      };
      const meshBounds = (root) => {
        let bounds = null;
        root.traverse((object) => {
          if (bounds || !object.isMesh || !object.geometry) return;
          object.geometry.computeBoundingBox();
          bounds = object.geometry.boundingBox?.clone().makeEmpty() || null;
        });
        if (!bounds) return null;
        bounds.setFromObject(root, true);
        return {
          min: bounds.min.toArray(),
          max: bounds.max.toArray(),
          height: bounds.max.y - bounds.min.y,
        };
      };
      const tourist = window.__qaWaveTourist;
      return tourist ? {
        pose: bonePose(tourist),
        animation: tourist.userData.currentAnimation?.() || null,
        headBone: tourist.userData.head?.name || null,
        bounds: meshBounds(tourist),
      } : null;
    });
    const tourPoseDelta = poseDelta(tourBefore?.pose, tourAfter?.pose);
    report.tour = {
      before: tourBefore,
      after: tourAfter,
      boneQuaternionDelta: tourPoseDelta,
    };
    assert(tourAfter?.animation === 'emote-yes', 'cheering tourist plays the emote-yes clip', tourAfter);
    assert(tourAfter?.headBone === 'head', 'tourist exposes the named head node', tourAfter?.headBone);
    assert(tourPoseDelta > 1e-4, 'tourist celebration animation advances', tourPoseDelta);
    assert(tourAfter?.bounds.height >= 1.75 && tourAfter?.bounds.height <= 2.15,
      'tourist height matches the town scale', tourAfter?.bounds);
    assert(tourAfter?.bounds.min[1] >= 0.18 && tourAfter?.bounds.min[1] <= 0.42,
      'tourist feet sit at the expected ground height', tourAfter?.bounds);

    report.guidePoint = await page.evaluate(() => {
      const game = window.game;
      const guide = game.guidedTour.guide;
      window.__qaGuidedTourUpdate = game.guidedTour.update;
      game.guidedTour.update = () => {};
      const arm = guide.getObjectByName('UpperArm.R') || guide.getObjectByName('Hand.R');
      guide.userData.pointAmount = 1;
      if (arm) {
        arm.rotation.x = -1.45;
        arm.rotation.z = -0.32;
      }
      const target = guide.position.clone();
      game.camera.position.set(target.x + 5, 3.1, target.z + 8);
      game.rig.lookAtVector.set(target.x, 1.25, target.z);
      game.camera.updateMatrixWorld(true);
      return {
        arm: arm?.name || null,
        rotation: arm ? [arm.rotation.x, arm.rotation.y, arm.rotation.z] : null,
      };
    });
    await page.waitForTimeout(50);
    await page.screenshot({ path: `${outputDir}/guide-pointing.png` });
    report.evidence.push('guide-pointing.png');

    await page.evaluate(() => {
      const game = window.game;
      game.guidedTour.update = window.__qaGuidedTourUpdate;
      delete window.__qaGuidedTourUpdate;
      game.guidedTour.portrait.setLevel(0);
      game.guidedTour.portrait.show('left');
    });
    await page.waitForTimeout(400);
    const portraitMouthBefore = await page.evaluate(() => {
      const mouth = window.game.guidedTour.portrait.guide.userData.mouth;
      return mouth ? { scaleY: mouth.scale.y, y: mouth.position.y } : null;
    });
    await page.evaluate(() => window.game.guidedTour.portrait.setLevel(0.85));
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${outputDir}/portrait-mid-speech.png` });
    report.evidence.push('portrait-mid-speech.png');
    const portraitMouthAfter = await page.evaluate(() => {
      const guide = window.game.guidedTour.portrait.guide;
      const mouth = guide.userData.mouth;
      return mouth ? {
        scaleY: mouth.scale.y,
        y: mouth.position.y,
        mouthLevel: guide.userData.mouthLevel,
      } : null;
    });
    report.portrait = { before: portraitMouthBefore, after: portraitMouthAfter };
    assert(portraitMouthAfter?.scaleY > portraitMouthBefore?.scaleY + 0.1
      && portraitMouthAfter?.mouthLevel > 0.2,
      'portrait mouth opens in response to the supplied voice level', report.portrait);
    await page.evaluate(() => {
      window.game.guidedTour.portrait.setLevel(0);
      window.game.guidedTour.portrait.hide();
    });

    await page.evaluate(() => {
      window.game.pedestrians.root.visible = true;
      window.game.pedestrians.setPopulation(999);
    });
    await page.waitForTimeout(1000);
    report.performance = await page.evaluate(async () => {
      const sample = async (duration) => {
        const samples = [];
        await new Promise((resolve) => {
          let start = 0;
          let previous = 0;
          const frame = (now) => {
            if (!start) {
              start = now;
              previous = now;
            } else {
              samples.push(now - previous);
              previous = now;
            }
            if (now - start >= duration) resolve();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        const sorted = [...samples].sort((a, b) => a - b);
        const averageFrameMs = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
        const info = window.game.renderer.info.render;
        return {
          durationMs: samples.reduce((sum, value) => sum + value, 0),
          frames: samples.length,
          averageFrameMs,
          averageFps: 1000 / averageFrameMs,
          p95FrameMs: percentile(0.95),
          p99FrameMs: percentile(0.99),
          drawCalls: info.calls,
          triangles: info.triangles,
        };
      };
      const withCharacters = await sample(5000);
      const pedestrianUpdate = window.game.pedestrians.update;
      window.game.pedestrians.update = () => {};
      window.game.pedestrians.root.visible = false;
      window.game.guidedTour.root.visible = false;
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
      const withoutCharacters = await sample(3000);
      window.game.pedestrians.update = pedestrianUpdate;
      window.game.pedestrians.root.visible = true;
      window.game.guidedTour.root.visible = true;
      return {
        context: 'Headless Chromium with SwiftShader; reference measurement, not physical Chromebook hardware.',
        ...withCharacters,
        withoutCharacters,
        pedestrianCapObserved: window.game.pedestrians.count,
        pixelRatio: window.game.renderer.getPixelRatio(),
        qualityReduced: window.game.qualityReduced,
      };
    });
    assert(report.performance.pedestrianCapObserved <= 48,
      'pedestrian cap stays within the Chromebook budget', report.performance.pedestrianCapObserved);

    const openingUrl = new URL('?dev=1&target=1', `${base.replace(/\/$/, '')}/`).href;
    await page.goto(openingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.locator('#name-form').waitFor({ timeout: 10000 });
    await page.locator('#name-form').evaluate((form) => form.requestSubmit());
    await page.locator('#tour-subtitle:not(.hidden)').waitFor({ timeout: 45000 });
    const firstOpeningLine = await page.locator('#subtitle-text').textContent();
    await page.keyboard.press('Space');
    await page.waitForFunction(
      (previous) => {
        const subtitle = document.querySelector('#tour-subtitle');
        const text = document.querySelector('#subtitle-text')?.textContent;
        return subtitle && !subtitle.classList.contains('hidden') && text && text !== previous;
      },
      firstOpeningLine,
      { timeout: 10000 }
    );
    const openingBefore = await page.evaluate(() => {
      const local = window.game.openingScene.local;
      const head = local.userData.head;
      return {
        skinned: Boolean(local.userData.isCharacterModel),
        head: head?.name || null,
        headQuaternion: head?.quaternion.toArray() || null,
        bodyRotationY: local.rotation.y,
      };
    });
    await page.waitForTimeout(500);
    const openingAfter = await page.evaluate(() => {
      const local = window.game.openingScene.local;
      const head = local.userData.head;
      return {
        headQuaternion: head?.quaternion.toArray() || null,
        bodyRotationY: local.rotation.y,
        animation: local.userData.currentAnimation?.() || null,
      };
    });
    report.openingSpeech = {
      before: openingBefore,
      after: openingAfter,
      headQuaternionDelta: openingBefore.headQuaternion && openingAfter.headQuaternion
        ? Math.max(...openingBefore.headQuaternion.map(
          (value, index) => Math.abs(value - openingAfter.headQuaternion[index])
        ))
        : 0,
    };
    assert(openingBefore.skinned && openingBefore.head === 'head',
      'speaking opening town local is a model character with the named head node', openingBefore);
    assert(report.openingSpeech.headQuaternionDelta > 1e-4
      || Math.abs(openingAfter.bodyRotationY - openingBefore.bodyRotationY) > 1e-4,
      'town local speech drives head or body motion', report.openingSpeech);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${outputDir}/town-local-mid-speech.png` });
    report.evidence.push('town-local-mid-speech.png');
  } else {
    assert(report.startup.visibleSkinnedPedestrians === 0,
      'missing assets fall back to procedural ambient pedestrians', report.startup);
    assert(report.startup.skinnedTourists === 0,
      'missing assets fall back to procedural tourists', report.startup);
    assert(!report.startup.guide.skinned && !report.startup.townLocal.skinned,
      'missing assets fall back to the procedural world guide and town local', report.startup);
    assert(!report.startup.portraitGuide.skinned && report.startup.portraitGuide.hasMouth,
      'missing assets fall back to the procedural speaking portrait', report.startup.portraitGuide);
  }

  const browserErrors = consoleMessages.filter((message) => message.type === 'error');
  const expectedFallbackMessage = (entry) => {
    const text = `${entry.text || entry.error || ''} ${entry.url || ''}`;
    return isCharacterUrl(entry.url)
      || /Kenney assets unavailable|assets[\\/]characters[\\/]/i.test(text);
  };
  const unexpectedConsoleErrors = mode === 'fallback'
    ? browserErrors.filter((entry) => !expectedFallbackMessage(entry))
    : browserErrors;
  const relevantRequestFailures = failedRequests.filter((entry) => isCharacterUrl(entry.url));
  const relevantResponseFailures = failedResponses.filter((entry) => isCharacterUrl(entry.url));
  const fallbackWarning = consoleMessages.some((entry) =>
    /Kenney assets unavailable; using procedural people/i.test(entry.text)
  );
  report.browser = {
    consoleMessages,
    pageErrors,
    characterRequestFailures: relevantRequestFailures,
    characterResponseFailures: relevantResponseFailures,
    unexpectedConsoleErrors,
    fallbackWarning,
  };

  assert(pageErrors.length === 0, 'no uncaught page errors occur', pageErrors);
  assert(unexpectedConsoleErrors.length === 0, 'no unexpected console errors occur', unexpectedConsoleErrors);
  if (mode === 'normal') {
    assert(relevantRequestFailures.length === 0 && relevantResponseFailures.length === 0,
      'character and Draco assets load without network failures', {
        requests: relevantRequestFailures,
        responses: relevantResponseFailures,
      });
  } else {
    assert(fallbackWarning, 'loader reports the intentional procedural fallback');
  }
} catch (error) {
  report.fatalError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  failures.push('capture script completed without a fatal error');
} finally {
  report.failures = failures;
  report.pass = failures.length === 0;
  const reportPath = `${outputDir}/${mode === 'normal' ? 'character-verification' : 'fallback-verification'}.json`;
  try {
    await browser.close();
  } finally {
    await closeServer(staticServer);
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (failures.length) process.exitCode = 1;

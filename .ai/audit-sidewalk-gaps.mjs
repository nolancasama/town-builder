// Audits the committed pavement data against the live rendered game.
import { chromium } from 'playwright';
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../src/config/town.js';
import { KERB_POLYGONS, SIDEWALK_SOURCE_HASH, WALK_POLYGONS } from '../src/config/sidewalks.js';

const SIDEWALK_BY_CLASS = { main: 2.6, minor: 2.2, lane: 1.6 };
const EXPECTED_CORNER_COUNT = 82;

function sourceHash() {
  const source = JSON.stringify({ ROAD_SEGMENTS, ROAD_WIDTH });
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < source.length; i++) {
    hash ^= BigInt(source.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function clipHalfPlane(polygon, coordinate, boundary, keepGreater) {
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentDelta = coordinate(current) - boundary;
    const nextDelta = coordinate(next) - boundary;
    const currentInside = keepGreater ? currentDelta >= 0 : currentDelta <= 0;
    const nextInside = keepGreater ? nextDelta >= 0 : nextDelta <= 0;
    if (currentInside) output.push(current);
    if (currentInside !== nextInside) {
      const t = currentDelta / (currentDelta - nextDelta);
      output.push([
        current[0] + (next[0] - current[0]) * t,
        current[1] + (next[1] - current[1]) * t,
      ]);
    }
  }
  return output;
}

function polygonArea(polygon) {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twiceArea += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(twiceArea) / 2;
}

function carriagewayIntrusions() {
  const tolerance = 0.002;
  const intrusions = [];
  const layers = [['sidewalk', WALK_POLYGONS], ['kerb', KERB_POLYGONS]];
  for (const [kind, polygons] of layers) {
    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
      const polygon = polygons[polygonIndex];
      for (let edgeId = 0; edgeId < ROAD_SEGMENTS.length; edgeId++) {
        const road = ROAD_SEGMENTS[edgeId];
        const dx = road.b[0] - road.a[0];
        const dz = road.b[1] - road.a[1];
        const length = Math.hypot(dx, dz);
        const dirX = dx / length;
        const dirZ = dz / length;
        const rightX = -dirZ;
        const rightZ = dirX;
        const radius = (ROAD_WIDTH[road.w] || ROAD_WIDTH.minor) / 2;
        let local = polygon.map(([x, z]) => {
          const relX = x - road.a[0];
          const relZ = z - road.a[1];
          return [relX * dirX + relZ * dirZ, relX * rightX + relZ * rightZ];
        });
        local = clipHalfPlane(local, (point) => point[0], -radius + tolerance, true);
        if (local.length) local = clipHalfPlane(local, (point) => point[0], length + radius - tolerance, false);
        if (local.length) local = clipHalfPlane(local, (point) => point[1], -radius + tolerance, true);
        if (local.length) local = clipHalfPlane(local, (point) => point[1], radius - tolerance, false);
        if (local.length >= 3 && polygonArea(local) > 1e-6) {
          intrusions.push({ kind, polygonIndex, edgeId });
          if (intrusions.length >= 20) return intrusions;
        }
      }
    }
  }
  return intrusions;
}

const currentHash = sourceHash();
const hashStalenessCount = Number(currentHash !== SIDEWALK_SOURCE_HASH);
const intrusions = carriagewayIntrusions();

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));

await page.goto('http://127.0.0.1:4177/?dev=1&skipIntro=1', { waitUntil: 'domcontentloaded' });
await page.locator('#name-form button').click();
await page.locator('#choice-panel:not(.hidden)').waitFor({ timeout: 30000 });

const liveReport = await page.evaluate(({ sidewalkByClass }) => {
  const graph = window.game.world.graph;
  const sidewalkMesh = window.game.scene.getObjectByName('sidewalks');
  const kerbMesh = window.game.scene.getObjectByName('kerbs');
  if (!sidewalkMesh) throw new Error('Merged sidewalks mesh was not found');
  if (!kerbMesh) throw new Error('Merged kerbs mesh was not found');

  const position = sidewalkMesh.geometry.getAttribute('position');
  const index = sidewalkMesh.geometry.index;
  const triangles = [];
  const bins = new Map();
  const BIN_SIZE = 2;
  const vertexIndex = (i) => index ? index.getX(i) : i;
  const triangleCount = (index ? index.count : position.count) / 3;
  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex++) {
    const ia = vertexIndex(triangleIndex * 3);
    const ib = vertexIndex(triangleIndex * 3 + 1);
    const ic = vertexIndex(triangleIndex * 3 + 2);
    const ay = position.getY(ia);
    const by = position.getY(ib);
    const cy = position.getY(ic);
    if (Math.min(ay, by, cy) < 0.275 || Math.max(ay, by, cy) > 0.285) continue;
    const triangle = {
      ax: position.getX(ia), az: position.getZ(ia),
      bx: position.getX(ib), bz: position.getZ(ib),
      cx: position.getX(ic), cz: position.getZ(ic),
    };
    const twiceArea = (triangle.bx - triangle.ax) * (triangle.cz - triangle.az)
      - (triangle.bz - triangle.az) * (triangle.cx - triangle.ax);
    if (Math.abs(twiceArea) < 1e-7) continue;
    Object.assign(triangle, {
      minX: Math.min(triangle.ax, triangle.bx, triangle.cx),
      maxX: Math.max(triangle.ax, triangle.bx, triangle.cx),
      minZ: Math.min(triangle.az, triangle.bz, triangle.cz),
      maxZ: Math.max(triangle.az, triangle.bz, triangle.cz),
    });
    const storedIndex = triangles.length;
    triangles.push(triangle);
    for (let cellX = Math.floor(triangle.minX / BIN_SIZE); cellX <= Math.floor(triangle.maxX / BIN_SIZE); cellX++) {
      for (let cellZ = Math.floor(triangle.minZ / BIN_SIZE); cellZ <= Math.floor(triangle.maxZ / BIN_SIZE); cellZ++) {
        const key = `${cellX}:${cellZ}`;
        if (!bins.has(key)) bins.set(key, []);
        bins.get(key).push(storedIndex);
      }
    }
  }

  const isPaved = (x, z) => {
    const candidates = bins.get(`${Math.floor(x / BIN_SIZE)}:${Math.floor(z / BIN_SIZE)}`) || [];
    for (const triangleIndex of candidates) {
      const triangle = triangles[triangleIndex];
      const denominator = (triangle.bz - triangle.cz) * (triangle.ax - triangle.cx)
        + (triangle.cx - triangle.bx) * (triangle.az - triangle.cz);
      const a = ((triangle.bz - triangle.cz) * (x - triangle.cx)
        + (triangle.cx - triangle.bx) * (z - triangle.cz)) / denominator;
      const b = ((triangle.cz - triangle.az) * (x - triangle.cx)
        + (triangle.ax - triangle.cx) * (z - triangle.cz)) / denominator;
      const c = 1 - a - b;
      if (a >= -1e-5 && b >= -1e-5 && c >= -1e-5) return true;
    }
    return false;
  };

  const positiveAngle = (angle) => {
    while (angle < 0) angle += Math.PI * 2;
    while (angle >= Math.PI * 2) angle -= Math.PI * 2;
    return angle;
  };
  const lineIntersection = (pointA, dirA, pointB, dirB) => {
    const denominator = dirA.x * dirB.z - dirA.z * dirB.x;
    if (Math.abs(denominator) < 1e-6) return null;
    const rx = pointB.x - pointA.x;
    const rz = pointB.z - pointA.z;
    const t = (rx * dirB.z - rz * dirB.x) / denominator;
    return { x: pointA.x + dirA.x * t, z: pointA.z + dirA.z * t };
  };

  const connectedOnPavement = (start, end, options) => {
    const STEP = 0.16;
    const minX = options.cx - options.radius;
    const minZ = options.cz - options.radius;
    const width = Math.ceil(options.radius * 2 / STEP) + 1;
    const paved = new Uint8Array(width * width);
    for (let iz = 0; iz < width; iz++) {
      for (let ix = 0; ix < width; ix++) {
        const x = minX + ix * STEP;
        const z = minZ + iz * STEP;
        if (options.sector) {
          const delta = positiveAngle(Math.atan2(z - options.cz, x - options.cx) - options.sector.start);
          if (delta > options.sector.sweep + 0.12) continue;
        }
        if (isPaved(x, z)) paved[iz * width + ix] = 1;
      }
    }
    const nearestPaved = (point) => {
      const centreX = Math.round((point.x - minX) / STEP);
      const centreZ = Math.round((point.z - minZ) / STEP);
      for (let ring = 0; ring <= 6; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const x = centreX + dx;
            const z = centreZ + dz;
            if (x >= 0 && x < width && z >= 0 && z < width && paved[z * width + x]) return z * width + x;
          }
        }
      }
      return -1;
    };
    const startIndex = nearestPaved(start);
    const endIndex = nearestPaved(end);
    if (startIndex < 0 || endIndex < 0) return false;
    const visited = new Uint8Array(paved.length);
    const queue = new Int32Array(paved.length);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIndex;
    visited[startIndex] = 1;
    while (head < tail) {
      const current = queue[head++];
      if (current === endIndex) return true;
      const x = current % width;
      const z = Math.floor(current / width);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dz) || x + dx < 0 || x + dx >= width || z + dz < 0 || z + dz >= width) continue;
          const next = (z + dz) * width + x + dx;
          if (paved[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }
    return false;
  };

  const unpavedCorners = [];
  let cornerCount = 0;
  for (const node of graph.nodes) {
    const incidents = node.edges.map((edge) => {
      const away = edge.a === node ? 1 : -1;
      const dir = { x: edge.dir.x * away, z: edge.dir.y * away };
      return {
        edge,
        dir,
        normal: { x: -dir.z, z: dir.x },
        angle: Math.atan2(dir.z, dir.x),
      };
    }).sort((a, b) => a.angle - b.angle);
    const maxSidewalkWidth = Math.max(...incidents.map(({ edge }) => sidewalkByClass[edge.cls] || sidewalkByClass.minor));
    for (let i = 0; i < incidents.length; i++) {
      cornerCount++;
      const from = incidents[i];
      const to = incidents[(i + 1) % incidents.length];
      const fromInner = from.edge.width / 2;
      const toInner = to.edge.width / 2;
      const fromMid = fromInner + (sidewalkByClass[from.edge.cls] || sidewalkByClass.minor) / 2;
      const toMid = toInner + (sidewalkByClass[to.edge.cls] || sidewalkByClass.minor) / 2;
      let start;
      let end;
      if (incidents.length === 1) {
        const along = fromInner + 0.25;
        start = {
          x: node.pos.x + from.dir.x * along + from.normal.x * fromMid,
          z: node.pos.y + from.dir.z * along + from.normal.z * fromMid,
        };
        end = {
          x: node.pos.x + from.dir.x * along - from.normal.x * fromMid,
          z: node.pos.y + from.dir.z * along - from.normal.z * fromMid,
        };
      } else {
        const fromLine = { x: node.pos.x + from.normal.x * fromMid, z: node.pos.y + from.normal.z * fromMid };
        const toKerb = { x: node.pos.x - to.normal.x * toInner, z: node.pos.y - to.normal.z * toInner };
        const toLine = { x: node.pos.x - to.normal.x * toMid, z: node.pos.y - to.normal.z * toMid };
        const fromKerb = { x: node.pos.x + from.normal.x * fromInner, z: node.pos.y + from.normal.z * fromInner };
        start = lineIntersection(fromLine, from.dir, toKerb, to.dir);
        end = lineIntersection(toLine, to.dir, fromKerb, from.dir);
        if (!start || !end) {
          const along = Math.max(from.edge.width, to.edge.width) / 2 + maxSidewalkWidth + 0.25;
          start = { x: fromLine.x + from.dir.x * along, z: fromLine.z + from.dir.z * along };
          end = { x: toLine.x + to.dir.x * along, z: toLine.z + to.dir.z * along };
        } else {
          // Step a full sidewalk width past the neighbouring kerb line, not a
          // token 0.2. These points sit exactly on the line the bake clips
          // against, so a short nudge leaves them inside the cut and the corner
          // reads as unpaved when it is in fact continuous.
          const fromStep = sidewalkByClass[from.edge.cls] || sidewalkByClass.minor;
          const toStep = sidewalkByClass[to.edge.cls] || sidewalkByClass.minor;
          start.x += from.dir.x * fromStep;
          start.z += from.dir.z * fromStep;
          end.x += to.dir.x * toStep;
          end.z += to.dir.z * toStep;
          // Where two roads run nearly straight through a node, their kerb
          // lines are near-parallel and intersect far down the street, putting
          // these samples tens of units apart. That span is a straight run, not
          // a corner, so keep the probe local to the junction.
          const reach = Math.max(from.edge.width, to.edge.width) / 2 + maxSidewalkWidth + 2;
          const fromBase = { x: node.pos.x + from.normal.x * fromMid, z: node.pos.y + from.normal.z * fromMid };
          const toBase = { x: node.pos.x - to.normal.x * toMid, z: node.pos.y - to.normal.z * toMid };
          const clampT = (t) => Math.min(Math.max(t, 0), reach);
          const tf = clampT((start.x - fromBase.x) * from.dir.x + (start.z - fromBase.z) * from.dir.z);
          const tt = clampT((end.x - toBase.x) * to.dir.x + (end.z - toBase.z) * to.dir.z);
          start = { x: fromBase.x + from.dir.x * tf, z: fromBase.z + from.dir.z * tf };
          end = { x: toBase.x + to.dir.x * tt, z: toBase.z + to.dir.z * tt };
        }
      }
      const maxDistance = Math.max(
        Math.hypot(start.x - node.pos.x, start.z - node.pos.y),
        Math.hypot(end.x - node.pos.x, end.z - node.pos.y)
      );
      const options = { cx: node.pos.x, cz: node.pos.y, radius: maxDistance + maxSidewalkWidth + 2 };
      if (incidents.length > 1) {
        const startAngle = Math.atan2(start.z - node.pos.y, start.x - node.pos.x);
        const endAngle = Math.atan2(end.z - node.pos.y, end.x - node.pos.x);
        options.sector = { start: startAngle, sweep: positiveAngle(endAngle - startAngle) };
      }
      if (!connectedOnPavement(start, end, options)) {
        unpavedCorners.push({
          nodeId: node.id,
          fromEdge: from.edge.id,
          toEdge: to.edge.id,
          start: [Number(start.x.toFixed(2)), Number(start.z.toFixed(2))],
          end: [Number(end.x.toFixed(2)), Number(end.z.toFixed(2))],
        });
      }
    }
  }

  return {
    edges: graph.edges.length,
    nodes: graph.nodes.length,
    cornerCount,
    pavedCorners: cornerCount - unpavedCorners.length,
    unpavedCornerCount: unpavedCorners.length,
    unpavedCorners,
    runtimeHashStalenessCount: Number(Boolean(window.game.scene.userData.sidewalkBake?.stale)),
    sidewalkTriangleCount: triangles.length,
  };
}, { sidewalkByClass: SIDEWALK_BY_CLASS });

const report = {
  ...liveReport,
  walkPolygonCount: WALK_POLYGONS.length,
  kerbPolygonCount: KERB_POLYGONS.length,
  carriagewayIntrusionCount: intrusions.length,
  carriagewayIntrusions: intrusions,
  hashStalenessCount: hashStalenessCount + liveReport.runtimeHashStalenessCount,
  ...(hashStalenessCount ? { bakedHash: SIDEWALK_SOURCE_HASH, currentHash } : {}),
};
console.log(JSON.stringify(report, null, 2));

await page.evaluate(() => {
  for (const child of document.body.children) if (child.id !== 'scene') child.style.visibility = 'hidden';
  const game = window.game;
  game.rig.beginCinematic();
  game.camera.position.set(0, 360, 0.1);
  game.rig.lookAtVector.set(0, 0, 0);
});
await page.waitForTimeout(600);
await page.screenshot({ path: 'qa-evidence/sidewalk-baked-topdown.png' });

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();

if (
  report.cornerCount !== EXPECTED_CORNER_COUNT
  || report.unpavedCornerCount
  || report.carriagewayIntrusionCount
  || report.hashStalenessCount
  || errors.length
) {
  process.exitCode = 1;
}

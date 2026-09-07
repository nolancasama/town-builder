import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../src/config/town.js';

const SIDEWALK_BY_CLASS = { main: 2.6, minor: 2.2, lane: 1.6 };
const KERB_WIDTH = 0.32;
const EPS = 1e-8;
const GRAPH_EPS = 0.75;

const add = (a, b) => ({ x: a.x + b.x, z: a.z + b.z });
const sub = (a, b) => ({ x: a.x - b.x, z: a.z - b.z });
const scale = (v, amount) => ({ x: v.x * amount, z: v.z * amount });
const cross = (a, b) => a.x * b.z - a.z * b.x;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const offsetPoint = (node, normal, amount) => add(node, scale(normal, amount));

function sourceHash() {
  const source = JSON.stringify({ ROAD_SEGMENTS, ROAD_WIDTH });
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < source.length; i++) {
    hash ^= BigInt(source.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function graphKey(x, z) {
  return `${Math.round(x / GRAPH_EPS)}:${Math.round(z / GRAPH_EPS)}`;
}

function buildGraph() {
  const nodes = [];
  const nodeIndex = new Map();
  const nodeAt = (x, z) => {
    const key = graphKey(x, z);
    if (nodeIndex.has(key)) return nodeIndex.get(key);
    const node = { id: nodes.length, pos: { x, z }, edges: [] };
    nodes.push(node);
    nodeIndex.set(key, node);
    return node;
  };
  const edges = ROAD_SEGMENTS.map((segment, id) => {
    const a = nodeAt(segment.a[0], segment.a[1]);
    const b = nodeAt(segment.b[0], segment.b[1]);
    const delta = sub(b.pos, a.pos);
    const length = Math.hypot(delta.x, delta.z);
    const dir = scale(delta, 1 / length);
    const edge = {
      id,
      a,
      b,
      dir,
      right: { x: -dir.z, z: dir.x },
      length,
      width: ROAD_WIDTH[segment.w] || ROAD_WIDTH.minor,
      cls: segment.w,
    };
    a.edges.push(edge);
    b.edges.push(edge);
    return edge;
  });
  return { nodes, edges };
}

function lineIntersection(pointA, dirA, pointB, dirB) {
  const denominator = cross(dirA, dirB);
  if (Math.abs(denominator) < EPS) return null;
  return add(pointA, scale(dirA, cross(sub(pointB, pointA), dirB) / denominator));
}

function signedArea(polygon) {
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += cross(a, b);
  }
  return area / 2;
}

function cleanPolygon(polygon) {
  const points = [];
  for (const point of polygon) {
    if (!points.length || distance(points.at(-1), point) > EPS) points.push(point);
  }
  if (points.length > 1 && distance(points[0], points.at(-1)) <= EPS) points.pop();
  let changed = true;
  while (changed && points.length >= 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) {
      const previous = points[(i + points.length - 1) % points.length];
      const current = points[i];
      const next = points[(i + 1) % points.length];
      if (Math.abs(cross(sub(current, previous), sub(next, current))) <= EPS) {
        points.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (points.length < 3 || Math.abs(signedArea(points)) < 1e-7) return [];
  if (signedArea(points) < 0) points.reverse();
  return points;
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point.x}:${point.z}`, point])).values()]
    .sort((a, b) => a.x - b.x || a.z - b.z);
  if (unique.length < 3) return [];
  const half = [];
  for (const point of unique) {
    while (half.length >= 2 && cross(sub(half.at(-1), half.at(-2)), sub(point, half.at(-1))) <= EPS) half.pop();
    half.push(point);
  }
  const lowerLength = half.length;
  for (let i = unique.length - 2; i >= 0; i--) {
    const point = unique[i];
    while (half.length > lowerLength && cross(sub(half.at(-1), half.at(-2)), sub(point, half.at(-1))) <= EPS) half.pop();
    half.push(point);
  }
  half.pop();
  return cleanPolygon(half);
}

function splitByLine(polygon, a, b) {
  const inside = [];
  const outside = [];
  for (let i = 0; i < polygon.length; i++) {
    const current = polygon[i];
    const next = polygon[(i + 1) % polygon.length];
    const currentSide = cross(sub(b, a), sub(current, a));
    const nextSide = cross(sub(b, a), sub(next, a));
    if (currentSide >= -EPS) inside.push(current);
    if (currentSide <= EPS) outside.push(current);
    if ((currentSide > EPS && nextSide < -EPS) || (currentSide < -EPS && nextSide > EPS)) {
      const hit = add(current, scale(sub(next, current), currentSide / (currentSide - nextSide)));
      inside.push(hit);
      outside.push(hit);
    }
  }
  return { inside: cleanPolygon(inside), outside: cleanPolygon(outside) };
}

/** Difference of a convex subject and a convex, counter-clockwise cutter. */
function subtractConvex(subject, cutter) {
  let remaining = [subject];
  const outsidePieces = [];
  for (let i = 0; i < cutter.length && remaining.length; i++) {
    const nextRemaining = [];
    const a = cutter[i];
    const b = cutter[(i + 1) % cutter.length];
    for (const polygon of remaining) {
      const split = splitByLine(polygon, a, b);
      if (split.outside.length) outsidePieces.push(split.outside);
      if (split.inside.length) nextRemaining.push(split.inside);
    }
    remaining = nextRemaining;
  }
  return outsidePieces;
}

function intersectConvex(subject, cutter) {
  let intersection = subject;
  for (let i = 0; i < cutter.length && intersection.length; i++) {
    intersection = splitByLine(intersection, cutter[i], cutter[(i + 1) % cutter.length]).inside;
  }
  return intersection;
}

function addWithoutOverlap(union, seed) {
  let fragments = [seed];
  for (const existing of union) {
    fragments = fragments.flatMap((fragment) => subtractConvex(fragment, existing));
    if (!fragments.length) break;
  }
  union.push(...fragments);
}

function carriagewayCutter(edge, clearance = 0.002) {
  const r = edge.width / 2;
  const outer = r + clearance;
  const start = add(edge.a.pos, scale(edge.dir, -outer));
  const end = add(edge.a.pos, scale(edge.dir, edge.length + outer));
  return cleanPolygon([
    add(start, scale(edge.right, -outer)),
    add(end, scale(edge.right, -outer)),
    add(end, scale(edge.right, outer)),
    add(start, scale(edge.right, outer)),
  ]);
}

function profileAtNode(incident, side, inner, outer) {
  const normal = scale(incident.normal, side);
  return {
    inner: offsetPoint(incident.node.pos, normal, inner),
    outer: offsetPoint(incident.node.pos, normal, outer),
  };
}

function buildSeeds(graph, widthFor) {
  const seeds = [];
  const profiles = new Map();
  const profileKey = (incident, side) => `${incident.node.id}:${incident.edge.id}:${side}`;

  for (const node of graph.nodes) {
    const incidents = node.edges.map((edge) => {
      const away = edge.a === node ? 1 : -1;
      const dir = scale(edge.dir, away);
      return {
        node,
        edge,
        away,
        dir,
        normal: { x: -dir.z, z: dir.x },
        angle: Math.atan2(dir.z, dir.x),
      };
    }).sort((a, b) => a.angle - b.angle);

    if (incidents.length === 1) {
      const incident = incidents[0];
      const inner = incident.edge.width / 2;
      const outer = inner + widthFor(incident.edge);
      const backInner = add(node.pos, scale(incident.dir, -inner));
      const backOuter = add(node.pos, scale(incident.dir, -outer));
      profiles.set(profileKey(incident, 1), {
        inner: add(backInner, scale(incident.normal, inner)),
        outer: add(backInner, scale(incident.normal, outer)),
      });
      profiles.set(profileKey(incident, -1), {
        inner: add(backInner, scale(incident.normal, -inner)),
        outer: add(backInner, scale(incident.normal, -outer)),
      });
      seeds.push(convexHull([
        add(backOuter, scale(incident.normal, inner)),
        add(backInner, scale(incident.normal, inner)),
        add(backInner, scale(incident.normal, outer)),
        add(backOuter, scale(incident.normal, outer)),
      ]));
      seeds.push(convexHull([
        add(backOuter, scale(incident.normal, -outer)),
        add(backInner, scale(incident.normal, -outer)),
        add(backInner, scale(incident.normal, -inner)),
        add(backOuter, scale(incident.normal, -inner)),
      ]));
      seeds.push(convexHull([
        add(backOuter, scale(incident.normal, -outer)),
        add(backInner, scale(incident.normal, -outer)),
        add(backInner, scale(incident.normal, outer)),
        add(backOuter, scale(incident.normal, outer)),
      ]));
      continue;
    }

    for (let i = 0; i < incidents.length; i++) {
      const from = incidents[i];
      const to = incidents[(i + 1) % incidents.length];
      const fromInner = from.edge.width / 2;
      const toInner = to.edge.width / 2;
      const fromWidth = widthFor(from.edge);
      const toWidth = widthFor(to.edge);
      const fromOuter = fromInner + fromWidth;
      const toOuter = toInner + toWidth;
      const denominator = cross(from.dir, to.dir);

      if (Math.abs(denominator) < 1e-6) {
        const fromProfile = profileAtNode(from, 1, fromInner, fromOuter);
        const toProfile = profileAtNode(to, -1, toInner, toOuter);
        profiles.set(profileKey(from, 1), fromProfile);
        profiles.set(profileKey(to, -1), toProfile);
        if (Math.abs(fromInner - toInner) < EPS && Math.abs(fromOuter - toOuter) < EPS) continue;
        const reach = Math.max(from.edge.width, to.edge.width) / 2 + Math.max(fromWidth, toWidth);
        const transition = convexHull([
          fromProfile.inner,
          fromProfile.outer,
          toProfile.inner,
          toProfile.outer,
          add(fromProfile.inner, scale(from.dir, reach)),
          add(fromProfile.outer, scale(from.dir, reach)),
          add(toProfile.inner, scale(to.dir, reach)),
          add(toProfile.outer, scale(to.dir, reach)),
        ]);
        if (transition.length) seeds.push(transition);
        continue;
      }

      const fromInnerLine = offsetPoint(node.pos, from.normal, fromInner);
      const fromOuterLine = offsetPoint(node.pos, from.normal, fromOuter);
      const toInnerLine = offsetPoint(node.pos, to.normal, -toInner);
      const toOuterLine = offsetPoint(node.pos, to.normal, -toOuter);
      const innerMiter = lineIntersection(fromInnerLine, from.dir, toInnerLine, to.dir);
      const fromOuterEnd = lineIntersection(fromOuterLine, from.dir, toInnerLine, to.dir);
      const toOuterEnd = lineIntersection(fromInnerLine, from.dir, toOuterLine, to.dir);
      const outerMiter = lineIntersection(fromOuterLine, from.dir, toOuterLine, to.dir);
      profiles.set(profileKey(from, 1), { inner: innerMiter, outer: fromOuterEnd });
      profiles.set(profileKey(to, -1), { inner: innerMiter, outer: toOuterEnd });

      const corner = [innerMiter, fromOuterEnd];
      const limit = 3 * Math.max(fromWidth, toWidth);
      if (distance(innerMiter, outerMiter) > limit) {
        const advance = (start, end) => {
          const length = distance(start, end);
          return length > limit ? add(start, scale(sub(end, start), limit / length)) : end;
        };
        corner.push(advance(fromOuterEnd, outerMiter), advance(toOuterEnd, outerMiter));
      } else {
        corner.push(outerMiter);
      }
      corner.push(toOuterEnd);
      const cornerSeed = convexHull(corner);
      if (cornerSeed.length) seeds.push(cornerSeed);
    }
  }

  for (const edge of graph.edges) {
    const aIncident = { node: edge.a, edge };
    const bIncident = { node: edge.b, edge };
    for (const side of [-1, 1]) {
      const aProfile = profiles.get(profileKey(aIncident, side));
      const bProfile = profiles.get(profileKey(bIncident, -side));
      if (!aProfile || !bProfile) throw new Error(`Missing terminal profile for edge ${edge.id}, side ${side}`);
      const strip = convexHull([aProfile.inner, aProfile.outer, bProfile.inner, bProfile.outer]);
      if (strip.length) seeds.push(strip);
    }
  }
  return seeds.filter((polygon) => polygon.length);
}

function bakeLayer(graph, widthFor) {
  const union = [];
  const seeds = buildSeeds(graph, widthFor);
  for (const seed of seeds) addWithoutOverlap(union, seed);
  let polygons = union;
  for (const cutter of graph.edges.map((edge) => carriagewayCutter(edge))) {
    polygons = polygons.flatMap((polygon) => subtractConvex(polygon, cutter));
  }
  return polygons.map(cleanPolygon).filter((polygon) => polygon.length);
}

/**
 * splitSharedEdges inserts T-junction vertices after the polygons were last
 * cleaned, which can leave exact duplicate neighbours and slivers that round to
 * zero area. Those trianglulate into degenerate faces, so drop them here -
 * without touching the genuine inserted vertices that keep edges crack-free.
 */
function sanitize(polygons) {
  const out = [];
  for (const polygon of polygons) {
    const points = [];
    for (const point of polygon) {
      const last = points[points.length - 1];
      if (!last || Math.abs(last.x - point.x) > 1e-9 || Math.abs(last.z - point.z) > 1e-9) points.push(point);
    }
    while (points.length > 1) {
      const first = points[0];
      const last = points[points.length - 1];
      if (Math.abs(first.x - last.x) > 1e-9 || Math.abs(first.z - last.z) > 1e-9) break;
      points.pop();
    }
    if (points.length < 3) continue;
    if (Math.abs(signedArea(points)) < 1e-6) continue;
    out.push(points);
  }
  return out;
}

function roundCoordinate(value) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundPolygons(polygons) {
  return polygons.map((polygon) => cleanPolygon(polygon.map((point) => ({
    x: roundCoordinate(point.x),
    z: roundCoordinate(point.z),
  })))).filter((polygon) => polygon.length);
}

function splitSharedEdges(polygons) {
  const vertices = polygons.flat();
  return polygons.map((polygon) => {
    const split = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const edge = sub(b, a);
      const lengthSquared = edge.x * edge.x + edge.z * edge.z;
      const points = vertices.filter((point) => {
        if (Math.abs(cross(edge, sub(point, a))) > 1e-6) return false;
        const t = ((point.x - a.x) * edge.x + (point.z - a.z) * edge.z) / lengthSquared;
        return t > EPS && t < 1 - EPS;
      }).map((point) => ({
        point,
        t: ((point.x - a.x) * edge.x + (point.z - a.z) * edge.z) / lengthSquared,
      })).sort((left, right) => left.t - right.t);
      split.push(a, ...points.map(({ point }) => point));
    }
    return split;
  });
}

function pointKey(point) {
  return `${point.x},${point.z}`;
}

function edgeKey(a, b) {
  const aKey = pointKey(a);
  const bKey = pointKey(b);
  return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
}

function mergeConvexNeighbours(input) {
  let polygons = input;
  for (;;) {
    polygons = splitSharedEdges(polygons);
    const owners = new Map();
    for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
      const polygon = polygons[polygonIndex];
      for (let i = 0; i < polygon.length; i++) {
        const key = edgeKey(polygon[i], polygon[(i + 1) % polygon.length]);
        if (!owners.has(key)) owners.set(key, []);
        owners.get(key).push(polygonIndex);
      }
    }
    const used = new Set();
    const merged = [];
    for (const pair of owners.values()) {
      if (pair.length !== 2 || used.has(pair[0]) || used.has(pair[1])) continue;
      const left = polygons[pair[0]];
      const right = polygons[pair[1]];
      const hull = convexHull([...left, ...right]);
      const sourceArea = Math.abs(signedArea(left)) + Math.abs(signedArea(right));
      const hullArea = Math.abs(signedArea(hull));
      if (Math.abs(sourceArea - hullArea) > Math.max(1e-5, sourceArea * 1e-7)) continue;
      used.add(pair[0]);
      used.add(pair[1]);
      merged.push(hull);
    }
    if (!merged.length) return polygons;
    polygons = polygons.filter((_, index) => !used.has(index)).concat(merged);
  }
}

function formatPolygon(polygon) {
  return `[${polygon.map((point) => `[${point.x},${point.z}]`).join(',')}]`;
}

function formatData(hash, walks, kerbs) {
  const array = (name, polygons) => `export const ${name} = [\n${polygons.map((polygon) => `  ${formatPolygon(polygon)},`).join('\n')}\n];`;
  return `export const SIDEWALK_SOURCE_HASH = '${hash}';\n\n${array('WALK_POLYGONS', walks)}\n\n${array('KERB_POLYGONS', kerbs)}\n`;
}

function assertClearOfCarriageways(name, polygons, cutters) {
  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex++) {
    for (let edgeId = 0; edgeId < cutters.length; edgeId++) {
      const overlap = intersectConvex(polygons[polygonIndex], cutters[edgeId]);
      if (overlap.length && Math.abs(signedArea(overlap)) > 1e-7) {
        throw new Error(`${name} polygon ${polygonIndex} intrudes into carriageway ${edgeId}`);
      }
    }
  }
}

const graph = buildGraph();
const walks = sanitize(splitSharedEdges(mergeConvexNeighbours(roundPolygons(bakeLayer(
  graph,
  (edge) => SIDEWALK_BY_CLASS[edge.cls] || SIDEWALK_BY_CLASS.minor
)))));
const kerbs = sanitize(splitSharedEdges(mergeConvexNeighbours(roundPolygons(bakeLayer(graph, () => KERB_WIDTH)))));
const cutters = graph.edges.map((edge) => carriagewayCutter(edge, 0));
assertClearOfCarriageways('Sidewalk', walks, cutters);
assertClearOfCarriageways('Kerb', kerbs, cutters);
const outputPath = fileURLToPath(new URL('../src/config/sidewalks.js', import.meta.url));
await writeFile(outputPath, formatData(sourceHash(), walks, kerbs));
const topTriangles = [...walks, ...kerbs].reduce((sum, polygon) => sum + polygon.length - 2, 0);
console.log(
  `Baked ${walks.length} sidewalk polygons and ${kerbs.length} kerb polygons `
  + `(${topTriangles} top triangles) to src/config/sidewalks.js`
);

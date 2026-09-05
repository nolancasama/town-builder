/*
 * Round 7 physical layout audit.
 *
 * Unlike the Round 6 audit, this handles diagonal road segments as oriented
 * rectangles. It measures both the asphalt and the roadside sidewalk geometry
 * authored by createRoads(), then reports complete distributions rather than
 * only the smallest value.
 */
import { LANDMARK_LOTS, ROAD_SEGMENTS, ROAD_WIDTH, WORLD } from '../src/config/town.js';
import { buildRoadGraph } from '../src/world/graph.js';
import { SIDEWALK_BY_CLASS } from '../src/world/roads.js';

const EPSILON = 1e-7;
const graph = buildRoadGraph();

function lotPolygon(lot) {
  const [width, depth] = lot.size;
  const cos = Math.cos(lot.rot || 0);
  const sin = Math.sin(lot.rot || 0);
  return [
    [-width / 2, -depth / 2],
    [width / 2, -depth / 2],
    [width / 2, depth / 2],
    [-width / 2, depth / 2],
  ].map(([x, z]) => ({
    x: lot.pos[0] + x * cos + z * sin,
    z: lot.pos[1] - x * sin + z * cos,
  }));
}

function orientedRectangle(cx, cz, alongX, alongZ, rightX, rightZ, length, width) {
  const halfLength = length / 2;
  const halfWidth = width / 2;
  return [
    { x: cx - alongX * halfLength - rightX * halfWidth, z: cz - alongZ * halfLength - rightZ * halfWidth },
    { x: cx + alongX * halfLength - rightX * halfWidth, z: cz + alongZ * halfLength - rightZ * halfWidth },
    { x: cx + alongX * halfLength + rightX * halfWidth, z: cz + alongZ * halfLength + rightZ * halfWidth },
    { x: cx - alongX * halfLength + rightX * halfWidth, z: cz - alongZ * halfLength + rightZ * halfWidth },
  ];
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment(a, b, p) {
  return Math.abs(cross(a, b, p)) <= EPSILON
    && p.x >= Math.min(a.x, b.x) - EPSILON
    && p.x <= Math.max(a.x, b.x) + EPSILON
    && p.z >= Math.min(a.z, b.z) - EPSILON
    && p.z <= Math.max(a.z, b.z) + EPSILON;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
    && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (onSegment(a, b, point)) return true;
    const crosses = (a.z > point.z) !== (b.z > point.z)
      && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointPolygonDistance(point, polygon) {
  if (pointInPolygon(point, polygon)) return 0;
  let best = Infinity;
  for (let i = 0; i < polygon.length; i += 1) {
    best = Math.min(best, pointSegmentDistance(point, polygon[i], polygon[(i + 1) % polygon.length]));
  }
  return best;
}

function polygonDistance(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return 0;
    }
  }
  if (pointInPolygon(a[0], b) || pointInPolygon(b[0], a)) return 0;
  let best = Infinity;
  for (const point of a) best = Math.min(best, pointPolygonDistance(point, b));
  for (const point of b) best = Math.min(best, pointPolygonDistance(point, a));
  return best;
}

function polygonCircleDistance(polygon, circle) {
  return Math.max(0, pointPolygonDistance(circle, polygon) - circle.radius);
}

function surfaceDistance(polygon, surface) {
  return surface.kind === 'circle'
    ? polygonCircleDistance(polygon, surface)
    : polygonDistance(polygon, surface.polygon);
}

function roadSurfaces() {
  const asphalt = [];
  const sidewalks = [];
  for (const edge of graph.edges) {
    const cx = (edge.a.pos.x + edge.b.pos.x) / 2;
    const cz = (edge.a.pos.y + edge.b.pos.y) / 2;
    const rightX = edge.right.x;
    const rightZ = edge.right.y;
    asphalt.push({
      id: `road-${edge.id}:asphalt`, kind: 'polygon',
      polygon: orientedRectangle(cx, cz, edge.dir.x, edge.dir.y, rightX, rightZ, edge.length + edge.width, edge.width),
    });

    const sidewalkWidth = SIDEWALK_BY_CLASS[edge.cls] || 2.2;
    const trim = Math.min(edge.length * 0.34, edge.width * 0.75 + 2.5);
    const walkLength = Math.max(2, edge.length - trim * 2);
    for (const side of [-1, 1]) {
      const offset = edge.width / 2 + sidewalkWidth / 2;
      sidewalks.push({
        id: `road-${edge.id}:sidewalk:${side < 0 ? 'left' : 'right'}`, kind: 'polygon',
        polygon: orientedRectangle(
          cx + rightX * side * offset,
          cz + rightZ * side * offset,
          edge.dir.x, edge.dir.y, rightX, rightZ, walkLength, sidewalkWidth
        ),
      });
    }
  }
  for (const node of graph.nodes) {
    if (!node.edges.length) continue;
    const radius = Math.max(...node.edges.map((edge) => edge.width)) / 2;
    asphalt.push({ id: `junction-${node.id}:asphalt`, kind: 'circle', x: node.pos.x, z: node.pos.y, radius });
  }
  return { asphalt, complete: [...asphalt, ...sidewalks] };
}

function nearestSurface(polygon, surfaces) {
  let nearest = null;
  for (const surface of surfaces) {
    const clearance = surfaceDistance(polygon, surface);
    if (!nearest || clearance < nearest.clearance) nearest = { id: surface.id, clearance };
  }
  return nearest;
}

function percentile(sorted, fraction) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const blend = index - lower;
  return sorted[lower] * (1 - blend) + sorted[upper] * blend;
}

function distribution(values, buckets) {
  const sorted = [...values].sort((a, b) => a - b);
  const histogram = {};
  let lower = -Infinity;
  for (const upper of buckets) {
    const label = `${Number.isFinite(lower) ? lower : '-inf'}..${upper}`;
    histogram[label] = sorted.filter((value) => value >= lower && value < upper).length;
    lower = upper;
  }
  histogram[`${lower}..inf`] = sorted.filter((value) => value >= lower).length;
  return {
    count: sorted.length,
    min: sorted[0],
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    max: sorted.at(-1),
    mean: sorted.reduce((sum, value) => sum + value, 0) / sorted.length,
    histogram,
  };
}

const plots = LANDMARK_LOTS.map((lot) => ({ id: lot.id, polygon: lotPolygon(lot) }));
const surfaces = roadSurfaces();
const roadClearanceByPlot = plots.map((plot) => ({
  plot: plot.id,
  carriageway: nearestSurface(plot.polygon, surfaces.asphalt),
  completeRoadSurface: nearestSurface(plot.polygon, surfaces.complete),
})).sort((a, b) => a.carriageway.clearance - b.carriageway.clearance);

const parcelPairs = [];
const nearestParcelByPlot = [];
for (let i = 0; i < plots.length; i += 1) {
  let nearest = null;
  for (let j = i + 1; j < plots.length; j += 1) {
    const clearance = polygonDistance(plots[i].polygon, plots[j].polygon);
    parcelPairs.push({ plots: [plots[i].id, plots[j].id], clearance });
  }
  for (let j = 0; j < plots.length; j += 1) {
    if (i === j) continue;
    const clearance = polygonDistance(plots[i].polygon, plots[j].polygon);
    if (!nearest || clearance < nearest.clearance) nearest = { plot: plots[j].id, clearance };
  }
  nearestParcelByPlot.push({ plot: plots[i].id, nearest });
}
parcelPairs.sort((a, b) => a.clearance - b.clearance);
nearestParcelByPlot.sort((a, b) => a.nearest.clearance - b.nearest.clearance);

let farthest = { radius: 0 };
for (const plot of plots) {
  for (const point of plot.polygon) {
    const radius = Math.hypot(point.x, point.z);
    if (radius > farthest.radius) farthest = { plot: plot.id, corner: [point.x, point.z], radius };
  }
}

const carriagewayValues = roadClearanceByPlot.map((entry) => entry.carriageway.clearance);
const completeSurfaceValues = roadClearanceByPlot.map((entry) => entry.completeRoadSurface.clearance);
const nearestParcelValues = nearestParcelByPlot.map((entry) => entry.nearest.clearance);
const allParcelValues = parcelPairs.map((entry) => entry.clearance);
const overlaps = {
  roadCarriageway: roadClearanceByPlot.filter((entry) => entry.carriageway.clearance <= EPSILON),
  completeRoadSurface: roadClearanceByPlot.filter((entry) => entry.completeRoadSurface.clearance <= EPSILON),
  parcelPairs: parcelPairs.filter((entry) => entry.clearance <= EPSILON),
};

const report = {
  status: overlaps.roadCarriageway.length === 0
    && overlaps.completeRoadSurface.length === 0
    && overlaps.parcelPairs.length === 0
    && farthest.radius <= WORLD.flatRadius ? 'PASS' : 'FAIL',
  counts: {
    plots: plots.length,
    configuredRoadSegments: ROAD_SEGMENTS.length,
    graphEdges: graph.edges.length,
    graphNodes: graph.nodes.length,
  },
  roadClearance: {
    note: 'Per-plot nearest distance. Complete road surface includes rendered roadside sidewalk strips.',
    carriagewayDistribution: distribution(carriagewayValues, [2, 4, 6, 10, 15]),
    completeRoadSurfaceDistribution: distribution(completeSurfaceValues, [2, 4, 6, 10, 15]),
    byPlot: roadClearanceByPlot,
  },
  parcelClearance: {
    note: 'Nearest-neighbor distribution gives each plot equal weight; all-pairs includes every unique parcel pair.',
    nearestNeighborDistribution: distribution(nearestParcelValues, [2, 4, 6, 10, 15]),
    allPairsDistribution: distribution(allParcelValues, [2, 4, 6, 10, 15, 25, 50]),
    nearestByPlot: nearestParcelByPlot,
    closestPairs: parcelPairs.slice(0, 12),
  },
  overlaps,
  farthest: { ...farthest, flatRadius: WORLD.flatRadius, margin: WORLD.flatRadius - farthest.radius },
};

console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;

import { LANDMARK_LOTS, ROAD_SEGMENTS, ROAD_WIDTH, WORLD } from '../src/config/town.js';

function plotRect(lot) {
  const quarterTurn = Math.abs(Math.sin(lot.rot || 0)) > 0.5;
  const [width, depth] = quarterTurn ? [lot.size[1], lot.size[0]] : lot.size;
  return {
    id: lot.id,
    minX: lot.pos[0] - width / 2,
    maxX: lot.pos[0] + width / 2,
    minZ: lot.pos[1] - depth / 2,
    maxZ: lot.pos[1] + depth / 2,
  };
}

function roadRect(road, index) {
  const halfWidth = ROAD_WIDTH[road.w] / 2;
  const minX = Math.min(road.a[0], road.b[0]);
  const maxX = Math.max(road.a[0], road.b[0]);
  const minZ = Math.min(road.a[1], road.b[1]);
  const maxZ = Math.max(road.a[1], road.b[1]);
  return {
    id: `road-${index}`,
    minX: minX - (minX === maxX ? halfWidth : 0),
    maxX: maxX + (minX === maxX ? halfWidth : 0),
    minZ: minZ - (minZ === maxZ ? halfWidth : 0),
    maxZ: maxZ + (minZ === maxZ ? halfWidth : 0),
  };
}

function gap(a, b) {
  const dx = Math.max(b.minX - a.maxX, a.minX - b.maxX, 0);
  const dz = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ, 0);
  return Math.hypot(dx, dz);
}

const plots = LANDMARK_LOTS.map(plotRect);
const roads = ROAD_SEGMENTS.map(roadRect);
let worstRoad = { margin: Infinity };
let worstPair = { gap: Infinity };
let farthest = { radius: 0 };

for (const plot of plots) {
  for (const road of roads) {
    const margin = gap(plot, road);
    if (margin < worstRoad.margin) worstRoad = { plot: plot.id, road: road.id, margin };
  }
  for (const x of [plot.minX, plot.maxX]) {
    for (const z of [plot.minZ, plot.maxZ]) {
      const radius = Math.hypot(x, z);
      if (radius > farthest.radius) farthest = { plot: plot.id, corner: [x, z], radius };
    }
  }
}

for (let i = 0; i < plots.length; i += 1) {
  for (let j = i + 1; j < plots.length; j += 1) {
    const pairGap = gap(plots[i], plots[j]);
    if (pairGap < worstPair.gap) {
      worstPair = { plots: [plots[i].id, plots[j].id], gap: pairGap };
    }
  }
}

const report = {
  status: worstRoad.margin > 0 && worstPair.gap > 0 && farthest.radius <= WORLD.flatRadius ? 'PASS' : 'FAIL',
  plotCount: plots.length,
  worstRoad,
  worstPair,
  farthest: { ...farthest, flatRadius: WORLD.flatRadius, margin: WORLD.flatRadius - farthest.radius },
};
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;

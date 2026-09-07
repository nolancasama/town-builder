// Independent check: sample the MIDDLE of each corner's pavement band
// (not its clipped boundary) and test polygon membership directly.
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../src/config/town.js';
import { WALK_POLYGONS } from '../src/config/sidewalks.js';

const SIDEWALK_BY_CLASS = { main: 3.0, minor: 2.2, lane: 1.6 };
const key = (p) => `${p[0]},${p[1]}`;
const nodes = new Map();
const nodeOf = (p) => {
  if (!nodes.has(key(p))) nodes.set(key(p), { pos: { x: p[0], z: p[1] }, edges: [] });
  return nodes.get(key(p));
};
const edges = ROAD_SEGMENTS.map((seg, i) => {
  const a = nodeOf(seg.a), b = nodeOf(seg.b);
  const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
  const len = Math.hypot(dx, dz);
  const e = { id: i, a, b, dir: { x: dx / len, z: dz / len },
    width: ROAD_WIDTH[seg.w], cls: seg.w, sw: SIDEWALK_BY_CLASS[seg.w] || 2.2 };
  a.edges.push(e); b.edges.push(e);
  return e;
});

const inside = (x, z, poly) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};
const onPavement = (x, z) => WALK_POLYGONS.some((p) => inside(x, z, p));

let total = 0, bad = 0;
const failures = [];
for (const node of nodes.values()) {
  const inc = node.edges.map((e) => {
    const away = e.a === node ? 1 : -1;
    const dir = { x: e.dir.x * away, z: e.dir.z * away };
    return { e, dir, angle: Math.atan2(dir.z, dir.x) };
  }).sort((a, b) => a.angle - b.angle);
  if (inc.length < 2) continue;
  for (let i = 0; i < inc.length; i++) {
    const from = inc[i], to = inc[(i + 1) % inc.length];
    let sweep = to.angle - from.angle;
    while (sweep <= 0) sweep += Math.PI * 2;
    if (sweep > Math.PI * 1.5) continue; // reflex side of a dead-end pair
    total++;
    // Sample outward from the true corner: the intersection of the two kerb
    // lines, stepped along the bisector by half a sidewalk width.
    const nrm = (d) => ({ x: -d.z, z: d.x });
    const fN = nrm(from.dir), tN = nrm(to.dir);
    const fP = { x: node.pos.x + fN.x * from.e.width / 2, z: node.pos.z + fN.z * from.e.width / 2 };
    const tP = { x: node.pos.x - tN.x * to.e.width / 2, z: node.pos.z - tN.z * to.e.width / 2 };
    const den = from.dir.x * to.dir.z - from.dir.z * to.dir.x;
    let x, z;
    if (Math.abs(den) < 1e-9) { total--; continue; }
    const t = ((tP.x - fP.x) * to.dir.z - (tP.z - fP.z) * to.dir.x) / den;
    const mx = fP.x + from.dir.x * t, mz = fP.z + from.dir.z * t;
    let bx = mx - node.pos.x, bz = mz - node.pos.z;
    const bl = Math.hypot(bx, bz) || 1;
    const step = Math.max(from.e.sw, to.e.sw) / 2;
    x = mx + (bx / bl) * step;
    z = mz + (bz / bl) * step;
    if (!onPavement(x, z)) { bad++; failures.push({ node: [node.pos.x, node.pos.z], pt: [+x.toFixed(2), +z.toFixed(2)] }); }
  }
}
console.log(JSON.stringify({ cornersTested: total, onPavement: total - bad, notOnPavement: bad,
  failures: failures.slice(0, 12) }, null, 2));

// Detects coplanar overlaps that would z-fight: pavement polygons share one
// height, so any two with real overlapping area flicker against each other.
import { WALK_POLYGONS, KERB_POLYGONS } from '../src/config/sidewalks.js';

const area = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]);
  return Math.abs(a) / 2;
};
const bbox = (p) => {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [x, z] of p) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  return [x0, z0, x1, z1];
};
const bboxHit = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);
// Sutherland-Hodgman: clip subject by each edge of clipper (treated convex).
const clip = (subject, clipper) => {
  let out = subject;
  for (let i = 0, j = clipper.length - 1; i < clipper.length; j = i++) {
    const A = clipper[j], B = clipper[i];
    const side = (p) => (B[0] - A[0]) * (p[1] - A[1]) - (B[1] - A[1]) * (p[0] - A[0]);
    const input = out; out = [];
    for (let k = 0, m = input.length - 1; k < input.length; m = k++) {
      const P = input[m], Q = input[k];
      const sp = side(P), sq = side(Q);
      if (sq >= 0) {
        if (sp < 0) {
          const t = sp / (sp - sq);
          out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
        }
        out.push(Q);
      } else if (sp >= 0) {
        const t = sp / (sp - sq);
        out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
      }
    }
    if (!out.length) return [];
  }
  return out;
};
const ccw = (p) => {
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += (p[j][0] * p[i][1] - p[i][0] * p[j][1]);
  return a > 0 ? p : p.slice().reverse();
};

function analyse(name, polys, threshold) {
  const norm = polys.map(ccw);
  const boxes = norm.map(bbox);
  let pairs = 0, worst = 0, totalOverlap = 0;
  const examples = [];
  for (let i = 0; i < norm.length; i++) {
    for (let j = i + 1; j < norm.length; j++) {
      if (!bboxHit(boxes[i], boxes[j])) continue;
      const inter = clip(norm[i], norm[j]);
      if (inter.length < 3) continue;
      const a = area(inter);
      if (a > threshold) {
        pairs++; totalOverlap += a;
        if (a > worst) worst = a;
        if (examples.length < 6) examples.push({ i, j, overlapArea: +a.toFixed(3), at: inter[0].map((v) => +v.toFixed(2)) });
      }
    }
  }
  const degenerate = norm.filter((p) => area(p) < 1e-4).length;
  const dupVerts = norm.filter((p) => p.some((v, k) => {
    const w = p[(k + 1) % p.length];
    return Math.abs(v[0] - w[0]) < 1e-6 && Math.abs(v[1] - w[1]) < 1e-6;
  })).length;
  return { layer: name, polygons: norm.length, overlappingPairs: pairs,
    worstOverlapArea: +worst.toFixed(3), totalOverlapArea: +totalOverlap.toFixed(2),
    zeroAreaPolygons: degenerate, polygonsWithDuplicateVertices: dupVerts, examples };
}

const walk = analyse('walk', WALK_POLYGONS, 1e-3);
const kerb = analyse('kerb', KERB_POLYGONS, 1e-3);
console.log(JSON.stringify({ walk, kerb }, null, 2));
if (walk.overlappingPairs || kerb.overlappingPairs) process.exitCode = 1;

import * as THREE from 'three';
import { ROAD_SEGMENTS, ROAD_WIDTH } from '../config/town.js';

/**
 * ROAD GRAPH
 * ----------
 * Pedestrians and cars share one waypoint network derived from the road data.
 * Nobody runs pathfinding: an agent walks an edge, then picks a new edge at the
 * node it arrives at. That keeps ~60 moving agents essentially free on the CPU
 * while still looking like people using sidewalks and cars using lanes.
 */

const EPS = 0.75;

function keyOf(x, z) {
  return `${Math.round(x / EPS)}:${Math.round(z / EPS)}`;
}

export function buildRoadGraph() {
  const nodes = [];
  const nodeIndex = new Map();

  const nodeAt = (x, z) => {
    const k = keyOf(x, z);
    if (nodeIndex.has(k)) return nodeIndex.get(k);
    const n = { id: nodes.length, pos: new THREE.Vector2(x, z), edges: [] };
    nodes.push(n);
    nodeIndex.set(k, n);
    return n;
  };

  const edges = ROAD_SEGMENTS.map((seg, i) => {
    const a = nodeAt(seg.a[0], seg.a[1]);
    const b = nodeAt(seg.b[0], seg.b[1]);
    const dir = new THREE.Vector2().subVectors(b.pos, a.pos);
    const length = dir.length();
    dir.normalize();
    const edge = {
      id: i,
      a,
      b,
      dir,                                   // unit vector a -> b
      right: new THREE.Vector2(-dir.y, dir.x), // right-hand side of travel a -> b
      length,
      width: ROAD_WIDTH[seg.w] || ROAD_WIDTH.minor,
      cls: seg.w,
    };
    a.edges.push(edge);
    b.edges.push(edge);
    return edge;
  });

  const graph = {
    nodes,
    edges,

    /** Point on an edge, offset sideways. side: +1 = right of travel. */
    pointOn(edge, t, forward, lateral, out = new THREE.Vector2()) {
      const from = forward ? edge.a.pos : edge.b.pos;
      const dirX = forward ? edge.dir.x : -edge.dir.x;
      const dirY = forward ? edge.dir.y : -edge.dir.y;
      const rx = -dirY;
      const ry = dirX;
      out.set(from.x + dirX * t + rx * lateral, from.y + dirY * t + ry * lateral);
      return out;
    },

    /** Pick a continuing edge at a node, avoiding a U-turn unless it is a dead end. */
    nextEdge(node, cameFrom, rng) {
      const options = node.edges.filter((e) => e !== cameFrom);
      if (!options.length) return cameFrom;
      return options[Math.floor(rng() * options.length)];
    },

    randomEdge(rng) {
      return edges[Math.floor(rng() * edges.length)];
    },

    /** Edges whose class is in `classes` - used to keep trucks off tiny lanes. */
    edgesOfClass(classes) {
      return edges.filter((e) => classes.includes(e.cls));
    },

    nearestNode(x, z) {
      let best = null;
      let bestD = Infinity;
      for (const n of nodes) {
        const d = (n.pos.x - x) ** 2 + (n.pos.y - z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      return best;
    },

    /** Shortest distance from a point to any road centre-line (for placement tests). */
    distanceToRoad(x, z) {
      let best = Infinity;
      const p = new THREE.Vector2(x, z);
      const ap = new THREE.Vector2();
      for (const e of edges) {
        ap.subVectors(p, e.a.pos);
        const t = Math.max(0, Math.min(e.length, ap.dot(e.dir)));
        const cx = e.a.pos.x + e.dir.x * t;
        const cz = e.a.pos.y + e.dir.y * t;
        const d = Math.hypot(x - cx, z - cz) - e.width / 2;
        if (d < best) best = d;
      }
      return best;
    },
  };

  return graph;
}

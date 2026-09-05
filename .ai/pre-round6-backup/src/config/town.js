/**
 * TOWN LAYOUT DATA
 * ----------------
 * Everything about the shape of the town lives here. Teachers / designers can
 * move roads, add lots or re-scale the map without touching any game logic.
 *
 * Coordinate system: X to the right, Z toward the camera, Y up. 1 unit ~ 1 metre.
 */

export const WORLD = {
  size: 230,            // terrain is size x size (the outer ring is scenery only)
  flatRadius: 88,       // everything inside this is perfectly flat, playable ground
  hillRadius: 124,      // hills rise between flatRadius and here
  seed: 20260823,
};

/** Road widths by class. */
export const ROAD_WIDTH = {
  main: 8,
  minor: 6,
  lane: 4.5,
};

/**
 * Road network as a list of straight segments.
 * Segments are pre-split at intersections; endpoints that share a position are
 * automatically merged into graph nodes (see world/graph.js), which gives us the
 * pedestrian + vehicle network for free.
 */
export const ROAD_SEGMENTS = [
  // --- Main east-west high street (z = 0) ---
  { a: [-62, 0], b: [-30, 0], w: 'main' },
  { a: [-30, 0], b: [-14, 0], w: 'main' },
  { a: [-14, 0], b: [2, 0], w: 'main' },
  { a: [2, 0], b: [26, 0], w: 'main' },
  { a: [26, 0], b: [62, 0], w: 'main' },

  // --- Northern street (z = 28) ---
  { a: [-46, 28], b: [-30, 28], w: 'minor' },
  { a: [-30, 28], b: [-14, 28], w: 'minor' },
  { a: [-14, 28], b: [2, 28], w: 'minor' },
  { a: [2, 28], b: [26, 28], w: 'minor' },
  { a: [26, 28], b: [46, 28], w: 'minor' },

  // --- Southern street (z = -26) ---
  { a: [-52, -26], b: [-30, -26], w: 'minor' },
  { a: [-30, -26], b: [-14, -26], w: 'minor' },
  { a: [-14, -26], b: [2, -26], w: 'minor' },
  { a: [2, -26], b: [26, -26], w: 'minor' },
  { a: [26, -26], b: [44, -26], w: 'minor' },

  // --- Western avenue (x = -30) ---
  { a: [-30, -44], b: [-30, -26], w: 'minor' },
  { a: [-30, -26], b: [-30, 0], w: 'minor' },
  { a: [-30, 0], b: [-30, 14], w: 'minor' },
  { a: [-30, 14], b: [-30, 28], w: 'minor' },
  { a: [-30, 28], b: [-30, 46], w: 'minor' },

  // --- Central avenue (x = 2) ---
  { a: [2, -48], b: [2, -26], w: 'main' },
  { a: [2, -26], b: [2, 0], w: 'main' },
  { a: [2, 0], b: [2, 14], w: 'main' },
  { a: [2, 14], b: [2, 28], w: 'main' },
  { a: [2, 28], b: [2, 50], w: 'main' },

  // --- Eastern avenue (x = 26) ---
  { a: [26, -26], b: [26, 0], w: 'minor' },
  { a: [26, 0], b: [26, 28], w: 'minor' },
  { a: [26, 28], b: [26, 42], w: 'lane' },

  // --- Neighbourhood back streets through the middle of town ---
  { a: [-14, -26], b: [-14, 0], w: 'lane' },
  { a: [-14, 0], b: [-14, 14], w: 'lane' },
  { a: [-14, 14], b: [-14, 28], w: 'lane' },
  { a: [-30, 14], b: [-14, 14], w: 'lane' },
  { a: [-14, 14], b: [2, 14], w: 'lane' },

  // --- Diagonal shortcut in the north-east (keeps the grid from feeling rigid) ---
  { a: [26, 42], b: [46, 28], w: 'lane' },

  // --- Country lanes: a loop around the southern fields and the stadium land ---
  { a: [-52, -26], b: [-58, -44], w: 'lane' },
  { a: [-58, -44], b: [-30, -44], w: 'lane' },
  { a: [-30, -44], b: [2, -48], w: 'lane' },
  { a: [2, -48], b: [2, -64], w: 'lane' },
  { a: [2, -64], b: [50, -64], w: 'lane' },
  { a: [44, -26], b: [50, -44], w: 'lane' },
  { a: [50, -44], b: [50, -64], w: 'lane' },

  // --- Country lanes in the north ---
  { a: [-46, 28], b: [-48, 46], w: 'lane' },
  { a: [-48, 46], b: [-30, 46], w: 'lane' },
  { a: [-30, 46], b: [2, 50], w: 'lane' },
];

/**
 * LANDMARK LOTS
 * Undeveloped ground reserved for the buildings the children speak into being.
 * They are dressed as scruffy open land (gravel, weeds, a site fence) rather
 * than obvious empty squares.
 *
 *  id       - stable key referenced by the landmark registry
 *  pos      - [x, z] centre
 *  rot      - Y rotation; the building front (+Z in local space) faces `entrance`
 *  size     - [width, depth] reservation for a future developed perimeter walk
 *  buildSize- [width, depth] usable inner building pad (derived below)
 *  zones    - which kind of landmark may claim this lot
 *  reservedFor / excludedTypes - rare per-landmark physical-site constraints
 *  entrance - [x, z] where pedestrians walk to when visiting
 */
const LANDMARK_PLOTS = [
  /* --- the original town-centre and near-town plots --- */
  { id: 'lot-school', pos: [-48, 14], rot: Math.PI / 2, size: [26, 20], zones: ['civic', 'large', 'recreation'], entrance: [-33, 14] },
  { id: 'lot-park', pos: [-48, -13], rot: Math.PI / 2, size: [26, 18], zones: ['recreation', 'large', 'civic'], entrance: [-33, -13] },
  { id: 'lot-library', pos: [14.5, 15], rot: 0, size: [16, 16], zones: ['civic', 'medium'], entrance: [14.5, 25] },
  { id: 'lot-hospital', pos: [14.5, -13], rot: Math.PI, size: [16, 16], zones: ['civic', 'medium'], entrance: [14.5, -24] },
  { id: 'lot-museum', pos: [-14, 39], rot: Math.PI, size: [22, 12], zones: ['civic', 'medium'], entrance: [-14, 30] },
  { id: 'lot-mall', pos: [15, 39], rot: Math.PI, size: [16, 12], zones: ['medium', 'small'], entrance: [15, 30] },
  {
    id: 'lot-station', pos: [44, 15], rot: -Math.PI / 2, size: [26, 18], zones: ['transport', 'large'], entrance: [31, 15],
    // Track geometry is authored in this pad's orientation and spans the map;
    // reserving the pad guarantees the global corridor cannot migrate later.
    reservedFor: 'station',
  },
  { id: 'lot-stadium', pos: [24, -48], rot: 0, size: [36, 26], zones: ['large', 'recreation'], entrance: [24, -31] },
  { id: 'lot-south-yard', pos: [-14, -36], rot: 0, size: [18, 12], zones: ['medium', 'small', 'recreation'], entrance: [-14, -30] },

  /* --- flexible plots added for the wider building pool --- */
  { id: 'lot-north-yard', pos: [-44, 40], rot: 0, size: [16, 12], zones: ['small', 'medium', 'civic'], entrance: [-44, 45] },
  {
    id: 'lot-northeast', pos: [38, 47], rot: Math.PI, size: [16, 12], zones: ['small', 'medium'], entrance: [38, 37],
    // The railway only clips the eastern edge of this pad. Keep tall rooflines
    // on one of the many other compatible sites so the whole line can remain
    // low and level instead of rising over this one corner.
    excludedTypes: ['hotel', 'museum', 'fire', 'gym', 'mall', 'cinema'],
  },
  { id: 'lot-southeast', pos: [41, -52], rot: Math.PI / 2, size: [13, 12], zones: ['small', 'edge'], entrance: [47, -52] },

  /* --- big open ground on the edge of town --- */
  { id: 'lot-west-big', pos: [-62, 32], rot: Math.PI / 2, size: [24, 20], zones: ['large', 'recreation', 'edge'], entrance: [-50, 32] },
  { id: 'lot-east-big', pos: [64, -8], rot: 0, size: [26, 22], zones: ['large', 'transport', 'edge'], entrance: [62, 3] },
  { id: 'lot-south-big', pos: [-44, -54], rot: 0, size: [24, 18], zones: ['large', 'recreation', 'edge'], entrance: [-44, -45] },
  { id: 'lot-north-big', pos: [-16, 60], rot: Math.PI, size: [24, 18], zones: ['large', 'edge', 'recreation'], entrance: [-16, 50] },
  {
    id: 'lot-northeast-big', pos: [54, 44], rot: Math.PI, size: [20, 16], zones: ['edge', 'recreation', 'medium'], entrance: [50, 34],
    excludedTypes: ['airport', 'hotel', 'gym', 'museum', 'mall', 'castle', 'aquarium', 'cinema'],
  },
];

/**
 * Landmark plot dimensions historically described only the usable building
 * pad. Once developed, a lot owns a narrow walk outside that pad. Keep the
 * original dimensions as `buildSize` so existing hand-built landmarks retain
 * their exact scale, and make `size` the future developed outer reservation.
 */
export const LOT_SIDEWALK_WIDTH = 1.6;
export const LANDMARK_LOTS = LANDMARK_PLOTS.map((lot) => ({
  ...lot,
  buildSize: [...lot.size],
  size: [lot.size[0] + LOT_SIDEWALK_WIDTH * 2, lot.size[1] + LOT_SIDEWALK_WIDTH * 2],
}));

/**
 * Rice paddies. Placed as blocks around the town edge; the generator skips any
 * plot that would collide with a road, a lot or another structure.
 */
export const PADDY_FIELDS = [
  { pos: [-54, 4], size: [20, 22] },
  { pos: [-52, -50], size: [22, 18] },
  { pos: [-16, -60], size: [30, 16] },
  { pos: [54, -12], size: [18, 26] },
  { pos: [46, 48], size: [26, 20] },
  { pos: [-16, 62], size: [34, 16] },
  { pos: [-54, 62], size: [20, 16] },
  { pos: [62, -44], size: [14, 22] },
  { pos: [26, 60], size: [22, 16] },
];

/** Drainage channels that run beside the paddies. */
export const CHANNELS = [
  { a: [-66, 16], b: [-60, 16] },
  { a: [-36, 16], b: [-36, -10] },
  { a: [-16, -52], b: [-16, -43.5] },
  { a: [-34, 58], b: [-27, 58] },
  { a: [-5, 58], b: [4, 58] },
];

/** Camera framing. */
export const CAMERA = {
  fov: 42,
  start: { x: 68, y: 76, z: 96 },
  target: { x: 0, y: 0, z: -4 },
  minDistance: 44,
  maxDistance: 170,
  minPolar: 0.42,      // never below ~24 degrees above the horizon
  maxPolar: 1.16,      // never under the map
  panLimit: 48,        // how far the look-at point may leave the town centre
};

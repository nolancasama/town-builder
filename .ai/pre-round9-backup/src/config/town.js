/**
 * TOWN LAYOUT DATA
 * ----------------
 * Everything about the shape of the town lives here. Teachers / designers can
 * move roads, add lots or re-scale the map without touching any game logic.
 *
 * Coordinate system: X to the right, Z toward the camera, Y up. 1 unit ~ 1 metre.
 */

export const WORLD = {
  size: 290,            // compact outer terrain beyond the country-road belt
  flatRadius: 136,      // keeps every road, parcel and paddy on level ground
  hillRadius: 150,      // hills rise just beyond the working countryside
  seed: 20260823,
};

/**
 * The only landmark and parcel dimensions used by the town. `envelope` is the
 * usable local X/Z area supplied to a landmark builder; `plot` reserves the
 * envelope plus a two-metre perimeter band for its developed sidewalk.
 */
export const LANDMARK_SIZE_CLASSES = Object.freeze({
  small: Object.freeze({ rank: 0, envelope: Object.freeze([16, 14]), plot: Object.freeze([20, 18]) }),
  medium: Object.freeze({ rank: 1, envelope: Object.freeze([22, 18]), plot: Object.freeze([26, 22]) }),
  large: Object.freeze({ rank: 2, envelope: Object.freeze([28, 24]), plot: Object.freeze([32, 28]) }),
  xl: Object.freeze({ rank: 3, envelope: Object.freeze([38, 28]), plot: Object.freeze([42, 32]) }),
});

export function sizeClassFor(name) {
  const sizeClass = LANDMARK_SIZE_CLASSES[name];
  if (!sizeClass) throw new Error(`Unknown landmark size class: ${name}`);
  return sizeClass;
}

/** Shared authored dimensions for the station's town-spanning infrastructure. */
export const RAILWAY = Object.freeze({
  deckY: 11.2,
  trackOffsetZ: -1.8,
  deckWidth: 5.2,
  deckThickness: 0.8,
  pierOffsetZ: -3.5,
});

export function railwayWorldX(stationLot) {
  return stationLot.pos[0] + RAILWAY.trackOffsetZ * Math.sin(stationLot.rot || 0);
}

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
  // The high street remains the town's one strong axis. Other streets bend,
  // terminate and loop around the plots instead of completing a rigid grid.
  { a: [-92, 0], b: [-54, 0], w: 'main' },
  { a: [-54, 0], b: [-8, 0], w: 'main' },
  { a: [-8, 0], b: [7, 0], w: 'main' },
  { a: [7, 0], b: [60, 0], w: 'main' },

  // Gently crooked northern and southern neighbourhood streets.
  { a: [-88, 48], b: [-54, 48], w: 'minor' },
  { a: [-54, 48], b: [7, 50], w: 'minor' },
  { a: [7, 50], b: [38, 48], w: 'minor' },
  { a: [38, 48], b: [60, 44], w: 'minor' },

  { a: [-88, -48], b: [-54, -48], w: 'minor' },
  { a: [-54, -48], b: [-14, -52], w: 'minor' },
  { a: [-14, -52], b: [26, -50], w: 'minor' },
  { a: [26, -50], b: [60, -44], w: 'minor' },
  { a: [60, -44], b: [86, -34], w: 'minor' },

  // Back streets: a small western loop and an offset central connection.
  { a: [-54, -48], b: [-54, 0], w: 'minor' },
  { a: [-54, 0], b: [-54, 18], w: 'lane' },
  { a: [-54, 18], b: [-58, 32], w: 'lane' },
  { a: [-58, 32], b: [-54, 48], w: 'lane' },

  { a: [-14, -52], b: [-8, -24], w: 'lane' },
  { a: [-8, -24], b: [-8, 0], w: 'lane' },
  { a: [-8, 0], b: [7, 10], w: 'lane' },
  { a: [7, 10], b: [7, 50], w: 'lane' },

  // The east side is deliberately sparse. Its long diagonal is the shortcut
  // past the station and into the northern fields.
  { a: [60, -44], b: [60, 0], w: 'minor' },
  { a: [60, 0], b: [60, 44], w: 'minor' },
  { a: [60, 44], b: [86, 52], w: 'lane' },
  { a: [86, 52], b: [100, 70], w: 'lane' },

  // Country lanes wander around the southern rice fields and stadium land.
  { a: [-88, -48], b: [-112, -62], w: 'lane', rural: true },
  { a: [-112, -62], b: [-93.5, -87.5], w: 'lane', rural: true },
  { a: [-93.5, -87.5], b: [-64, -111], w: 'lane', rural: true },
  { a: [-64, -111], b: [-11, -123.5], w: 'lane', rural: true },
  { a: [-11, -123.5], b: [38, -118], w: 'lane', rural: true },
  { a: [38, -118], b: [79.5, -98], w: 'lane', rural: true },
  { a: [79.5, -98], b: [107, -67], w: 'lane', rural: true },
  { a: [107, -67], b: [99, -50], w: 'lane', rural: true },
  { a: [99, -50], b: [86, -34], w: 'lane', rural: true },

  // A second loose loop serves the northern paddies and rejoins the diagonal.
  { a: [-88, 48], b: [-112, 62], w: 'lane', rural: true },
  { a: [-112, 62], b: [-93.5, 87.5], w: 'lane', rural: true },
  { a: [-93.5, 87.5], b: [-64, 111], w: 'lane', rural: true },
  { a: [-64, 111], b: [-11, 123.5], w: 'lane', rural: true },
  { a: [-11, 123.5], b: [38, 118], w: 'lane', rural: true },
  { a: [38, 118], b: [79.5, 98], w: 'lane', rural: true },
  { a: [79.5, 98], b: [100, 70], w: 'lane', rural: true },
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
 *  plotClass- small / medium / large / xl physical reservation
 *  size     - derived reserved plot [width, depth]
 *  buildSize- derived usable landmark envelope [width, depth]
 *  zones    - semantic site types this parcel may host
 *  reservedFor - rare authored-site constraint
 *  entrance - [x, z] where pedestrians walk to when visiting
 */
const LANDMARK_PLOTS = [
  /* Town blocks. Two opposed small fronts share the north-west block. */
  { id: 'small-center-west', plotClass: 'small', pos: [-35, 24], rot: -Math.PI / 2, zones: ['commercial', 'residential', 'civic'], entrance: [-48, 24] },
  { id: 'small-center-east', plotClass: 'small', pos: [-11, 24], rot: Math.PI / 2, zones: ['commercial', 'residential', 'civic'], entrance: [2, 24] },
  { id: 'large-center-north', plotClass: 'large', pos: [30, 25], rot: 0, zones: ['civic', 'recreation', 'commercial', 'transport'], entrance: [30, 45] },
  { id: 'medium-center-south', plotClass: 'medium', pos: [-30, -24], rot: Math.PI, zones: ['civic', 'recreation', 'commercial', 'transport'], entrance: [-30, -39] },
  { id: 'large-center-south', plotClass: 'large', pos: [20, -24], rot: Math.PI, zones: ['civic', 'recreation', 'commercial', 'transport', 'edge'], entrance: [20, -44] },

  /* West-side plots keep development irregular and leave open agricultural ground. */
  { id: 'medium-west-north', plotClass: 'medium', pos: [-78, 22], rot: Math.PI / 2, zones: ['civic', 'commercial', 'residential'], entrance: [-62, 22] },
  { id: 'medium-west-south', plotClass: 'medium', pos: [-78, -22], rot: Math.PI / 2, zones: ['transport', 'commercial', 'edge', 'recreation'], entrance: [-62, -22] },

  /* Outer northern row, all facing the same country-side street. */
  { id: 'small-northwest', plotClass: 'small', pos: [-81, 69], rot: Math.PI, zones: ['commercial', 'residential', 'civic'], entrance: [-81, 55] },
  { id: 'medium-northwest', plotClass: 'medium', pos: [-51.5, 74], rot: Math.PI, zones: ['civic', 'recreation', 'edge'], entrance: [-51.5, 55] },
  { id: 'large-north', plotClass: 'large', pos: [-15, 75], rot: Math.PI, zones: ['civic', 'recreation', 'edge'], entrance: [-15, 55] },
  { id: 'large-northeast', plotClass: 'large', pos: [23.5, 72], rot: Math.PI, zones: ['recreation', 'commercial', 'edge'], entrance: [23.5, 54] },
  { id: 'medium-northeast', plotClass: 'medium', pos: [60, 69], rot: Math.PI, zones: ['transport', 'commercial', 'edge', 'civic'], entrance: [60, 52] },

  /* Outer southern row. The sole XL site stays open around the stadium. */
  { id: 'small-southwest', plotClass: 'small', pos: [-81, -69], rot: 0, zones: ['commercial', 'residential'], entrance: [-81, -55] },
  { id: 'medium-southwest', plotClass: 'medium', pos: [-51.5, -74], rot: 0, zones: ['civic', 'recreation', 'edge'], entrance: [-51.5, -57] },
  { id: 'large-south', plotClass: 'large', pos: [-14.5, -77], rot: 0, zones: ['recreation', 'edge', 'civic'], entrance: [-14.5, -57] },
  { id: 'xl-stadium', plotClass: 'xl', pos: [31.5, -78], rot: 0, zones: ['recreation'], entrance: [31.5, -57], reservedFor: 'stadium' },

  /* The authored station anchors a straight railway in the open eastern corridor. */
  { id: 'large-station', plotClass: 'large', pos: [82, 22], rot: -Math.PI / 2, zones: ['transport'], entrance: [64, 22], reservedFor: 'station' },
];

/**
 * All physical dimensions are derived from `plotClass`; parcel declarations
 * carry no one-off sizes.
 */
export const LOT_SIDEWALK_WIDTH = (
  LANDMARK_SIZE_CLASSES.small.plot[0] - LANDMARK_SIZE_CLASSES.small.envelope[0]
) / 2;
export const LANDMARK_LOTS = LANDMARK_PLOTS.map((lot) => ({
  ...lot,
  buildSize: [...sizeClassFor(lot.plotClass).envelope],
  size: [...sizeClassFor(lot.plotClass).plot],
}));

/**
 * Rice paddies. Placed as blocks around the town edge; the generator skips any
 * plot that would collide with a road, a lot or another structure.
 */
export const PADDY_FIELDS = [
  { pos: [-42, 101], size: [22, 18] },
  { pos: [-10, 105], size: [22, 18] },
  { pos: [19, 102], size: [16, 14] },
  { pos: [-43, -101], size: [22, 18] },
  { pos: [-10, -104], size: [22, 18] },
  { pos: [19, -106], size: [18, 16] },
  { pos: [-72, -96], size: [16, 14] },
  { pos: [-112, 0], size: [20, 18] },
  { pos: [112, 8], size: [14, 12] },
];

/** Drainage channels that run beside the paddies. */
export const CHANNELS = [
  { a: [-54, 91], b: [-30, 91] },
  { a: [-22, 95], b: [2, 95] },
  { a: [10, 94], b: [28, 94] },
  { a: [-55, -91], b: [-31, -91] },
  { a: [-22, -94], b: [2, -94] },
  { a: [9, -97], b: [29, -97] },
  { a: [-81, -88], b: [-63, -88] },
  { a: [-101, -10], b: [-101, 10] },
  { a: [103, 0], b: [103, 16] },
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

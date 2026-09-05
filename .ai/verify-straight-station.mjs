import * as THREE from 'three';

globalThis.document = {
  createElement() {
    return {
      width: 0, height: 0,
      getContext() {
        return {
          clearRect() {}, fillRect() {}, fillText() {},
          measureText(text) { return { width: String(text).length * 24 }; },
        };
      },
    };
  },
};

const [{ LANDMARKS }, { LANDMARK_LOTS }, { makeRng }] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/core/rng.js'),
]);

const lot = LANDMARK_LOTS.find((entry) => entry.id === 'lot-station');
const modelLot = { ...lot, size: [...lot.buildSize] };
const station = LANDMARKS.station.factory({
  size: modelLot.size, sign: LANDMARKS.station.sign, type: 'station',
  rng: makeRng(20260826), lot: modelLot,
});
station.position.set(lot.pos[0], 0, lot.pos[1]);
station.rotation.y = lot.rot;
station.updateMatrixWorld(true);

const track = station.getObjectByName('station-track-structure');
const ys = [];
const centresX = [];
const centresZ = [];
for (const segment of track.userData.clearanceSegments) {
  if (segment.name !== 'station-track-deck') continue;
  const centre = segment.bounds.getCenter(new THREE.Vector3()).applyMatrix4(station.matrixWorld);
  ys.push(segment.bounds.min.y, segment.bounds.max.y);
  centresX.push(centre.x);
  centresZ.push(centre.z);
}

station.userData.callTrain();
station.userData.animate(1 / 60);
console.log(JSON.stringify({
  deckY: station.userData.deckY,
  deckMinY: Math.min(...ys), deckMaxY: Math.max(...ys),
  worldCorridorMinX: Math.min(...centresX), worldCorridorMaxX: Math.max(...centresX),
  worldSpanMinZ: Math.min(...centresZ), worldSpanMaxZ: Math.max(...centresZ),
  trainY: station.userData.train.position.y,
  trainRoll: station.userData.train.rotation.z,
  hasTrainContract: !!station.userData.train,
  hasCallTrainContract: typeof station.userData.callTrain === 'function',
}, null, 2));

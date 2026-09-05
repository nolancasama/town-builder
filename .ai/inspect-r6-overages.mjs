import * as THREE from 'three';

globalThis.document = {
  createElement() {
    return {
      getContext() {
        return {
          clearRect() {}, fillRect() {}, fillText() {},
          measureText(text) { return { width: String(text).length * 24 }; },
        };
      },
    };
  },
};

const [B, X, { makeRng }] = await Promise.all([
  import('../src/buildings/procedural.js'),
  import('../src/buildings/extras.js'),
  import('../src/core/rng.js'),
]);

const failures = {
  library: [['medium', 22, 18], B.buildLibrary],
  hospital: [['medium', 22, 18], B.buildHospital],
  police: [['medium', 22, 18], X.buildPoliceStation],
  bank: [['small', 16, 14], X.buildBank],
  stadium: [['xl', 38, 28], B.buildStadium],
  park: [['large', 28, 24], B.buildPark],
  gym: [['medium', 22, 18], X.buildGym],
  busStation: [['medium', 22, 18], X.buildBusStation],
  aquarium: [['medium', 22, 18], X.buildAquarium],
  museum: [['medium', 22, 18], B.buildMuseum],
  cinema: [['medium', 22, 18], X.buildMovieTheater],
  amusementPark: [['large', 28, 24], X.buildAmusementPark],
  castle: [['large', 28, 24], X.buildCastle],
  beach: [['large', 28, 24], X.buildBeach],
  mall: [['large', 28, 24], B.buildMall],
  convenience: [['small', 16, 14], X.buildConvenience],
  restaurant: [['small', 16, 14], X.buildRestaurant],
  cafe: [['small', 16, 14], X.buildCafe],
  bakery: [['small', 16, 14], X.buildBakery],
  bookstore: [['small', 16, 14], X.buildBookstore],
  hotel: [['medium', 22, 18], X.buildHotel],
};

function describe(object) {
  const geometry = object.geometry;
  const parameterValues = geometry?.parameters
    ? Object.entries(geometry.parameters)
      .filter(([, value]) => typeof value === 'number')
      .map(([key, value]) => `${key}=${Number(value.toFixed(2))}`)
      .join(',')
    : '';
  return `${object.name || object.type}${parameterValues ? `(${parameterValues})` : ''}`;
}

for (const [type, [[sizeClass, width, depth], builder]] of Object.entries(failures)) {
  const model = builder({
    size: [width, depth], sign: type.toUpperCase(), type,
    rng: makeRng(20260826),
  });
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const candidates = [];
  model.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh)) return;
    const childBounds = new THREE.Box3().setFromObject(object);
    candidates.push({
      object,
      bounds: childBounds,
      minX: childBounds.min.x,
      maxX: childBounds.max.x,
      minZ: childBounds.min.z,
      maxZ: childBounds.max.z,
    });
  });
  const find = (key, direction) => candidates.reduce((best, value) => (
    direction * value[key] > direction * best[key] ? value : best
  ));
  console.log(`\n${type} (${sizeClass}) ${size.x.toFixed(3)} x ${size.z.toFixed(3)}; envelope ${width} x ${depth}`);
  for (const [label, key, direction] of [
    ['minX', 'minX', -1], ['maxX', 'maxX', 1], ['minZ', 'minZ', -1], ['maxZ', 'maxZ', 1],
  ]) {
    const item = find(key, direction);
    const position = new THREE.Vector3();
    item.object.getWorldPosition(position);
    console.log(`  ${label} ${item[key].toFixed(3)}: ${describe(item.object)} at (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`);
  }
}

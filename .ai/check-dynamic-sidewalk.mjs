import * as THREE from 'three';
globalThis.document = { createElement: () => ({ getContext: () => ({ clearRect() {}, fillRect() {}, fillText() {}, measureText: (t) => ({ width: String(t).length * 24 }) }) }) };
const [{ LANDMARKS, ALL_TYPES }, { LANDMARK_LOTS, LOT_SIDEWALK_WIDTH }, { lotsFor, selectLot }, { makeRng }, { developedLotEnvelope }, { buildRoadGraph }] = await Promise.all([
  import('../src/config/landmarks.js'), import('../src/config/town.js'), import('../src/buildings/index.js'),
  import('../src/core/rng.js'), import('../src/world/roads.js'), import('../src/world/graph.js'),
]);
const graph = buildRoadGraph();
const overlaps = [];
const roadIntrusions = [];
for (const type of ALL_TYPES) for (const lot of [selectLot(type, new Set())]) {
  const def = LANDMARKS[type];
  const modelLot = { ...lot, size: [...(lot.buildSize || lot.size)] };
  const model = (def.factory || def.fallback)({ size: modelLot.size, sign: def.sign, type, rng: makeRng(20260825), lot: modelLot });
  const holder = new THREE.Group(); holder.position.set(lot.pos[0], 0, lot.pos[1]); holder.rotation.y = lot.rot; holder.add(model); holder.updateMatrixWorld(true);
  const envelope = developedLotEnvelope(holder, lot, LOT_SIDEWALK_WIDTH);
  const inv = holder.matrixWorld.clone().invert();
  const centre = new THREE.Vector3(envelope.pos[0], 0, envelope.pos[1]).applyMatrix4(inv);
  const [w, d] = envelope.size; const s = LOT_SIDEWALK_WIDTH;
  const sides = [
    new THREE.Box3(new THREE.Vector3(centre.x-w/2,0,centre.z+d/2-s),new THREE.Vector3(centre.x+w/2,.28,centre.z+d/2)),
    new THREE.Box3(new THREE.Vector3(centre.x-w/2,0,centre.z-d/2),new THREE.Vector3(centre.x+w/2,.28,centre.z-d/2+s)),
    new THREE.Box3(new THREE.Vector3(centre.x+w/2-s,0,centre.z-d/2+s),new THREE.Vector3(centre.x+w/2,.28,centre.z+d/2-s)),
    new THREE.Box3(new THREE.Vector3(centre.x-w/2,0,centre.z-d/2+s),new THREE.Vector3(centre.x-w/2+s,.28,centre.z+d/2-s)),
  ];
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    for (let p=o;p;p=p.parent) if(p.name==='station-track-structure') return;
    const box = new THREE.Box3().setFromObject(o);
    const corners = []; for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(new THREE.Vector3(x,y,z).applyMatrix4(inv));
    const local = new THREE.Box3().setFromPoints(corners);
    for (const side of sides) { const hit=local.clone().intersect(side); if(!hit.isEmpty()){ const sz=hit.getSize(new THREE.Vector3()); if(sz.x>1e-4&&sz.y>1e-4&&sz.z>1e-4) overlaps.push(`${type}:${lot.id}`); } }
  });
  // Sample the ring centre-lines; negative means asphalt carriageway.
  const a=lot.rot||0, cos=Math.cos(a), sin=Math.sin(a);
  let minRoad=Infinity;
  for(let i=0;i<=20;i++){const t=i/20;for(const [lx,lz] of [[-w/2+w*t,d/2-s/2],[-w/2+w*t,-d/2+s/2],[w/2-s/2,-d/2+d*t],[-w/2+s/2,-d/2+d*t]]){const x=envelope.pos[0]+lx*cos+lz*sin,z=envelope.pos[1]-lx*sin+lz*cos;minRoad=Math.min(minRoad,graph.distanceToRoad(x,z));}}
  if(minRoad<-.05)roadIntrusions.push({type,lot:lot.id,minRoad:+minRoad.toFixed(2),size:envelope.size.map(n=>+n.toFixed(1))});
}
console.log(JSON.stringify({overlapPlacements:new Set(overlaps).size,roadIntrusions:roadIntrusions.length,worst:roadIntrusions.sort((a,b)=>a.minRoad-b.minRoad).slice(0,30)},null,2));


import * as THREE from 'three';
import { WORLD, LANDMARK_LOTS, RAILWAY, railwayWorldX } from '../config/town.js';
import { buildRoadGraph } from './graph.js';
import { createTerrain, createPaddies, createChannels } from './terrain.js';
import { createRoads, createLotSidewalk } from './roads.js';
import { Occupancy, createScenery, createTreeScatter, createLotDressings } from './scenery.js';
import { createSky, createClouds, createBirds } from './sky.js';

/**
 * WORLD ASSEMBLY
 * --------------
 * Build order matters: the road graph comes first, then everything that must
 * avoid the roads reserves its ground in the Occupancy map, and only then is
 * the loose scenery scattered into whatever space is left.
 */
export function buildWorld(scene, rng, onProgress = () => {}) {
  createSky(scene);
  onProgress(0.1);

  const graph = buildRoadGraph();
  const occ = new Occupancy(graph);

  // The railway viaduct spans the full terrain. Reserve its actual authored
  // corridor before scenery instead of leaving a stale hard-coded strip.
  const stationLot = LANDMARK_LOTS.find((lot) => lot.reservedFor === 'station');
  const railX = railwayWorldX(stationLot);
  const railReserve = RAILWAY.deckWidth / 2 + 2;
  for (let z = -WORLD.size / 2; z <= WORLD.size / 2; z += 6) occ.add(railX, z, railReserve);

  const ground = createTerrain(scene);
  onProgress(0.3);

  const dressings = createLotDressings(scene, rng, occ);
  onProgress(0.4);

  createPaddies(scene, rng, occ);
  createChannels(scene);
  onProgress(0.55);

  createRoads(scene, graph);
  onProgress(0.7);

  const scenery = createScenery(scene, rng, graph, occ);
  onProgress(0.85);

  createTreeScatter(scene, rng, occ, 620);
  onProgress(0.95);

  const clouds = createClouds(scene, rng, 9);
  const birds = createBirds(scene, rng);
  const lotSidewalks = new Map();

  return {
    graph,
    occ,
    ground,
    dressings,
    /** Add the street frontage only when construction has claimed this lot. */
    addLotSidewalk(lot) {
      if (lotSidewalks.has(lot.id)) return lotSidewalks.get(lot.id);
      const sidewalk = createLotSidewalk(scene, graph, lot);
      if (sidewalk) lotSidewalks.set(lot.id, sidewalk);
      return sidewalk;
    },
    /** Restore every developed plot to open ground for an in-place replay. */
    clearLotSidewalks() {
      for (const sidewalk of lotSidewalks.values()) {
        scene.remove(sidewalk);
        sidewalk.geometry.dispose();
      }
      lotSidewalks.clear();
    },
    sceneryStats: scenery.stats,
    update(dt, time) {
      clouds.update(dt);
      birds.update(dt, time);
    },
  };
}

/** Sunlight, sky bounce and fog, tuned for a bright, friendly afternoon. */
export function createLighting(scene, renderer) {
  scene.fog = new THREE.Fog(0xdcecf3, 195, 420);

  const hemi = new THREE.HemisphereLight(0xdff1ff, 0x9ac47f, 1.05);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff3dd, 1.5);
  sun.position.set(58, 78, 44);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 240;
  const extent = 104;
  sun.shadow.camera.left = -extent;
  sun.shadow.camera.right = extent;
  sun.shadow.camera.top = extent;
  sun.shadow.camera.bottom = -extent;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // a soft fill from the opposite side keeps shadowed facades from going muddy
  const fill = new THREE.DirectionalLight(0xcfe6ff, 0.28);
  fill.position.set(-60, 40, -50);
  scene.add(fill);

  // Chromebook integrated GPUs choke on large soft shadow maps
  const lowPower = Math.min(window.screen.width, window.screen.height) <= 800
    || navigator.hardwareConcurrency <= 4;
  if (lowPower) {
    sun.shadow.mapSize.set(1024, 1024);
  }

  // The shadow camera spans 208m, so one texel is ~10cm of world space (~20cm on
  // the low-power map). A normalBias smaller than a texel lets big walls that sit
  // near-parallel to the sun self-shadow, which showed up as a diagonal weave
  // across every large facade. Scaling the bias to the actual texel size removes
  // it at either resolution without visibly detaching contact shadows.
  const texelWorldSize = (extent * 2) / sun.shadow.mapSize.x;
  sun.shadow.normalBias = texelWorldSize * 1.4;

  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  return { hemi, sun, fill };
}

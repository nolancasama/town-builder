import * as THREE from 'three';
import { WORLD } from '../config/town.js';
import { buildRoadGraph } from './graph.js';
import { createTerrain, createPaddies, createChannels } from './terrain.js';
import { createRoads } from './roads.js';
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

  // The railway viaduct runs well past the station lot, so reserve its corridor
  // before anything else is placed under it.
  for (let z = -22; z <= 46; z += 6) occ.add(44, z, 7);

  const ground = createTerrain(scene);
  onProgress(0.3);

  const dressings = createLotDressings(scene, rng, occ);
  onProgress(0.4);

  createPaddies(scene, rng, (x, z, r) => occ.blocked(x, z, r, 3));
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

  return {
    graph,
    occ,
    ground,
    dressings,
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
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
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
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;

  return { hemi, sun, fill };
}

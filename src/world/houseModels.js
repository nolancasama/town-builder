import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * SUBURBAN HOUSE MODELS
 * ---------------------
 * Kenney "City Kit Suburban 2.0" (CC0). Twenty-one house shapes, each a single
 * mesh sharing one small colour-map texture, so the whole neighbourhood costs
 * about 2.4 MB and one material per colourway.
 *
 * The pack also ships three alternate colour maps. Swapping the map per house
 * multiplies twenty-one shapes into eighty-four distinct-looking homes without
 * loading anything more, which is what keeps a street of them from reading as
 * the same house stamped over and over.
 */

const HOUSE_KEYS = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k',
  'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u',
];
const COLOURWAYS = ['colormap.png', 'variation-a.png', 'variation-b.png', 'variation-c.png'];

/** Matches the procedural houses these replace, so scenery spacing is unchanged. */
const WIDTH_MIN = 5;
const WIDTH_MAX = 7.5;

let preloadPromise = null;
let sources = null;
let materials = null;

function publicPath(path) {
  return `${import.meta.env.BASE_URL || './'}${path}`;
}

function pick(rng, values) {
  return rng?.pick ? rng.pick(values) : values[Math.floor(Math.random() * values.length)];
}

function range(rng, min, max) {
  return rng?.range ? rng.range(min, max) : min + Math.random() * (max - min);
}

/**
 * Fetch the house library once. Resolves false on failure so world building
 * continues with the procedural houses rather than leaving empty blocks.
 */
export function preloadHouseModels() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const controller = new AbortController();
    let timeout;
    try {
      // Every .glb points at "Textures/colormap.png" alongside itself, so the
      // parse needs that directory or the houses arrive untextured white.
      const resourcePath = publicPath('assets/buildings/suburban/');
      const load = async (key) => {
        const path = `assets/buildings/suburban/building-type-${key}.glb`;
        const response = await fetch(publicPath(path), {
          cache: 'force-cache',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return loader.parseAsync(await response.arrayBuffer(), resourcePath);
      };
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('House preload timed out after 8 seconds.'));
        }, 8000);
      });
      const assets = await Promise.race([Promise.all(HOUSE_KEYS.map(load)), deadline]);

      sources = new Map();
      let template = null;
      HOUSE_KEYS.forEach((key, index) => {
        const scene = assets[index].scene;
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        const size = bounds.getSize(new THREE.Vector3());
        if (!(size.x > 0) || !(size.z > 0)) throw new Error(`building-type-${key} has invalid bounds`);
        scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = true;
          object.receiveShadow = true;
          if (!template) template = object.material;
        });
        sources.set(key, { scene, bounds, size });
      });
      if (!template) throw new Error('no house mesh material found');

      // One material per colourway, shared by every instance using it.
      materials = await Promise.all(COLOURWAYS.map(async (file) => {
        if (file === 'colormap.png') return template;
        const texture = await textureLoader.loadAsync(publicPath(`assets/buildings/suburban/Textures/${file}`));
        // Match the glTF texture's own sampling, or the swap shifts every UV.
        texture.flipY = template.map.flipY;
        texture.colorSpace = template.map.colorSpace;
        texture.wrapS = template.map.wrapS;
        texture.wrapT = template.map.wrapT;
        texture.magFilter = template.map.magFilter;
        texture.minFilter = template.map.minFilter;
        texture.needsUpdate = true;
        const material = template.clone();
        material.map = texture;
        return material;
      }));
      return true;
    } catch (error) {
      controller.abort();
      sources = null;
      materials = null;
      console.warn('[houses] Kenney suburban assets unavailable; using procedural houses.', error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();
  return preloadPromise;
}

export function houseModelsReady() {
  return Boolean(sources && materials);
}

/**
 * One suburban house, scaled to the footprint the procedural houses used and
 * standing on y = 0. Returns null when the library is unavailable.
 */
export function createHouseModel(rng) {
  if (!sources || !materials) return null;
  const key = pick(rng, HOUSE_KEYS);
  const source = sources.get(key);

  const group = new THREE.Group();
  const model = source.scene.clone(true);
  const material = pick(rng, materials);
  model.traverse((object) => {
    if (object.isMesh) object.material = material;
  });

  const scale = range(rng, WIDTH_MIN, WIDTH_MAX) / source.size.x;
  model.scale.setScalar(scale);
  // Centre the footprint on the group and sit it on the ground, so scenery can
  // keep positioning houses by their centre point.
  const centre = source.bounds.getCenter(new THREE.Vector3());
  model.position.set(-centre.x * scale, -source.bounds.min.y * scale, -centre.z * scale);
  group.add(model);

  group.userData.footprint = Math.max(source.size.x, source.size.z) * scale;
  group.userData.houseModel = key;
  return group;
}

export const HOUSE_MODEL_KEYS = HOUSE_KEYS;

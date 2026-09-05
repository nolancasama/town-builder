import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const CHARACTER_FILES = [
  ['m_casual', 'm_casual.glb'],
  ['m_hoodie', 'm_hoodie.glb'],
  ['m_suit', 'm_suit.glb'],
  ['m_worker', 'm_worker.glb'],
  ['f_casual', 'f_casual.glb'],
  ['f_formal', 'f_formal.glb'],
  ['f_suit', 'f_suit.glb'],
  ['f_worker', 'f_worker.glb'],
];

const SKIN_TONES = [0xf7d9bd, 0xf0c9a0, 0xdaa87a, 0xb07a4e, 0x8a5a34, 0x5f3a20, 0x412718];
const HAIR_COLOURS = [0x171514, 0x2b211c, 0x4a3728, 0x6b4a2f, 0xa06b3d, 0xd1ad61, 0x77716c];
const CLOTHING_COLOURS = [
  0x39557a, 0x4a90d9, 0x57c07b, 0xe05c4b, 0xf4a259, 0xffd166,
  0x9b7ede, 0x2f7f9e, 0x6b7c8c, 0xb86f52, 0xe6a5b1, 0xede5d4,
];
const CLOTHING_MATERIALS = new Set([
  'white', 'grey', 'gray', 'brown', 'orange', 'red', 'blue', 'green',
  'yellow', 'purple', 'pink', 'navy', 'black', 'gold', 'lightblue',
  'limegreen', 'darkbrown', 'lightbrown', 'brown2', 'brown_02', 'red_dark',
  'shirt', 'pants', 'trousers', 'jacket', 'hoodie', 'suit', 'overalls',
  'clothes', 'clothing', 'tie',
]);
// Safety gear reads as safety gear precisely because it is never recoloured.
const UNIFORM_MATERIALS = new Set(['worker_vest', 'worker_yellow']);
const MODEL_HAIR_MATERIALS = {
  m_worker: new Set(['moustache']),
  f_formal: new Set(['lightbrown']),
  f_worker: new Set(['brown', 'darkbrown']),
};
const TARGET_HEIGHT = 1.95;

let preloadPromise = null;
let sources = null;
let clips = null;

function publicPath(path) {
  return `${import.meta.env.BASE_URL || './'}${path}`;
}

function pick(rng, values) {
  return rng?.pick ? rng.pick(values) : values[Math.floor(Math.random() * values.length)];
}

function range(rng, min, max) {
  return rng?.range ? rng.range(min, max) : min + Math.random() * (max - min);
}

function tintKind(name = '', modelKey = '') {
  const normalized = name.toLowerCase().replace(/[ .-]+/g, '_');
  if (UNIFORM_MATERIALS.has(normalized)) return null;
  if (normalized === 'skin_darker') return 'skinShadow';
  if (normalized.includes('skin')) return 'skin';
  if (normalized.includes('hair') || normalized === 'eyebrows') return 'hair';
  if (MODEL_HAIR_MATERIALS[modelKey]?.has(normalized)) return 'hair';
  if (CLOTHING_MATERIALS.has(normalized)) return 'clothing';
  if ([...CLOTHING_MATERIALS].some((part) => normalized.includes(`${part}_`) || normalized.endsWith(`_${part}`))) {
    return 'clothing';
  }
  return null;
}

/**
 * Recolour a character without flattening it. Clothing keeps each material's
 * own tone and only rotates hue, so a dark shoe stays dark and a white shirt
 * stays light while the person still reads as different from their neighbour -
 * tinting every garment one picked colour turns the crowd into mannequins.
 */
function varyMaterials(root, rng, modelKey, {
  clothingColor = null,
  skinColor = null,
  hairColor = null,
} = {}) {
  const skinTone = skinColor ?? pick(rng, SKIN_TONES);
  const hairColour = hairColor ?? pick(rng, HAIR_COLOURS);
  const hueShift = range(rng, 0, 1);
  const neutralHue = new THREE.Color(clothingColor ?? pick(rng, CLOTHING_COLOURS));
  const variants = new Map();
  const hsl = {};
  const neutralHsl = {};
  neutralHue.getHSL(neutralHsl);

  const variant = (material) => {
    const kind = material?.color ? tintKind(material.name, modelKey) : null;
    if (!kind) return material;
    if (!variants.has(material)) {
      const clone = material.clone();
      if (kind === 'skin') {
        clone.color.setHex(skinTone);
      } else if (kind === 'skinShadow') {
        clone.color.setHex(skinTone).multiplyScalar(0.82);
      } else if (kind === 'hair') {
        clone.color.setHex(hairColour);
      } else {
        clone.color.getHSL(hsl);
        if (clothingColor !== null) {
          clone.color.setHSL(neutralHsl.h, Math.max(hsl.s, neutralHsl.s * 0.75), hsl.l);
        // Near-neutral garments have no hue to rotate, so lend them a soft one.
        } else if (hsl.s < 0.12) clone.color.setHSL(neutralHsl.h, 0.16, hsl.l);
        else clone.color.setHSL((hsl.h + hueShift) % 1, hsl.s, hsl.l);
      }
      variants.set(material, clone);
    }
    return variants.get(material);
  };

  root.traverse((object) => {
    if (!object.isMesh) return;
    if (Array.isArray(object.material)) object.material = object.material.map(variant);
    else object.material = variant(object.material);
  });
}

/**
 * Fetch and decode the shared character library once. A failed request resolves
 * to false so startup can continue with the procedural classroom-safe fallback.
 */
export function preloadCharacterModels() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const draco = new DRACOLoader();
    draco.setDecoderPath(publicPath('assets/draco/'));
    draco.setDecoderConfig({ type: 'wasm' });
    draco.setWorkerLimit(2);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const controller = new AbortController();
    let timeout;
    try {
      const load = async (path) => {
        const response = await fetch(publicPath(path), {
          cache: 'force-cache',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
        return loader.parseAsync(await response.arrayBuffer(), '');
      };
      const requests = [
        load('assets/characters/animations.glb'),
        ...CHARACTER_FILES.map(([, file]) => load(`assets/characters/${file}`)),
      ];
      const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error('Character preload timed out after 8 seconds.'));
        }, 8000);
      });
      const loaded = await Promise.race([Promise.all(requests), deadline]);
      const [animationAsset, ...characterAssets] = loaded;
      clips = new Map(animationAsset.animations.map((clip) => [clip.name, clip]));
      for (const required of ['Idle', 'Idle_Neutral', 'Walk', 'Run', 'Wave']) {
        if (!clips.has(required)) throw new Error(`animations.glb is missing ${required}`);
      }

      sources = new Map();
      CHARACTER_FILES.forEach(([key], index) => {
        const scene = characterAssets[index].scene;
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        const height = bounds.max.y - bounds.min.y;
        if (!Number.isFinite(height) || height <= 0) throw new Error(`${key} has invalid bounds`);
        scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
        });
        sources.set(key, { scene, bounds, height });
      });
      return true;
    } catch (error) {
      controller.abort();
      sources = null;
      clips = null;
      console.warn('[characters] Quaternius assets unavailable; using procedural people.', error);
      return false;
    } finally {
      clearTimeout(timeout);
      draco.dispose();
    }
  })();
  return preloadPromise;
}

export function characterModelsReady() {
  return Boolean(sources && clips);
}

/** Return a skinned, independently animated instance from the preloaded cache. */
export function createCharacterModel(rng, {
  model = null,
  camera = null,
  clothingColor = null,
  skinColor = null,
  hairColor = null,
} = {}) {
  if (!sources || !clips) return null;
  const key = model && sources.has(model) ? model : pick(rng, CHARACTER_FILES)[0];
  const source = sources.get(key);
  const character = new THREE.Group();
  const content = new THREE.Group();
  const clonedScene = SkeletonUtils.clone(source.scene);
  const targetHeight = TARGET_HEIGHT * range(rng, 0.96, 1.04);
  const scale = targetHeight / source.height;
  const centre = source.bounds.getCenter(new THREE.Vector3());

  content.scale.setScalar(scale);
  content.position.x = -centre.x * scale;
  content.position.y = -source.bounds.min.y * scale;
  content.position.z = -centre.z * scale;
  content.add(clonedScene);
  character.add(content);
  varyMaterials(clonedScene, rng, key, { clothingColor, skinColor, hairColor });

  const mixer = new THREE.AnimationMixer(character);
  let currentAction = null;
  let currentName = null;
  let animationAccumulator = 0;
  const actions = new Map();
  const actionFor = (name) => {
    if (!actions.has(name)) actions.set(name, mixer.clipAction(clips.get(name)));
    return actions.get(name);
  };

  const play = (name, { fade = 0.18, timeScale = 1 } = {}) => {
    if (!clips.has(name)) return false;
    if (currentName === name) {
      currentAction.setEffectiveTimeScale(timeScale);
      return true;
    }
    const next = actionFor(name);
    next.reset().setEffectiveTimeScale(timeScale).play();
    if (currentAction && fade > 0) currentAction.crossFadeTo(next, fade, false);
    else if (currentAction) currentAction.stop();
    currentAction = next;
    currentName = name;
    return true;
  };

  const idleClip = pick(rng, ['Idle', 'Idle_Neutral']);
  const animationPoint = new THREE.Vector3();
  const updateAnimation = (dt) => {
    animationAccumulator = Math.min(0.2, animationAccumulator + dt);
    if (camera) {
      camera.updateMatrixWorld();
      character.getWorldPosition(animationPoint);
      animationPoint.y += 1;
      const far = camera.position.distanceToSquared(animationPoint) > 45 * 45;
      animationPoint.project(camera);
      const onScreen = animationPoint.z >= -1 && animationPoint.z <= 1
        && Math.abs(animationPoint.x) <= 1.05 && Math.abs(animationPoint.y) <= 1.05;
      if (!onScreen || (far && animationAccumulator < 0.1)) return;
    }
    mixer.update(animationAccumulator);
    animationAccumulator = 0;
  };
  character.name = `quaternius-${key}`;
  character.userData = {
    ...character.userData,
    isCharacterModel: true,
    modelKey: key,
    mixer,
    head: character.getObjectByName('Head'),
    baseY: 0.3,
    idleClip,
    playAnimation: play,
    updateAnimation,
    currentAnimation: () => currentName,
  };
  play(idleClip, { fade: 0 });
  mixer.update(0);
  return character;
}

export const CHARACTER_MODEL_KEYS = CHARACTER_FILES.map(([key]) => key);

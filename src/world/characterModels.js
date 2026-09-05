import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * CHARACTER MODELS
 * ----------------
 * Kenney "Blocky Characters 2.0" (CC0). Each file is a seven-node hierarchy -
 * root, torso, head, two arms, two legs - animated by node transforms rather
 * than a skeleton, so there is no skinning, no bone palette and no Draco
 * decoder to ship. Every file carries its own copy of the shared clip set.
 *
 * Ordinary townspeople make up the common cast. The costumed characters - a
 * zombie, orcs, robot knights, a ninja, a vampire, a pirate - are drawn rarely
 * and only for ambient street pedestrians, never for the child's own avatar.
 */

const COMMON_KEYS = ['a', 'b', 'e', 'f', 'i', 'j', 'k', 'm', 'q'];
const RARE_KEYS = ['c', 'd', 'g', 'h', 'l', 'n', 'o', 'p', 'r'];
const ALL_KEYS = [...COMMON_KEYS, ...RARE_KEYS];

/** Roughly one passer-by in twelve is a surprise. */
const RARE_CHANCE = 1 / 12;

export const CLIP = {
  idle: 'idle',
  walk: 'walk',
  run: 'sprint',
  cheer: 'emote-yes',
};
const REQUIRED_CLIPS = [CLIP.idle, CLIP.walk, CLIP.run, CLIP.cheer];

/** Matches the procedural people these replaced, so the town scale is unchanged. */
const TARGET_HEIGHT = 1.95;

let preloadPromise = null;
let sources = null;

function publicPath(path) {
  return `${import.meta.env.BASE_URL || './'}${path}`;
}

function pick(rng, values) {
  return rng?.pick ? rng.pick(values) : values[Math.floor(Math.random() * values.length)];
}

function range(rng, min, max) {
  return rng?.range ? rng.range(min, max) : min + Math.random() * (max - min);
}

function chance(rng, probability) {
  const roll = rng?.chance ? rng.chance(probability) : Math.random() < probability;
  return Boolean(roll);
}

/**
 * Fetch and decode the character library once. A failed request resolves to
 * false so startup can continue with the procedural classroom-safe fallback.
 */
export function preloadCharacterModels() {
  if (preloadPromise) return preloadPromise;
  preloadPromise = (async () => {
    const loader = new GLTFLoader();
    const controller = new AbortController();
    let timeout;
    try {
      // These .glb files reference their texture externally as
      // "Textures/texture-<key>.png", so the parse needs the directory they sit
      // in - passing '' leaves every character untextured white.
      const resourcePath = publicPath('assets/characters/');
      const load = async (key) => {
        const path = `assets/characters/character-${key}.glb`;
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
          reject(new Error('Character preload timed out after 8 seconds.'));
        }, 8000);
      });
      const assets = await Promise.race([
        Promise.all(ALL_KEYS.map(load)),
        deadline,
      ]);

      sources = new Map();
      ALL_KEYS.forEach((key, index) => {
        const asset = assets[index];
        const clips = new Map(asset.animations.map((clip) => [clip.name, clip]));
        for (const required of REQUIRED_CLIPS) {
          if (!clips.has(required)) throw new Error(`character-${key} is missing the ${required} clip`);
        }
        const scene = asset.scene;
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(scene);
        const height = bounds.max.y - bounds.min.y;
        if (!Number.isFinite(height) || height <= 0) throw new Error(`character-${key} has invalid bounds`);
        scene.traverse((object) => {
          if (!object.isMesh) return;
          object.castShadow = false;
          object.receiveShadow = false;
        });
        sources.set(key, { scene, clips, bounds, height });
      });
      return true;
    } catch (error) {
      controller.abort();
      sources = null;
      console.warn('[characters] Kenney assets unavailable; using procedural people.', error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  })();
  return preloadPromise;
}

export function characterModelsReady() {
  return Boolean(sources);
}

function chooseKey(rng, { model, allowRare }) {
  if (model && sources.has(model)) return model;
  if (allowRare && chance(rng, RARE_CHANCE)) return pick(rng, RARE_KEYS);
  return pick(rng, COMMON_KEYS);
}

/**
 * An independently animated instance from the preloaded cache.
 *
 * @param allowRare only ambient street pedestrians opt in - the guide, the
 * portrait, the opening local and the tour group stay ordinary people.
 */
export function createCharacterModel(rng, {
  model = null,
  camera = null,
  allowRare = false,
} = {}) {
  if (!sources) return null;
  const key = chooseKey(rng, { model, allowRare });
  const source = sources.get(key);

  const character = new THREE.Group();
  const content = new THREE.Group();
  // Plain clone: without a skeleton there is nothing for SkeletonUtils to rebind,
  // and sharing geometry and materials by reference is what keeps a crowd cheap.
  const clonedScene = source.scene.clone(true);
  const targetHeight = TARGET_HEIGHT * range(rng, 0.96, 1.04);
  const scale = targetHeight / source.height;
  const centre = source.bounds.getCenter(new THREE.Vector3());

  content.scale.setScalar(scale);
  content.position.x = -centre.x * scale;
  content.position.y = -source.bounds.min.y * scale;
  content.position.z = -centre.z * scale;
  content.add(clonedScene);
  character.add(content);

  const mixer = new THREE.AnimationMixer(character);
  let currentAction = null;
  let currentName = null;
  let animationAccumulator = 0;
  const actions = new Map();
  const actionFor = (name) => {
    if (!actions.has(name)) actions.set(name, mixer.clipAction(source.clips.get(name)));
    return actions.get(name);
  };

  const play = (name, { fade = 0.18, timeScale = 1 } = {}) => {
    if (!source.clips.has(name)) return false;
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

  // Some clips carry root translation - character j's walk lifts it 0.18m, which
  // reads as floating above the pavement. The game owns where a person stands,
  // so the clip only gets to rotate the root, never move it.
  const rootNode = clonedScene.getObjectByName('root');
  const rootRest = rootNode ? rootNode.position.clone() : null;

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
    if (rootRest) rootNode.position.copy(rootRest);
    animationAccumulator = 0;
  };

  character.name = `kenney-character-${key}`;
  character.userData = {
    ...character.userData,
    isCharacterModel: true,
    modelKey: key,
    isRareCharacter: RARE_KEYS.includes(key),
    mixer,
    head: clonedScene.getObjectByName('head'),
    armLeft: clonedScene.getObjectByName('arm-left'),
    armRight: clonedScene.getObjectByName('arm-right'),
    torso: clonedScene.getObjectByName('torso'),
    baseY: 0.3,
    idleClip: CLIP.idle,
    playAnimation: play,
    updateAnimation,
    currentAnimation: () => currentName,
  };
  play(CLIP.idle, { fade: 0 });
  mixer.update(0);
  if (rootRest) rootNode.position.copy(rootRest);
  return character;
}

export const CHARACTER_MODEL_KEYS = ALL_KEYS;
export const COMMON_MODEL_KEYS = COMMON_KEYS;
export const RARE_MODEL_KEYS = RARE_KEYS;

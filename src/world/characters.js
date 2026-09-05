import * as THREE from 'three';
import { PALETTE as P, mat, roundedBox, box, sphere, cylinder, mesh } from '../core/materials.js';
import { createCharacterModel } from './characterModels.js';

/**
 * TOUR CHARACTERS
 * ---------------
 * The guide, visitors and opening local use the shared Quaternius skeleton and
 * clips. The lightweight procedural rig remains the classroom-safe fallback
 * when those assets cannot be loaded.
 */

/* A deliberately broad range, so the group reads as international visitors
 * without leaning on any national costume or caricature. */
const SKINS = [0xf7d9bd, 0xf0c9a0, 0xdaa87a, 0xb07a4e, 0x8a5a34, 0x5f3a20, 0x412718];
const HAIRS = [0x2b2b2b, 0x1f1f24, 0x4a3728, 0x6b4a2f, 0xe8c87a, 0xc9a227, 0x8d6b4a, 0x9a9a9a, 0xd94f4f];
const TOPS = [
  0x4a90d9, 0xe05c4b, 0x57c07b, 0xffd166, 0x9b7ede, 0xf4a259,
  0xffffff, 0x39557a, 0x2fa39a, 0xef7d57, 0xf3cfcf, 0x6b7c8c,
];
const BOTTOMS = [0x39557a, 0x4c5b6b, 0x8a6340, 0x2f3640, 0x6b7c8c, 0x5b6f8a, 0xb0a08a];

/** Shared rig: body, turnable head with a mouth, four limb pivots. */
function buildBody({ skin, top, bottom, height = 1, build = 1 }) {
  const g = new THREE.Group();
  const skinMat = mat(skin);
  const topMat = mat(top);
  const bottomMat = mat(bottom);

  g.add(mesh(roundedBox(0.62 * build, 0.85, 0.42 * build, 0.18), topMat, { y: 1.12, receive: false }));

  // head on a pivot so it can turn without the body following
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0);
  head.add(mesh(sphere(0.3, 10, 7), skinMat, { y: 0.16, receive: false }));
  const mouth = mesh(box(0.17, 0.07, 0.06), mat(0x5a3129), {
    y: 0.06, z: 0.29, cast: false, receive: false,
  });
  head.add(mouth);
  // eyes, so there is a front to face - and something to blink
  const eyes = [];
  for (const sx of [-0.11, 0.11]) {
    const eye = mesh(sphere(0.045, 6, 5), mat(0x2b2b2b), { x: sx, y: 0.2, z: 0.27, cast: false, receive: false });
    eyes.push(eye);
    head.add(eye);
  }
  g.add(head);

  const legs = [];
  for (const sx of [-0.16, 0.16]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * build, 0.72, 0);
    pivot.add(mesh(box(0.22, 0.72, 0.24), bottomMat, { y: -0.36, receive: false }));
    g.add(pivot);
    legs.push(pivot);
  }
  const arms = [];
  for (const sx of [-0.4, 0.4]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx * build, 1.5, 0);
    pivot.add(mesh(box(0.16, 0.62, 0.18), topMat, { y: -0.31, cast: false, receive: false }));
    g.add(pivot);
    arms.push(pivot);
  }

  g.scale.setScalar(height);
  g.userData = {
    legs, arms, head, mouth, eyes,
    phase: Math.random() * 6.28,
    mouthLevel: 0,
    headTurn: 0,
    pointAmount: 0,
    cameraUp: 0,
    baseY: 0.3,
  };
  return g;
}

/** Hair, in several silhouettes so nobody is a clone of anybody else. */
function addHair(g, rng, colour, forcedStyle = null) {
  const head = g.userData.head;
  const hairMat = mat(colour);
  const style = forcedStyle || rng.pick(['crop', 'crop', 'bob', 'long', 'bun', 'ponytail', 'cap']);

  if (style === 'cap') return; // a hat goes on instead
  const capHair = mesh(sphere(0.32, 10, 6), hairMat, { y: 0.22, cast: false, receive: false });
  capHair.scale.y = 0.6;
  head.add(capHair);

  if (style === 'bob' || style === 'long') {
    const length = style === 'long' ? 0.62 : 0.36;
    const fall = mesh(box(0.56, length, 0.42), hairMat, { y: 0.16 - length / 2, z: -0.05, cast: false, receive: false });
    head.add(fall);
  }
  if (style === 'bun') {
    head.add(mesh(sphere(0.16, 8, 6), hairMat, { y: 0.34, z: -0.22, cast: false, receive: false }));
  }
  if (style === 'ponytail') {
    const tail = mesh(box(0.16, 0.5, 0.16), hairMat, { y: 0.02, z: -0.3, cast: false, receive: false });
    tail.rotation.x = 0.3;
    head.add(tail);
  }
}

/* ------------------------------------------------------------------ *
 * The guide
 * ------------------------------------------------------------------ */

const GUIDE_MODELS = ['m_casual', 'm_hoodie', 'f_casual', 'f_formal'];

/** Keep an accessory in real-world metres while parenting it to a rig bone. */
function attachWorldSized(character, bone, accessory, offset) {
  character.updateMatrixWorld(true);
  const position = bone.getWorldPosition(new THREE.Vector3()).add(offset);
  character.worldToLocal(position);
  character.add(accessory);
  accessory.position.copy(position);
  character.updateMatrixWorld(true);
  bone.attach(accessory);
  return accessory;
}

function configureSkinnedPose(character) {
  const d = character.userData;
  d.phase = Math.random() * Math.PI * 2;
  d.mouthLevel = 0;
  d.talkLevel = 0;
  d.pointAmount = 0;
  d.eyes = [];
  d.arms = [
    character.getObjectByName('UpperArmL'),
    character.getObjectByName('UpperArmR'),
  ];
  d.torso = character.getObjectByName('Chest') || character.getObjectByName('Spine');
}

function addGuideAccessories(character, { mouth = false } = {}) {
  const head = character.userData.head;
  const wrist = character.getObjectByName('WristL');

  if (head) {
    const cap = new THREE.Group();
    cap.name = 'guide-cap';
    const crown = mesh(sphere(0.18, 10, 6), mat(0xe8b23a), {
      cast: false, receive: false,
    });
    crown.scale.y = 0.58;
    cap.add(crown);
    cap.add(mesh(box(0.32, 0.035, 0.16), mat(0xe8b23a), {
      y: -0.035, z: 0.11, cast: false, receive: false,
    }));
    attachWorldSized(character, head, cap, new THREE.Vector3(0, 0.2, 0));
    character.userData.cap = cap;

    if (mouth) {
      // Sized against this model's head rather than the procedural sphere: the
      // portrait is a close-up, so anything wider reads as a bandana across the
      // whole lower face rather than a mouth.
      const mouthMesh = mesh(box(0.045, 0.011, 0.01), mat(0x5a3129), {
        cast: false, receive: false,
      });
      mouthMesh.name = 'portrait-mouth';
      attachWorldSized(character, head, mouthMesh, new THREE.Vector3(0, 0.055, 0.15));
      character.userData.mouth = mouthMesh;
      character.userData.mouthBaseScale = mouthMesh.scale.clone();
      character.userData.mouthBasePosition = mouthMesh.position.clone();
    }
  }

  if (wrist) {
    const flag = new THREE.Group();
    flag.name = 'guide-flag';
    // Pole runs upward from the wrist; base at local y=0, top at y=1.05.
    // The pole cylinder's own centre is at y=0.525 (half of 1.05 length).
    flag.add(mesh(cylinder(0.018, 0.018, 1.05, 6), mat(0xd9d3c4), {
      y: 0.525, cast: false, receive: false,
    }));
    const cloth = mesh(box(0.38, 0.28, 0.022), mat(0xef476f), {
      x: 0.19, y: 0.97, cast: false, receive: false,
    });
    flag.add(cloth);
    // Attach to wrist with no world offset so it starts in the hand,
    // then nudge in wrist-local space: forward (z) so pole is in front of fist.
    attachWorldSized(character, wrist, flag, new THREE.Vector3());
    flag.position.z += 0.04;   // slight forward nudge in wrist-local space
    flag.position.y -= 0.05;   // base of pole at the grip
    character.userData.flag = flag;
    character.userData.flagCloth = cloth;
    character.userData.flagArm = character.getObjectByName('UpperArmL');
  }
  // Bag and strap are deliberately omitted: the world-unit offsets from the
  // procedural rig land in empty air on the skeletal model, and the cap+flag
  // are already enough to make the guide readable in a crowd.
}

/**
 * The child's avatar. Deliberately easy to pick out of the group in a wide
 * shot - one strong uniform colour, a cap, a shoulder bag and a little raised
 * flag - but an ordinary friendly person, not a mascot.
 */
export function guideSpec(rng) {
  return {
    model: rng.pick(GUIDE_MODELS),
    skin: rng.pick(SKINS),
    hair: rng.pick(HAIRS),
    hairStyle: rng.pick(['crop', 'bob', 'long', 'bun', 'ponytail']),
  };
}

/**
 * @param spec keeps the world guide and the portrait guide identical - they are
 * two models of the same person, which is the whole point of the cut-in.
 */
export function makeGuide(rng, spec = null, options = {}) {
  const sourceLook = spec || guideSpec(rng);
  const look = {
    ...sourceLook,
    model: sourceLook.model || rng.pick(GUIDE_MODELS),
  };
  const uniform = 0x2f7f9e;
  const procedural = options.procedural === true;

  if (procedural) {
    // Original procedural guide build (fallback)
    const g = buildBody({
      skin: look.skin,
      top: uniform,
      bottom: 0x33455c,
      height: 1.06,
    });
    addHair(g, rng, look.hair, look.hairStyle);
    g.userData.spec = look;

    const head = g.userData.head;
    const cap = mesh(sphere(0.33, 10, 6), mat(0xe8b23a), { y: 0.24, cast: false, receive: false });
    cap.scale.y = 0.52;
    head.add(cap);
    head.add(mesh(box(0.46, 0.05, 0.26), mat(0xe8b23a), { y: 0.3, z: 0.28, cast: false, receive: false }));

    const bag = mesh(roundedBox(0.42, 0.4, 0.22, 0.08), mat(0xb0763a), { x: 0.34, y: 0.95, z: -0.06, receive: false });
    g.add(bag);
    const strap = mesh(box(0.08, 0.62, 0.1), mat(0x8a5a2c), { x: 0.1, y: 1.28, z: -0.02, cast: false, receive: false });
    strap.rotation.z = -0.5;
    g.add(strap);

    const flag = new THREE.Group();
    flag.position.set(0, -0.55, 0.06);
    flag.add(mesh(cylinder(0.028, 0.028, 1.5, 6), mat(0xd9d3c4), { y: 0.55, cast: false, receive: false }));
    const cloth = mesh(box(0.44, 0.3, 0.02), mat(0xef476f), { x: 0.23, y: 1.16, cast: false, receive: false });
    flag.add(cloth);
    g.userData.arms[0].add(flag);
    g.userData.flagCloth = cloth;
    g.userData.isGuide = true;
    return g;
  }

  const character = createCharacterModel(rng, {
    model: look.model,
    camera: options.camera || null,
    clothingColor: uniform,
    skinColor: look.skin,
    hairColor: look.hair,
  });
  if (character) {
    character.userData.spec = look;
    configureSkinnedPose(character);
    addGuideAccessories(character, { mouth: options.portrait === true });
    character.userData.isGuide = true;
    return character;
  }

  // Fallback to procedural if model loading fails
  return makeGuide(rng, spec, { procedural: true });
}

/* ------------------------------------------------------------------ *
 * Tourists
 * ------------------------------------------------------------------ */

/**
 * One visitor. Skin, hair, height, build, clothes and accessory are all drawn
 * independently, so a group of six reads as a varied set of people rather than
 * six recolours of one model.
 */
function makeProceduralTourist(rng) {
  const g = buildBody({
    skin: rng.pick(SKINS),
    top: rng.pick(TOPS),
    bottom: rng.pick(BOTTOMS),
    height: rng.range(0.82, 1.14),
    build: rng.range(0.92, 1.12),
  });
  const hairColour = rng.pick(HAIRS);
  addHair(g, rng, hairColour);
  const head = g.userData.head;

  // one accessory each, not four
  const accessory = rng.pick(['camera', 'camera', 'phone', 'backpack', 'bag', 'hat', 'map']);
  if (accessory === 'hat') {
    const brim = mesh(cylinder(0.42, 0.42, 0.04, 12), mat(rng.pick([0xf3e6cf, 0xef7d57, 0xffffff])), {
      y: 0.3, cast: false, receive: false,
    });
    head.add(brim);
    head.add(mesh(cylinder(0.24, 0.26, 0.2, 10), mat(0xf3e6cf), { y: 0.38, cast: false, receive: false }));
  }
  if (accessory === 'backpack') {
    g.add(mesh(roundedBox(0.44, 0.55, 0.26, 0.1), mat(rng.pick([0xe05c4b, 0x4a90d9, 0x57c07b])), {
      y: 1.16, z: -0.32, receive: false,
    }));
  }
  if (accessory === 'bag') {
    g.add(mesh(roundedBox(0.36, 0.34, 0.18, 0.07), mat(rng.pick([0xb0763a, 0x9b7ede, 0x39557a])), {
      x: 0.36, y: 0.98, receive: false,
    }));
  }

  // a camera or phone lives in the right hand so it can be raised to shoot
  if (accessory === 'camera' || accessory === 'phone') {
    const held = new THREE.Group();
    held.position.set(0, -0.62, 0.12);
    if (accessory === 'camera') {
      held.add(mesh(roundedBox(0.34, 0.24, 0.2, 0.05), mat(0x33414d), { cast: false, receive: false }));
      const lens = mesh(cylinder(0.09, 0.09, 0.12, 8), mat(0x1f272e), { z: 0.14, cast: false, receive: false });
      lens.rotation.x = Math.PI / 2;
      held.add(lens);
    } else {
      held.add(mesh(box(0.16, 0.3, 0.04), mat(0x2b3542), { cast: false, receive: false }));
    }
    g.userData.arms[1].add(held);
    g.userData.camera = held;
    g.userData.shoots = true;
  }
  if (accessory === 'map') {
    const map = mesh(box(0.42, 0.3, 0.02), mat(0xf7f0dc), { y: -0.6, z: 0.16, cast: false, receive: false });
    map.rotation.x = -0.5;
    g.userData.arms[1].add(map);
  }
  return g;
}

/* Visitors on a sightseeing tour dress for a day out: no hi-vis work gear and no
 * business suits, both of which belong on the townspeople going about their day
 * rather than on the group being shown round. */
const TOURIST_MODELS = ['m_casual', 'm_hoodie', 'f_casual', 'f_formal'];

export function makeTourist(rng, options = {}) {
  const model = options.model || rng.pick(TOURIST_MODELS);
  return createCharacterModel(rng, { ...options, model }) || makeProceduralTourist(rng);
}

/**
 * The outspoken local who opens the game.  He deliberately shares the same
 * simple body rig as the tour cast, but none of the guide's cap, flag or bag:
 * that silhouette belongs to the child later in the game.
 */
function makeProceduralTownLocal(rng) {
  const g = buildBody({
    skin: rng.pick(SKINS),
    top: 0xe66a45,
    bottom: 0x39557a,
    height: 1.08,
    build: 1.06,
  });
  addHair(g, rng, rng.pick([0x1f1f24, 0x2b2b2b, 0x4a3728]), 'crop');

  // A plain neckerchief gives him his own readable splash of colour without
  // borrowing any of the guide/tourist accessories.
  const scarf = mesh(box(0.42, 0.12, 0.08), mat(0xffd166), {
    y: 1.48, z: 0.22, cast: false, receive: false,
  });
  scarf.rotation.x = -0.12;
  g.add(scarf);
  g.userData.isTownLocal = true;
  return g;
}

export function makeTownLocal(rng, options = {}) {
  if (options.procedural !== true) {
    const character = createCharacterModel(rng, {
      model: 'm_hoodie',
      camera: options.camera || null,
      clothingColor: 0xe66a45,
    });
    if (character) {
      configureSkinnedPose(character);
      character.userData.isTownLocal = true;
      return character;
    }
  }
  return makeProceduralTownLocal(rng);
}

/* ------------------------------------------------------------------ *
 * Poses
 * ------------------------------------------------------------------ *
 * Every state the tour needs, driven by plain rotations. Each is safe to call
 * every frame and eases toward its target, so states blend instead of snapping.
 */

const _v = new THREE.Vector3();

export function poseWalk(char, dt, speed = 1.6) {
  const d = char.userData;
  if (d.isCharacterModel) {
    d.playAnimation('Walk', { timeScale: speed / 1.6 });
    d.updateAnimation(dt);
    if (d.flagArm) {
      d.flagArm.rotation.x = -1.55;
      d.flagArm.rotation.z = 0.3;
    }
    char.position.y = d.baseY;
    return;
  }
  d.phase += dt * speed * 4.2;
  const s = Math.sin(d.phase);
  d.legs[0].rotation.x = s * 0.72;
  d.legs[1].rotation.x = -s * 0.72;
  // the arm holding something swings less
  d.arms[0].rotation.x += (-s * 0.5 - d.arms[0].rotation.x) * Math.min(1, dt * 12);
  d.arms[1].rotation.x += (s * 0.42 - d.arms[1].rotation.x) * Math.min(1, dt * 12);
  char.position.y = d.baseY + Math.abs(Math.sin(d.phase * 2)) * 0.04;
}

export function poseIdle(char, dt) {
  const d = char.userData;
  if (d.isCharacterModel) {
    // Cheer owns the one mixer tick for this frame; avoid swapping Idle and
    // Wave twice per frame in the guided-tour stop choreography.
    if (d.state === 'cheer') return;
    d.playAnimation(d.idleClip);
    d.updateAnimation(dt);
    if (d.flagArm) {
      d.flagArm.rotation.x = -1.55;
      d.flagArm.rotation.z = 0.3;
    }
    char.position.y = d.baseY;
    return;
  }
  d.phase += dt * 1.1;
  for (const leg of d.legs) leg.rotation.x *= 1 - Math.min(1, dt * 6);
  for (const arm of d.arms) arm.rotation.x *= 1 - Math.min(1, dt * 6);
  char.position.y = d.baseY + Math.sin(d.phase) * 0.012;
}

/**
 * Mouth movement from the loudness of the recording, smoothed so it never
 * chatters, plus a little head motion - the difference between "a mouth is
 * animating" and "this person is talking".
 */
export function poseTalk(char, dt, level = 0) {
  const d = char.userData;
  if (d.isCharacterModel) {
    d.talkLevel += (level - d.talkLevel) * Math.min(1, dt * 18);
    d.phase += dt * 1.6;
    d.head.rotation.x += Math.sin(d.phase * 2.2) * 0.035 - d.talkLevel * 0.08;
    d.head.rotation.z += Math.sin(d.phase * 1.3) * d.talkLevel * 0.04;
    if (d.torso) d.torso.rotation.y += Math.sin(d.phase * 1.7) * d.talkLevel * 0.09;
    return;
  }
  // Procedural mouth movement (existing behavior)
  d.mouthLevel += (level - d.mouthLevel) * Math.min(1, dt * 18);
  const open = Math.max(0.06, d.mouthLevel);
  d.mouth.scale.set(1 + open * 0.5, 0.5 + open * 5.5, 1);
  d.mouth.position.y = 0.06 - open * 0.05;
  d.head.rotation.x = Math.sin(d.phase * 2.2) * 0.05 - d.mouthLevel * 0.06;
  d.phase += dt * 1.6;
}

export function closeMouth(char, dt) {
  const d = char.userData;
  if (d.isCharacterModel) {
    d.talkLevel += (0 - d.talkLevel) * Math.min(1, dt * 10);
    return;
  }
  d.mouthLevel += (0 - d.mouthLevel) * Math.min(1, dt * 10);
  d.mouth.scale.set(1, 0.5, 1);
}

/** Turn the head (and gently the body) toward a point in the world. */
export function poseLook(char, target, dt, { turnBody = false, rate = 6 } = {}) {
  if (!char?.userData?.head) return;
  char.getWorldPosition(_v);
  const angle = Math.atan2(target.x - _v.x, target.z - _v.z);
  if (char.userData.isCharacterModel) {
    if (turnBody) {
      let bodyDelta = angle - char.rotation.y;
      while (bodyDelta > Math.PI) bodyDelta -= Math.PI * 2;
      while (bodyDelta < -Math.PI) bodyDelta += Math.PI * 2;
      char.rotation.y += bodyDelta * Math.min(1, dt * rate * 0.45);
    }
    let headDelta = angle - (char.rotation.y + char.userData.head.rotation.y);
    while (headDelta > Math.PI) headDelta -= Math.PI * 2;
    while (headDelta < -Math.PI) headDelta += Math.PI * 2;
    const limited = THREE.MathUtils.clamp(
      char.userData.head.rotation.y + headDelta,
      -1.2,
      1.2
    );
    char.userData.head.rotation.y += (limited - char.userData.head.rotation.y)
      * Math.min(1, dt * rate);
    return;
  }
  if (turnBody) {
    let delta = angle - char.rotation.y;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    char.rotation.y += delta * Math.min(1, dt * rate);
    char.userData.head.rotation.y *= 1 - Math.min(1, dt * rate);
  } else {
    let delta = angle - (char.rotation.y + char.userData.head.rotation.y);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const limited = THREE.MathUtils.clamp(char.userData.head.rotation.y + delta, -1.2, 1.2);
    char.userData.head.rotation.y += (limited - char.userData.head.rotation.y) * Math.min(1, dt * rate);
  }
}

/** Raise the free arm toward something - "and over there is the stadium". */
export function posePoint(char, dt, amount = 1) {
  const d = char.userData;
  // Support both procedural and skinned guide
  if (d.isCharacterModel) {
    d.pointAmount = d.pointAmount || 0;
    d.pointAmount += (amount - d.pointAmount) * Math.min(1, dt * 7);
    const arm = char.getObjectByName('UpperArmR') || char.getObjectByName('WristR') || d.arms?.[1];
    if (arm) {
      arm.rotation.x = -d.pointAmount * 1.45;
      arm.rotation.z = -d.pointAmount * 0.32;
    }
    return;
  }
  d.pointAmount += (amount - d.pointAmount) * Math.min(1, dt * 7);
  const arm = d.arms[1];
  arm.rotation.x = -d.pointAmount * 1.45;
  arm.rotation.z = -d.pointAmount * 0.32;
}

/** Lift the camera to eye level and take the shot. */
export function poseShoot(char, dt, amount = 1) {
  const d = char.userData;
  if (d.isCharacterModel) return;
  d.cameraUp += (amount - d.cameraUp) * Math.min(1, dt * 8);
  const arm = d.arms[1];
  arm.rotation.x = -d.cameraUp * 1.75;
  arm.rotation.z = d.cameraUp * 0.28;
  if (d.arms[0]) d.arms[0].rotation.x = -d.cameraUp * 1.4;
}

/** Hands up, a happy little bounce - used for the applause at the end. */
export function poseCheer(char, dt) {
  const d = char.userData;
  if (d.isCharacterModel) {
    d.playAnimation('Wave');
    d.updateAnimation(dt);
    char.position.y = d.baseY;
    return;
  }
  d.phase += dt * 7;
  const s = Math.abs(Math.sin(d.phase));
  d.arms[0].rotation.x = -2.2 - s * 0.3;
  d.arms[1].rotation.x = -2.2 - s * 0.3;
  d.arms[0].rotation.z = 0.35;
  d.arms[1].rotation.z = -0.35;
  char.position.y = d.baseY + s * 0.16;
}

/** Reset the transient pose channels when a state ends. */
export function relax(char, dt) {
  const d = char.userData;
  if (d.isCharacterModel) return;
  d.pointAmount += (0 - d.pointAmount) * Math.min(1, dt * 6);
  d.cameraUp += (0 - d.cameraUp) * Math.min(1, dt * 6);
  d.arms[0].rotation.z *= 1 - Math.min(1, dt * 6);
  d.arms[1].rotation.z *= 1 - Math.min(1, dt * 6);
  d.head.rotation.y *= 1 - Math.min(1, dt * 3);
  d.head.rotation.x *= 1 - Math.min(1, dt * 3);
}

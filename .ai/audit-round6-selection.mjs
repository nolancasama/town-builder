/*
 * Round 6 placement/progression stress test.
 *
 * Run after the sizeClass/plotClass migration:
 *   node .ai/audit-round6-selection.mjs [random-run-count]
 *
 * This intentionally exercises the same public path as Game.offerChoices() and
 * Game.buildLandmark(): availableChoices -> maybeShowMystery -> pickChoices ->
 * selectLot. It does not duplicate the placement algorithm.
 */
globalThis.document = {
  createElement() {
    return {
      width: 0,
      height: 0,
      getContext() {
        return {
          clearRect() {}, fillRect() {}, fillText() {},
          measureText(text) { return { width: String(text).length * 24 }; },
        };
      },
    };
  },
};

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
  };
}
globalThis.window = { localStorage: memoryStorage() };

const [
  { LANDMARKS, ALL_TYPES },
  { LANDMARK_LOTS, LANDMARK_SIZE_CLASSES },
  { BUILD_TARGET, CHOICES_PER_ROUND },
  { DEFAULT_UNLOCKED },
  { makeRng },
  { canPlace, selectLot },
  { availableChoices, pickChoices },
  { createProgression },
] = await Promise.all([
  import('../src/config/landmarks.js'),
  import('../src/config/town.js'),
  import('../src/config/lessons.js'),
  import('../src/config/progression.js'),
  import('../src/core/rng.js'),
  import('../src/buildings/index.js'),
  import('../src/systems/choices.js'),
  import('../src/systems/progression.js'),
]);

const runCount = Number(process.argv[2] || 20000);
const classOrder = ['small', 'medium', 'large', 'xl'];
const semanticZone = (zones) => zones.some((zone) => classOrder.includes(zone));
const expectedTypes = {
  small: ['bank', 'bakery', 'bookstore', 'cafe', 'convenience', 'restaurant', 'house'],
  medium: ['aquarium', 'cinema', 'museum', 'fire', 'hospital', 'library', 'police', 'gym', 'playground', 'pool', 'supermarket', 'hotel', 'busStation', 'gasStation'],
  large: ['amusementPark', 'beach', 'castle', 'farm', 'temple', 'zoo', 'school', 'park', 'mall', 'airport', 'station'],
  xl: ['stadium'],
};

function invariant(condition, message, state = null) {
  if (condition) return;
  const suffix = state ? `\n${JSON.stringify(state, null, 2)}` : '';
  throw new Error(`${message}${suffix}`);
}

invariant(LANDMARK_SIZE_CLASSES, 'LANDMARK_SIZE_CLASSES export is missing');
for (const sizeClass of classOrder) {
  const actual = ALL_TYPES.filter((type) => LANDMARKS[type].sizeClass === sizeClass).sort();
  const expected = expectedTypes[sizeClass].slice().sort();
  invariant(JSON.stringify(actual) === JSON.stringify(expected), `${sizeClass} class assignment mismatch`, {
    actual, expected,
  });
}
for (const type of ALL_TYPES) {
  invariant(classOrder.includes(LANDMARKS[type].sizeClass), `${type} has invalid/missing sizeClass`);
  invariant(!semanticZone(LANDMARKS[type].zones), `${type}.zones still contains a size word`);
  const expected = LANDMARK_SIZE_CLASSES[LANDMARKS[type].sizeClass].envelope;
  invariant(
    LANDMARKS[type].footprint[0] === expected[0] && LANDMARKS[type].footprint[1] === expected[1],
    `${type}.footprint is not derived from its class`,
    { actual: LANDMARKS[type].footprint, expected }
  );
  invariant(!('minLotSize' in LANDMARKS[type]), `${type} still declares minLotSize`);
}
for (const lot of LANDMARK_LOTS) {
  invariant(classOrder.includes(lot.plotClass), `${lot.id} has invalid/missing plotClass`);
  invariant(!semanticZone(lot.zones), `${lot.id}.zones still contains a size word`);
  const expected = LANDMARK_SIZE_CLASSES[lot.plotClass];
  invariant(
    lot.buildSize[0] === expected.envelope[0] && lot.buildSize[1] === expected.envelope[1],
    `${lot.id}.buildSize is not derived from its class`, { actual: lot.buildSize, expected: expected.envelope }
  );
  invariant(
    lot.size[0] === expected.plot[0] && lot.size[1] === expected.plot[1],
    `${lot.id}.size is not derived from its class`, { actual: lot.size, expected: expected.plot }
  );
  invariant(!lot.excludedTypes?.length, `${lot.id} still has one-off excludedTypes`);
}
const fixedTypes = ALL_TYPES.filter((type) => LANDMARKS[type].lot).sort();
invariant(
  JSON.stringify(fixedTypes) === JSON.stringify(['stadium', 'station']),
  'only station and stadium may keep fixed parcels', { fixedTypes }
);

function assertCompatible(type, lot, takenBefore) {
  const def = LANDMARKS[type];
  invariant(!takenBefore.has(lot.id), `${type} selected occupied ${lot.id}`);
  invariant(!lot.reservedFor || lot.reservedFor === type, `${type} violated ${lot.id}.reservedFor`);
  invariant(
    classOrder.indexOf(lot.plotClass) >= classOrder.indexOf(def.sizeClass),
    `${type} (${def.sizeClass}) selected undersized ${lot.id} (${lot.plotClass})`
  );
  invariant(
    lot.zones.some((zone) => def.zones.includes(zone)),
    `${type} selected semantically incompatible ${lot.id}`,
    { landmarkZones: def.zones, lotZones: lot.zones }
  );
  if (def.lot !== lot.id) {
    const compatibleRanks = LANDMARK_LOTS
      .filter((candidate) => !takenBefore.has(candidate.id))
      .filter((candidate) => !candidate.reservedFor || candidate.reservedFor === type)
      .filter((candidate) => classOrder.indexOf(candidate.plotClass) >= classOrder.indexOf(def.sizeClass))
      .filter((candidate) => candidate.zones.some((zone) => def.zones.includes(zone)))
      .map((candidate) => classOrder.indexOf(candidate.plotClass));
    invariant(
      classOrder.indexOf(lot.plotClass) === Math.min(...compatibleRanks),
      `${type} consumed a larger parcel while a smaller compatible parcel was free`,
      { selected: lot.id, plotClass: lot.plotClass }
    );
  }
}

function simulateTown({ seed, unlocked, progression = null, strategy = 'random', rng: suppliedRng = null }) {
  const rng = suppliedRng || makeRng(seed);
  const built = [];
  const taken = new Set();
  const mysteries = [];
  if (progression) progression.startRun(BUILD_TARGET);

  while (built.length < BUILD_TARGET) {
    const round = built.length + 1;
    const unlockedSet = progression ? progression.unlockedSet() : unlocked;
    const pool = availableChoices(built, taken, unlockedSet);
    invariant(pool.length > 0, `dead end before build ${round}`, {
      seed, strategy, built, taken: [...taken], unlocked: [...unlockedSet],
    });
    for (const type of pool) invariant(canPlace(type, taken), `${type} leaked through availableChoices without a lot`);

    const mystery = progression && pool.length >= CHOICES_PER_ROUND
      ? progression.maybeShowMystery(round)
      : null;
    const realCount = mystery ? CHOICES_PER_ROUND - 1 : CHOICES_PER_ROUND;
    const choices = pickChoices(built, taken, rng, realCount, unlockedSet);
    invariant(choices.length >= Math.min(2, pool.length), `round ${round} has fewer than two real choices`, {
      seed, pool, choices, mystery,
    });
    invariant(new Set(choices).size === choices.length, `round ${round} contains duplicate choices`);
    for (const type of choices) {
      invariant(pool.includes(type), `${type} was offered outside availableChoices`);
      invariant(!mystery || type !== mystery, `${type} is both a real and mystery choice`);
      if (progression && progression.isNew(type)) progression.noteChoiceShown(type);
    }
    if (mystery) {
      invariant(!unlockedSet.has(mystery), `${mystery} mystery is already unlocked`);
      mysteries.push(round);
    }

    let chosen = choices[Math.floor(rng() * choices.length)];
    if (strategy === 'fewest-next-options') {
      chosen = choices
        .map((type) => {
          const candidate = selectLot(type, taken);
          invariant(candidate, `${type} was offered but selectLot returned null`);
          const nextTaken = new Set(taken).add(candidate.id);
          const nextBuilt = [...built, type];
          return { type, count: availableChoices(nextBuilt, nextTaken, unlockedSet).length };
        })
        .sort((a, b) => a.count - b.count || a.type.localeCompare(b.type))[0].type;
    }

    const selected = selectLot(chosen, taken);
    invariant(selected, `${chosen} was offered but selectLot returned null`, { seed, round, choices });
    assertCompatible(chosen, selected, taken);
    taken.add(selected.id);
    built.push(chosen);
    if (progression) progression.noteBuilt(chosen);
  }

  for (let i = 1; i < mysteries.length; i++) {
    invariant(mysteries[i] - mysteries[i - 1] >= 2, 'mysteries appeared in adjacent rounds', { seed, mysteries });
  }
  invariant(!mysteries.includes(1) && !mysteries.includes(BUILD_TARGET), 'mystery appeared in a skipped edge round');
  return { built, taken, mysteries };
}

const allUnlocked = new Set(ALL_TYPES);
const starters = new Set(DEFAULT_UNLOCKED);
const strategyRuns = Math.max(1000, Math.floor(runCount / 4));
for (let i = 0; i < runCount; i++) {
  simulateTown({ seed: 0x10000000 + i, unlocked: allUnlocked });
  simulateTown({ seed: 0x20000000 + i, unlocked: starters });
}
for (let i = 0; i < strategyRuns; i++) {
  simulateTown({ seed: 0x30000000 + i, unlocked: allUnlocked, strategy: 'fewest-next-options' });
  simulateTown({ seed: 0x40000000 + i, unlocked: starters, strategy: 'fewest-next-options' });
}

// Exercise the real mystery/unlock state machine through the full unlock ladder.
const progressionSeeds = Math.max(100, Math.floor(runCount / 100));
let progressionTowns = 0;
for (let i = 0; i < progressionSeeds; i++) {
  window.localStorage.clear();
  const rng = makeRng(0x50000000 + i);
  const progression = createProgression({ rng });
  while (progression.lockedTypes().length) {
    simulateTown({ seed: 0x60000000 + progressionTowns, progression, rng });
    const before = progression.lockedTypes().length;
    const reward = progression.completeRun();
    invariant(reward && progression.isUnlocked(reward), 'completeRun did not unlock exactly one place');
    invariant(progression.lockedTypes().length === before - 1, 'completeRun changed the locked count incorrectly');
    progressionTowns += 1;
  }
  simulateTown({ seed: 0x70000000 + i, progression, rng });
  invariant(progression.completeRun() === null, 'completeRun should return null when fully unlocked');
}

const parcelCounts = Object.fromEntries(classOrder.map((name) => [
  name, LANDMARK_LOTS.filter((lot) => lot.plotClass === name).length,
]));
console.log(JSON.stringify({
  status: 'PASS',
  randomizedTowns: runCount * 2,
  adversarialTowns: strategyRuns * 2,
  progressionLadderTowns: progressionTowns + progressionSeeds,
  parcelCounts,
}, null, 2));

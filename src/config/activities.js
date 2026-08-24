/**
 * ACTIVITY REGISTRY - "We can ___ in the ___."
 * --------------------------------------------
 * The second half of the game: what a child can say about each place, and what
 * the town does when they say it.
 *
 * Each action carries
 *   id      - stable name for the activity
 *   phrases - the ways a child might say it (matched on content words, fuzzily)
 *   anim    - which world animation to run (see systems/activities.js)
 *   opts    - parameters for that animation
 *
 * Two rules this data exists to serve:
 *   - there is no single hidden right answer; every phrase in a bank counts
 *   - language acceptance is separate from animation availability. A sentence
 *     with no matching animation is still correct - it just gets the generic
 *     celebration instead of a bespoke one.
 */

export const ACTIVITIES = {
  /* ===================== COMMUNITY ===================== */
  school: {
    preferred: 'study',
    hints: ['study', 'learn English'],
    actions: [
      { id: 'study', phrases: ['study', 'learn', 'learn english', 'read', 'do homework'],
        anim: 'crowd', opts: { count: 5, spot: 'entrance', mood: 'walk' } },
      { id: 'play', phrases: ['play', 'run', 'play soccer', 'meet friends'],
        anim: 'field', opts: { kind: 'play', count: 5, scale: 0.5 } },
    ],
  },
  library: {
    preferred: 'read books',
    hints: ['read books', 'study'],
    actions: [
      { id: 'read', phrases: ['read', 'read books', 'read a book', 'borrow books', 'borrow a book'],
        anim: 'crowd', opts: { count: 5, spot: 'entrance', mood: 'sit', prop: 'book' } },
      { id: 'study', phrases: ['study', 'do homework', 'learn'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'sit', prop: 'book' } },
    ],
  },
  hospital: {
    preferred: 'see a doctor',
    hints: ['see a doctor'],
    actions: [
      { id: 'doctor', phrases: ['see a doctor', 'meet a doctor', 'see the doctor', 'get medicine', 'get help', 'help people', 'rest'],
        anim: 'vehicleArrive', opts: { kind: 'ambulance', people: 3 } },
    ],
  },
  police: {
    preferred: 'see police officers',
    hints: ['see police officers', 'ask for help'],
    actions: [
      { id: 'officers', phrases: ['see police officers', 'see a police officer', 'meet a police officer',
        'talk to a police officer', 'ask for help', 'see police'],
        anim: 'vehicleArrive', opts: { kind: 'patrol', people: 3 } },
    ],
  },
  fire: {
    preferred: 'see fire trucks',
    hints: ['see fire trucks', 'meet firefighters'],
    actions: [
      { id: 'firetruck', phrases: ['see fire trucks', 'see a fire truck', 'see firefighters', 'meet firefighters', 'learn about fire'],
        anim: 'vehicleArrive', opts: { kind: 'engine', people: 3, out: true } },
    ],
  },
  bank: {
    preferred: 'get money',
    hints: ['get money', 'save money'],
    actions: [
      { id: 'money', phrases: ['get money', 'save money', 'use an atm', 'change money', 'keep money'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'walk' } },
    ],
  },

  /* ===================== TRANSPORT ===================== */
  station: {
    preferred: 'ride the train',
    hints: ['ride the train', 'buy a ticket'],
    actions: [
      // "ride" is the phrase we teach; "take the train" is still understood.
      { id: 'ridetrain', phrases: ['ride the train', 'ride a train', 'ride trains', 'ride train',
        'take the train', 'take a train', 'catch a train'],
        anim: 'train', opts: { passengers: 5 } },
      { id: 'ticket', phrases: ['buy a ticket', 'buy tickets', 'wait for a train', 'meet a friend'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'walk' } },
    ],
  },
  busStation: {
    preferred: 'ride the bus',
    hints: ['ride the bus', 'buy a ticket'],
    actions: [
      { id: 'ridebus', phrases: ['ride the bus', 'ride a bus', 'ride buses', 'ride bus',
        'take the bus', 'take a bus', 'catch a bus'],
        anim: 'bus', opts: { passengers: 4 } },
      { id: 'wait', phrases: ['buy a ticket', 'wait for a bus', 'wait for the bus'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'walk' } },
    ],
  },
  airport: {
    preferred: 'ride a plane',
    hints: ['ride a plane', 'travel'],
    actions: [
      { id: 'fly', phrases: ['ride a plane', 'ride the plane', 'ride planes', 'take a plane', 'fly', 'travel',
        'go to america', 'go on holiday', 'take a trip'],
        anim: 'plane', opts: { takeoff: true, passengers: 4 } },
      { id: 'seeplanes', phrases: ['see airplanes', 'see planes', 'see a plane', 'watch planes'],
        anim: 'plane', opts: { takeoff: false } },
    ],
  },
  gasStation: {
    preferred: 'get gas',
    hints: ['get gas', 'wash a car'],
    actions: [
      { id: 'gas', phrases: ['get gas', 'buy gas', 'fill the car', 'stop the car'],
        anim: 'vehicleArrive', opts: { kind: 'customer', people: 1 } },
      { id: 'wash', phrases: ['wash a car', 'wash the car', 'clean the car'],
        anim: 'vehicleArrive', opts: { kind: 'customer', people: 1, sparkle: true } },
    ],
  },

  /* ================ SPORTS AND RECREATION ================ */
  stadium: {
    view: { height: 2.5, distance: 0.9, targetY: 0.04 },
    preferred: 'watch a baseball game',
    hints: ['watch a baseball game', 'play soccer'],
    actions: [
      { id: 'baseball', phrases: ['watch baseball', 'watch a baseball game', 'play baseball',
        'watch a game', 'watch the game', 'baseball'],
        anim: 'field', opts: { kind: 'baseball', count: 9, cheer: true } },
      { id: 'soccer', phrases: ['watch soccer', 'watch a soccer game', 'play soccer', 'play football', 'soccer'],
        anim: 'field', opts: { kind: 'soccer', count: 8, cheer: true } },
      { id: 'run', phrases: ['run', 'exercise', 'jog', 'play sports', 'watch sports', 'do sports'],
        anim: 'field', opts: { kind: 'run', count: 5, cheer: true } },
    ],
  },
  park: {
    view: { height: 1.5 },
    preferred: 'play',
    hints: ['play', 'have a picnic'],
    actions: [
      { id: 'soccer', phrases: ['play soccer', 'play football', 'play ball', 'play catch'],
        anim: 'field', opts: { kind: 'soccer', count: 6, scale: 0.55 } },
      { id: 'picnic', phrases: ['have a picnic', 'eat lunch', 'have lunch', 'picnic', 'eat'],
        anim: 'props', opts: { kind: 'picnic', people: 3 } },
      { id: 'bike', phrases: ['ride a bike', 'ride bikes', 'ride my bike', 'cycle'],
        anim: 'crowd', opts: { count: 3, mood: 'cycle', spread: 0.7 } },
      { id: 'run', phrases: ['run', 'jog', 'exercise'],
        anim: 'crowd', opts: { count: 4, mood: 'run', spread: 0.75 } },
      { id: 'walk', phrases: ['walk', 'take a walk', 'see flowers', 'relax', 'rest'],
        anim: 'crowd', opts: { count: 5, mood: 'walk', spread: 0.75 } },
      { id: 'play', phrases: ['play', 'have fun', 'meet friends'],
        anim: 'crowd', opts: { count: 6, mood: 'play', spread: 0.7 } },
    ],
  },
  gym: {
    view: { height: 1.25 },
    preferred: 'exercise',
    hints: ['exercise', 'play basketball'],
    actions: [
      { id: 'basketball', phrases: ['play basketball', 'play ball', 'basketball'],
        anim: 'field', opts: { kind: 'basketball', count: 4, scale: 0.45 } },
      { id: 'exercise', phrases: ['exercise', 'work out', 'train', 'run', 'play sports', 'do sports'],
        anim: 'crowd', opts: { count: 5, mood: 'exercise', spot: 'front' } },
    ],
  },
  pool: {
    view: { height: 1.7, distance: 0.9 },
    preferred: 'swim',
    hints: ['swim'],
    actions: [
      { id: 'swim', phrases: ['swim', 'play in the water', 'dive', 'race', 'have fun'],
        anim: 'swimmers', opts: { count: 5, area: 'pool' } },
    ],
  },
  playground: {
    view: { height: 1.5 },
    preferred: 'play',
    hints: ['play', 'go on the swings'],
    actions: [
      { id: 'play', phrases: ['play', 'use the slide', 'go on the slide', 'go on the swings',
        'use the swings', 'swing', 'slide', 'have fun', 'run', 'meet friends'],
        anim: 'crowd', opts: { count: 6, mood: 'play', spread: 0.6, small: true } },
    ],
  },

  /* ===================== ATTRACTIONS ===================== */
  zoo: {
    view: { height: 1.6, distance: 0.95 },
    preferred: 'see animals',
    hints: ['see animals', 'see elephants'],
    actions: [
      { id: 'elephants', phrases: ['see elephants', 'see an elephant', 'watch elephants', 'elephants'],
        anim: 'animals', opts: { animal: 'elephant' } },
      { id: 'lions', phrases: ['see lions', 'see a lion', 'watch lions', 'lions'],
        anim: 'animals', opts: { animal: 'lion' } },
      { id: 'giraffes', phrases: ['see giraffes', 'see a giraffe', 'watch giraffes', 'giraffes'],
        anim: 'animals', opts: { animal: 'giraffe' } },
      // pandas, monkeys and friends have no model here - the sentence is still
      // right, so they wake the whole zoo up instead of being rejected
      { id: 'animals', phrases: ['see animals', 'watch animals', 'see pandas', 'see monkeys',
        'see tigers', 'see bears', 'see zebras', 'take photos', 'feed animals', 'animals'],
        anim: 'animals', opts: { animal: null } },
    ],
  },
  aquarium: {
    preferred: 'see fish',
    hints: ['see fish', 'see dolphins'],
    actions: [
      { id: 'dolphins', phrases: ['see dolphins', 'see a dolphin', 'watch dolphins', 'dolphins'],
        anim: 'sea', opts: { star: 'dolphin' } },
      { id: 'fish', phrases: ['see fish', 'watch fish', 'see sharks', 'see whales', 'see penguins',
        'see sea animals', 'learn about the sea', 'fish'],
        anim: 'sea', opts: { star: 'fish' } },
    ],
  },
  museum: {
    preferred: 'see art',
    hints: ['see art', 'learn about history'],
    actions: [
      { id: 'art', phrases: ['see art', 'see pictures', 'see paintings', 'look at art',
        'learn about history', 'learn', 'see old things'],
        anim: 'lights', opts: { people: 5, tone: 'warm' } },
    ],
  },
  cinema: {
    preferred: 'watch a movie',
    hints: ['watch a movie'],
    actions: [
      { id: 'movie', phrases: ['watch a movie', 'watch movies', 'see a movie', 'watch a film'],
        anim: 'lights', opts: { people: 6, tone: 'marquee' } },
      { id: 'popcorn', phrases: ['eat popcorn', 'buy popcorn', 'eat snacks'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'walk' } },
    ],
  },
  amusementPark: {
    preferred: 'ride a roller coaster',
    hints: ['ride a roller coaster', 'ride the Ferris wheel'],
    actions: [
      { id: 'coaster', phrases: ['ride a roller coaster', 'ride the roller coaster', 'ride a rollercoaster', 'roller coaster'],
        anim: 'rides', opts: { focus: 'coaster', people: 5 } },
      { id: 'ferris', phrases: ['ride the ferris wheel', 'ride a ferris wheel', 'ferris wheel'],
        anim: 'rides', opts: { focus: 'ferris', people: 5 } },
      { id: 'fun', phrases: ['ride rides', 'have fun', 'play', 'play games', 'ride the rides', 'scream'],
        anim: 'rides', opts: { focus: 'all', people: 6 } },
    ],
  },
  castle: {
    preferred: 'learn about history',
    hints: ['learn about history', 'take pictures'],
    actions: [
      { id: 'photos', phrases: ['take pictures', 'take photos', 'take a picture'],
        anim: 'crowd', opts: { count: 5, spot: 'front', mood: 'photo' } },
      { id: 'visit', phrases: ['learn about history', 'see the castle', 'look around', 'visit',
        'climb the tower', 'see samurai', 'learn'],
        anim: 'crowd', opts: { count: 5, spot: 'front', mood: 'walk' } },
    ],
  },
  temple: {
    preferred: 'pray',
    hints: ['pray', 'take pictures'],
    actions: [
      { id: 'pray', phrases: ['pray', 'make a wish', 'wish'],
        anim: 'crowd', opts: { count: 3, spot: 'front', mood: 'bow' } },
      { id: 'visit', phrases: ['visit', 'look around', 'take pictures', 'take photos', 'see a festival'],
        anim: 'crowd', opts: { count: 5, spot: 'front', mood: 'walk' } },
    ],
  },
  beach: {
    view: { height: 1.6, distance: 0.95 },
    preferred: 'swim',
    hints: ['swim', 'play in the sand'],
    actions: [
      { id: 'swim', phrases: ['swim', 'go swimming', 'play in the water', 'see the sea'],
        anim: 'swimmers', opts: { count: 5, area: 'sea' } },
      { id: 'sandcastle', phrases: ['make a sandcastle', 'build a sandcastle', 'play in the sand', 'sandcastle'],
        anim: 'props', opts: { kind: 'sandcastle', people: 2 } },
      { id: 'relax', phrases: ['relax', 'rest', 'sunbathe', 'read'],
        anim: 'props', opts: { kind: 'relax', people: 3 } },
      { id: 'play', phrases: ['play', 'play ball', 'have fun', 'play volleyball'],
        anim: 'crowd', opts: { count: 4, mood: 'play', spread: 0.6 } },
    ],
  },
  farm: {
    view: { height: 1.45 },
    preferred: 'see animals',
    hints: ['see animals', 'grow vegetables'],
    actions: [
      { id: 'feed', phrases: ['feed animals', 'feed the cows', 'feed cows', 'help the farmer'],
        anim: 'animals', opts: { animal: 'cow', people: 2 } },
      { id: 'animals', phrases: ['see animals', 'see cows', 'watch animals', 'see horses'],
        anim: 'animals', opts: { animal: 'cow' } },
      { id: 'crops', phrases: ['grow vegetables', 'pick vegetables', 'grow food', 'pick fruit', 'plant vegetables'],
        anim: 'props', opts: { kind: 'crops', people: 2 } },
    ],
  },

  /* ================= SHOPPING AND FOOD ================= */
  mall: {
    preferred: 'go shopping',
    hints: ['go shopping', 'buy clothes'],
    actions: [
      { id: 'shop', phrases: ['go shopping', 'shop', 'buy clothes', 'buy things', 'buy shoes', 'meet friends'],
        anim: 'crowd', opts: { count: 7, spot: 'entrance', mood: 'shop' } },
      { id: 'eat', phrases: ['eat', 'have lunch', 'eat lunch', 'eat food'],
        anim: 'props', opts: { kind: 'tables', people: 3 } },
    ],
  },
  supermarket: {
    preferred: 'buy food',
    hints: ['buy food', 'buy vegetables'],
    actions: [
      { id: 'shop', phrases: ['buy food', 'buy vegetables', 'buy fruit', 'go shopping', 'shop', 'buy milk'],
        anim: 'crowd', opts: { count: 6, spot: 'entrance', mood: 'shop' } },
    ],
  },
  convenience: {
    preferred: 'buy snacks',
    hints: ['buy snacks', 'buy a drink'],
    actions: [
      { id: 'shop', phrases: ['buy snacks', 'buy a snack', 'buy drinks', 'buy a drink', 'buy food',
        'buy rice balls', 'shop', 'go shopping'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'shop' } },
    ],
  },
  restaurant: {
    preferred: 'eat',
    hints: ['eat lunch', 'have dinner'],
    actions: [
      { id: 'eat', phrases: ['eat', 'eat lunch', 'eat dinner', 'have lunch', 'have dinner',
        'eat ramen', 'eat pizza', 'eat sushi', 'drink'],
        anim: 'props', opts: { kind: 'tables', people: 4 } },
    ],
  },
  cafe: {
    preferred: 'drink coffee',
    hints: ['drink coffee', 'eat cake'],
    actions: [
      { id: 'drink', phrases: ['drink coffee', 'drink tea', 'drink juice', 'eat cake', 'eat',
        'talk', 'talk with friends', 'relax'],
        anim: 'props', opts: { kind: 'tables', people: 3, cafe: true } },
    ],
  },
  bakery: {
    preferred: 'buy bread',
    hints: ['buy bread', 'buy a cake'],
    actions: [
      { id: 'bread', phrases: ['buy bread', 'eat bread', 'buy a cake', 'eat cake', 'buy cake',
        'smell the bread', 'buy food'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'shop' } },
    ],
  },
  bookstore: {
    preferred: 'buy books',
    hints: ['buy books', 'read books'],
    actions: [
      { id: 'books', phrases: ['buy books', 'buy a book', 'read books', 'read', 'look at books', 'buy comics'],
        anim: 'crowd', opts: { count: 4, spot: 'entrance', mood: 'shop', prop: 'book' } },
    ],
  },

  /* ==================== STAY AND HOME ==================== */
  hotel: {
    preferred: 'sleep',
    hints: ['sleep', 'stay'],
    actions: [
      { id: 'stay', phrases: ['sleep', 'stay', 'stay one night', 'rest', 'relax', 'meet visitors'],
        anim: 'lights', opts: { people: 4, tone: 'windows' } },
      { id: 'breakfast', phrases: ['eat breakfast', 'have breakfast', 'eat'],
        anim: 'props', opts: { kind: 'tables', people: 3 } },
    ],
  },
  house: {
    preferred: 'play games',
    hints: ['play games', 'watch TV'],
    actions: [
      { id: 'tv', phrases: ['watch tv', 'watch television', 'watch a movie'],
        anim: 'lights', opts: { people: 2, tone: 'tv' } },
      { id: 'dinner', phrases: ['eat dinner', 'eat', 'have dinner', 'eat lunch', 'cook'],
        anim: 'props', opts: { kind: 'tables', people: 3 } },
      { id: 'games', phrases: ['play games', 'play', 'play video games', 'do homework', 'study'],
        anim: 'crowd', opts: { count: 3, spot: 'front', mood: 'play', small: true } },
      { id: 'visit', phrases: ['visit', 'visit a friend', 'talk', 'meet friends', 'talk with friends'],
        anim: 'crowd', opts: { count: 3, spot: 'entrance', mood: 'walk' } },
    ],
  },
};

/* ------------------------------------------------------------------ *
 * Lookups
 * ------------------------------------------------------------------ */

/** Every action definition for a place. */
export function actionsFor(type) {
  return (ACTIVITIES[type] && ACTIVITIES[type].actions) || [];
}

/** Flat list of every accepted phrase for a place. */
export function phrasesFor(type) {
  return actionsFor(type).flatMap((action) => action.phrases);
}

/**
 * The examples shown on screen when a child is stuck. The preferred phrase
 * always comes first - that is the one the lesson is teaching.
 */
export function hintsFor(type) {
  const entry = ACTIVITIES[type];
  if (!entry) return [];
  if (entry.hints && entry.hints.length) return entry.hints;
  return [entry.preferred, ...phrasesFor(type).slice(0, 1)].filter(Boolean);
}

export function preferredFor(type) {
  return (ACTIVITIES[type] && ACTIVITIES[type].preferred) || '';
}

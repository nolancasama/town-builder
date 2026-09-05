import * as B from '../buildings/procedural.js';
import * as X from '../buildings/extras.js';
import { CITY_NAME, HOUSE_OWNER, setHouseOwner } from './lessons.js';
import { ACTIVITIES, actionsFor, phrasesFor, hintsFor, preferredFor } from './activities.js';
import { sizeClassFor } from './town.js';

/**
 * BUILDING REGISTRY
 * -----------------
 * The single source of truth for every place the player can speak into
 * existence. Nothing else in the codebase knows what a "stadium" is.
 *
 * Asset priority (see buildings/index.js):
 *   1. `factory`  - an existing, finished implementation in this project
 *   2. `model`    - a GLB/GLTF in public/assets/buildings/
 *   3. `fallback` - a procedural placeholder built for the wider pool
 *
 * The eight landmarks that shipped first keep their original hand-built
 * models. Only the station and stadium retain fixed authored parcels.
 *
 * Fields
 *   displayName  - shown on the landmark card
 *   spokenName   - the noun inside the target sentence
 *   article      - "a" / "an" / "" (empty for "Ken's house")
 *   sign         - text stamped on the building signage
 *   icon         - glyph for the choice card and progress pip
 *   category     - grouping used to keep the three choices varied
 *   zones        - semantic site types this landmark may use
 *   sizeClass    - small / medium / large / xl physical envelope
 *   footprint    - derived compatibility alias for the class envelope
 *   lot          - genuinely fixed authored parcel (station / stadium only)
 *   keywords     - accepted recognition variants of the noun
 *   activities   - data for the later "We can ___ at the ___." grammar step
 *   celebration  - 0..1: camera hold, particles, confetti
 *   population   - extra pedestrians once it exists
 *   vehicles     - extra cars once it exists
 */

const HOUSE_LABEL = `${HOUSE_OWNER}'s house`;

export const LANDMARKS = {
  /* ================= COMMUNITY ================= */
  school: {
    displayName: 'SCHOOL', spokenName: 'school', article: 'a', sign: 'SCHOOL', icon: '🏫',
    category: 'community', zones: ['civic'], sizeClass: 'large',
    factory: B.buildSchool, model: 'school.glb',
    keywords: ['school', 'skool', 'schoo', 'scool'],
    activities: ['study', 'learn English', 'play', 'meet friends'],
    celebration: 0.6, population: 6, vehicles: 1,
  },
  library: {
    displayName: 'LIBRARY', spokenName: 'library', article: 'a', sign: 'LIBRARY', icon: '📚',
    category: 'community', zones: ['civic'], sizeClass: 'medium',
    factory: B.buildLibrary, model: 'library.glb',
    keywords: ['library', 'libary', 'librari', 'libraries', 'liberry'],
    activities: ['read books', 'study', 'borrow books'],
    celebration: 0.5, population: 4, vehicles: 1,
  },
  hospital: {
    displayName: 'HOSPITAL', spokenName: 'hospital', article: 'a', sign: 'HOSPITAL', icon: '🏥',
    category: 'community', zones: ['civic'], sizeClass: 'medium',
    factory: B.buildHospital, model: 'hospital.glb',
    keywords: ['hospital', 'hospitle', 'hospitel', 'hospita'],
    activities: ['see a doctor', 'help people'],
    celebration: 0.6, population: 5, vehicles: 2,
  },
  police: {
    displayName: 'POLICE STATION', spokenName: 'police station', article: 'a', sign: 'POLICE', icon: '🚓',
    category: 'community', zones: ['civic'], sizeClass: 'medium',
    fallback: X.buildPoliceStation, model: 'police.glb',
    keywords: ['police', 'police station', 'polis', 'police box'],
    activities: ['ask for help', 'meet a police officer'],
    celebration: 0.5, population: 4, vehicles: 2,
  },
  fire: {
    displayName: 'FIRE STATION', spokenName: 'fire station', article: 'a', sign: 'FIRE STATION', icon: '🚒',
    category: 'community', zones: ['civic'], sizeClass: 'medium',
    fallback: X.buildFireStation, model: 'fire.glb',
    keywords: ['fire station', 'fire', 'fire house', 'firestation'],
    activities: ['see a fire truck', 'meet firefighters'],
    celebration: 0.6, population: 4, vehicles: 2,
  },
  post: {
    retired: true,
    displayName: 'POST OFFICE', spokenName: 'post office', article: 'a', sign: 'POST OFFICE', icon: '📮',
    category: 'community', zones: ['civic'], sizeClass: 'small',
    fallback: X.buildPostOffice, model: 'post.glb',
    keywords: ['post office', 'post', 'postoffice', 'poster office'],
    activities: ['send a letter', 'buy stamps'],
    celebration: 0.4, population: 3, vehicles: 1,
  },
  cityHall: {
    retired: true,
    displayName: 'CITY HALL', spokenName: 'city hall', article: 'a', sign: 'CITY HALL', icon: '🏛️',
    category: 'community', zones: ['civic'], sizeClass: 'medium',
    fallback: X.buildCityHall, model: 'city-hall.glb',
    keywords: ['city hall', 'cityhall', 'town hall', 'city hole'],
    activities: ['meet the mayor', 'get a passport'],
    celebration: 0.6, population: 5, vehicles: 1,
  },
  bank: {
    displayName: 'BANK', spokenName: 'bank', article: 'a', sign: 'BANK', icon: '🏦',
    category: 'community', zones: ['civic', 'commercial'], sizeClass: 'small',
    fallback: X.buildBank, model: 'bank.glb',
    keywords: ['bank', 'banks', 'bunk'],
    activities: ['save money', 'change money'],
    celebration: 0.4, population: 3, vehicles: 1,
  },

  /* ================= TRANSPORTATION ================= */
  station: {
    displayName: 'TRAIN STATION', spokenName: 'train station', article: 'a', sign: 'STATION', icon: '🚉',
    category: 'transport', zones: ['transport'], sizeClass: 'large', lot: 'large-station',
    factory: B.buildStation, model: 'station.glb',
    keywords: ['station', 'train station', 'stashon', 'staton', 'trainstation'],
    activities: ['take a train', 'buy a ticket', 'meet a friend'],
    celebration: 0.8, population: 8, vehicles: 2,
  },
  busStation: {
    displayName: 'BUS STATION', spokenName: 'bus station', article: 'a', sign: 'BUS STATION', icon: '🚌',
    category: 'transport', zones: ['transport', 'civic'], sizeClass: 'medium',
    fallback: X.buildBusStation, model: 'bus-station.glb',
    keywords: ['bus station', 'bus', 'bus stop', 'busstation'],
    activities: ['take a bus', 'wait for a bus'],
    celebration: 0.5, population: 6, vehicles: 2,
  },
  airport: {
    displayName: 'AIRPORT', spokenName: 'airport', article: 'an', sign: 'AIRPORT', icon: '✈️',
    category: 'transport', zones: ['edge', 'transport'], sizeClass: 'large',
    fallback: X.buildAirport, model: 'airport.glb',
    keywords: ['airport', 'air port', 'airpot', 'aeroport'],
    activities: ['take a plane', 'travel', 'fly to America'],
    celebration: 0.9, population: 8, vehicles: 3,
  },
  gasStation: {
    displayName: 'GAS STATION', spokenName: 'gas station', article: 'a', sign: 'GAS', icon: '⛽',
    category: 'transport', zones: ['transport', 'commercial'], sizeClass: 'medium',
    fallback: X.buildGasStation, model: 'gas-station.glb',
    keywords: ['gas station', 'gas', 'petrol station', 'gasstation'],
    activities: ['buy gas', 'wash the car'],
    celebration: 0.4, population: 2, vehicles: 3,
  },

  /* ================= SPORTS AND RECREATION ================= */
  stadium: {
    displayName: 'STADIUM', spokenName: 'stadium', article: 'a', sign: `${CITY_NAME.toUpperCase()} STADIUM`, icon: '🏟️',
    category: 'recreation', zones: ['recreation'], sizeClass: 'xl', lot: 'xl-stadium',
    factory: B.buildStadium, model: 'stadium.glb',
    keywords: ['stadium', 'stadion', 'staduim', 'stadiam', 'studium'],
    activities: ['watch a baseball game', 'watch soccer', 'play sports', 'run'],
    celebration: 1, population: 12, vehicles: 3,
  },
  park: {
    displayName: 'PARK', spokenName: 'park', article: 'a', sign: 'CENTRAL PARK', icon: '🌳',
    category: 'recreation', zones: ['recreation', 'civic'], sizeClass: 'large',
    factory: B.buildPark, model: 'park.glb',
    keywords: ['park', 'parc', 'parke'],
    activities: ['play', 'walk', 'have a picnic', 'ride a bike'],
    celebration: 0.5, population: 7, vehicles: 1,
  },
  gym: {
    displayName: 'GYM', spokenName: 'gym', article: 'a', sign: 'GYM', icon: '🏋️',
    category: 'recreation', zones: ['recreation'], sizeClass: 'medium',
    fallback: X.buildGym, model: 'gym.glb',
    keywords: ['gym', 'gim', 'jim', 'gymnasium'],
    activities: ['play basketball', 'exercise', 'play sports'],
    celebration: 0.5, population: 5, vehicles: 1,
  },
  pool: {
    displayName: 'SWIMMING POOL', spokenName: 'swimming pool', article: 'a', sign: 'SWIMMING POOL', icon: '🏊',
    category: 'recreation', zones: ['recreation'], sizeClass: 'medium',
    fallback: X.buildSwimmingPool, model: 'pool.glb',
    keywords: ['swimming pool', 'pool', 'swimming', 'swiming pool'],
    activities: ['swim', 'dive', 'play in the water'],
    celebration: 0.6, population: 6, vehicles: 1,
  },
  playground: {
    displayName: 'PLAYGROUND', spokenName: 'playground', article: 'a', sign: 'PLAYGROUND', icon: '🛝',
    category: 'recreation', zones: ['recreation'], sizeClass: 'medium',
    fallback: X.buildPlayground, model: 'playground.glb',
    keywords: ['playground', 'play ground', 'plaground', 'play park'],
    activities: ['play', 'go on the swings', 'meet friends'],
    celebration: 0.5, population: 6, vehicles: 0,
  },

  /* ================= ATTRACTIONS ================= */
  zoo: {
    displayName: 'ZOO', spokenName: 'zoo', article: 'a', sign: 'ZOO', icon: '🦁',
    category: 'attraction', zones: ['recreation', 'edge'], sizeClass: 'large',
    fallback: X.buildZoo, model: 'zoo.glb',
    keywords: ['zoo', 'zoos', 'the zoo', 'zu'],
    activities: ['see animals', 'see lions', 'see elephants', 'take photos'],
    celebration: 0.9, population: 9, vehicles: 2,
  },
  aquarium: {
    displayName: 'AQUARIUM', spokenName: 'aquarium', article: 'an', sign: 'AQUARIUM', icon: '🐬',
    category: 'attraction', zones: ['recreation'], sizeClass: 'medium',
    fallback: X.buildAquarium, model: 'aquarium.glb',
    keywords: ['aquarium', 'aqarium', 'aquariam', 'aquarion', 'aquaria'],
    activities: ['see fish', 'see dolphins', 'learn about the sea'],
    celebration: 0.8, population: 8, vehicles: 2,
  },
  museum: {
    displayName: 'MUSEUM', spokenName: 'museum', article: 'a', sign: 'MUSEUM', icon: '🖼️',
    category: 'attraction', zones: ['civic'], sizeClass: 'medium',
    factory: B.buildMuseum, model: 'museum.glb',
    keywords: ['museum', 'musium', 'muesum', 'museam'],
    activities: ['see art', 'learn about history'],
    celebration: 0.6, population: 5, vehicles: 1,
  },
  cinema: {
    displayName: 'MOVIE THEATER', spokenName: 'movie theater', article: 'a', sign: 'CINEMA', icon: '🎬',
    category: 'attraction', zones: ['recreation', 'commercial'], sizeClass: 'medium',
    fallback: X.buildMovieTheater, model: 'cinema.glb',
    keywords: ['movie theater', 'movie theatre', 'cinema', 'movie', 'movies', 'theater'],
    activities: ['watch a movie', 'eat popcorn'],
    celebration: 0.6, population: 7, vehicles: 2,
  },
  amusementPark: {
    displayName: 'AMUSEMENT PARK', spokenName: 'amusement park', article: 'an', sign: 'FUN PARK', icon: '🎡',
    category: 'attraction', zones: ['recreation', 'edge'], sizeClass: 'large',
    fallback: X.buildAmusementPark, model: 'amusement-park.glb',
    keywords: ['amusement park', 'amusement', 'theme park', 'fun park', 'amusment park'],
    activities: ['ride a roller coaster', 'have fun', 'ride the ferris wheel'],
    celebration: 1, population: 11, vehicles: 3,
  },
  castle: {
    displayName: 'CASTLE', spokenName: 'castle', article: 'a', sign: 'CASTLE', icon: '🏯',
    category: 'attraction', zones: ['edge', 'recreation'], sizeClass: 'large',
    fallback: X.buildCastle, model: 'castle.glb',
    keywords: ['castle', 'casle', 'cassel', 'castel'],
    activities: ['see the castle', 'learn about history', 'take photos'],
    celebration: 0.9, population: 7, vehicles: 2,
  },
  temple: {
    displayName: 'TEMPLE', spokenName: 'temple', article: 'a', sign: 'TEMPLE', icon: '⛩️',
    category: 'attraction', zones: ['civic', 'recreation', 'edge'], sizeClass: 'large',
    fallback: X.buildTemple, model: 'temple.glb',
    keywords: ['temple', 'shrine', 'tempel', 'templ'],
    activities: ['visit the temple', 'make a wish', 'see a festival'],
    celebration: 0.7, population: 5, vehicles: 1,
  },
  beach: {
    displayName: 'BEACH', spokenName: 'beach', article: 'a', sign: 'BEACH', icon: '🏖️',
    category: 'attraction', zones: ['edge', 'recreation'], sizeClass: 'large',
    fallback: X.buildBeach, model: 'beach.glb',
    preposition: 'at',
    keywords: ['beach', 'beech', 'bech', 'the beach'],
    activities: ['swim', 'play', 'relax', 'build a sandcastle'],
    celebration: 0.8, population: 8, vehicles: 1,
  },
  farm: {
    displayName: 'FARM', spokenName: 'farm', article: 'a', sign: 'FARM', icon: '🐄',
    category: 'attraction', zones: ['edge'], sizeClass: 'large',
    fallback: X.buildFarm, model: 'farm.glb',
    preposition: 'on',
    keywords: ['farm', 'pharm', 'farms', 'a farm'],
    activities: ['see animals', 'grow vegetables', 'feed the cows'],
    celebration: 0.6, population: 4, vehicles: 1,
  },

  /* ================= SHOPPING AND FOOD ================= */
  mall: {
    displayName: 'SHOPPING MALL', spokenName: 'shopping mall', article: 'a', sign: 'SHOPPING MALL', icon: '🛍️',
    category: 'shopping', zones: ['commercial'], sizeClass: 'large',
    factory: B.buildMall, model: 'mall.glb',
    keywords: ['mall', 'shopping mall', 'shopping center', 'shopping centre', 'moll'],
    activities: ['go shopping', 'buy clothes', 'meet friends'],
    celebration: 0.7, population: 9, vehicles: 2,
  },
  supermarket: {
    displayName: 'SUPERMARKET', spokenName: 'supermarket', article: 'a', sign: 'SUPERMARKET', icon: '🛒',
    category: 'shopping', zones: ['commercial'], sizeClass: 'medium',
    fallback: X.buildSupermarket, model: 'supermarket.glb',
    keywords: ['supermarket', 'super market', 'supermarkt', 'grocery store'],
    activities: ['buy food', 'buy vegetables', 'go shopping'],
    celebration: 0.5, population: 6, vehicles: 2,
  },
  convenience: {
    displayName: 'CONVENIENCE STORE', spokenName: 'convenience store', article: 'a', sign: 'STORE', icon: '🏪',
    category: 'shopping', zones: ['commercial'], sizeClass: 'small',
    fallback: X.buildConvenience, model: 'convenience.glb',
    keywords: ['convenience store', 'convenience', 'konbini', 'store', 'conveni'],
    activities: ['buy a drink', 'buy a snack', 'buy rice balls'],
    celebration: 0.4, population: 4, vehicles: 1,
  },
  restaurant: {
    displayName: 'RESTAURANT', spokenName: 'restaurant', article: 'a', sign: 'RESTAURANT', icon: '🍜',
    category: 'shopping', zones: ['commercial'], sizeClass: 'small',
    fallback: X.buildRestaurant, model: 'restaurant.glb',
    keywords: ['restaurant', 'restraunt', 'resturant', 'restrant'],
    activities: ['eat', 'have lunch', 'have dinner', 'eat ramen'],
    celebration: 0.5, population: 5, vehicles: 1,
  },
  cafe: {
    displayName: 'CAFE', spokenName: 'cafe', article: 'a', sign: 'CAFE', icon: '☕',
    category: 'shopping', zones: ['commercial'], sizeClass: 'small',
    fallback: X.buildCafe, model: 'cafe.glb',
    keywords: ['cafe', 'coffee shop', 'caffe', 'coffee'],
    activities: ['drink coffee', 'eat cake', 'talk with friends'],
    celebration: 0.4, population: 4, vehicles: 1,
  },
  bakery: {
    displayName: 'BAKERY', spokenName: 'bakery', article: 'a', sign: 'BAKERY', icon: '🥐',
    category: 'shopping', zones: ['commercial'], sizeClass: 'small',
    fallback: X.buildBakery, model: 'bakery.glb',
    keywords: ['bakery', 'bakary', 'bakerie', 'bread shop'],
    activities: ['buy bread', 'eat bread', 'buy a cake'],
    celebration: 0.4, population: 4, vehicles: 1,
  },
  bookstore: {
    displayName: 'BOOKSTORE', spokenName: 'bookstore', article: 'a', sign: 'BOOKS', icon: '📖',
    category: 'shopping', zones: ['commercial'], sizeClass: 'small',
    fallback: X.buildBookstore, model: 'bookstore.glb',
    keywords: ['bookstore', 'book store', 'book shop', 'bookshop'],
    activities: ['buy books', 'read', 'buy comics'],
    celebration: 0.4, population: 3, vehicles: 1,
  },

  /* ================= STAY AND HOME ================= */
  hotel: {
    displayName: 'HOTEL', spokenName: 'hotel', article: 'a', sign: 'HOTEL', icon: '🏨',
    category: 'stay', zones: ['commercial', 'edge'], sizeClass: 'medium',
    fallback: X.buildHotel, model: 'hotel.glb',
    keywords: ['hotel', 'hotal', 'hottel', 'hotels'],
    activities: ['stay', 'sleep', 'meet visitors'],
    celebration: 0.6, population: 6, vehicles: 2,
  },
  house: {
    displayName: HOUSE_LABEL.toUpperCase(), spokenName: HOUSE_LABEL, article: '', sign: HOUSE_LABEL, icon: '🏡',
    category: 'stay', zones: ['residential'], sizeClass: 'small',
    fallback: X.buildOwnerHouse, model: 'house.glb',
    keywords: [HOUSE_OWNER.toLowerCase(), `${HOUSE_OWNER.toLowerCase()}s house`, 'house', 'home'],
    activities: ['play games', 'eat dinner', 'watch TV', 'visit a friend'],
    celebration: 0.5, population: 3, vehicles: 1,
  },
};

/** Where GLB replacements are looked for. Drop stadium.glb in here - done. */
export const MODEL_BASE = 'assets/buildings/';

/**
 * Attach the second-phase content to the registry, so everything about a place
 * - how it looks, what it is called, and what you can do there - is reachable
 * from one object.
 */
for (const [type, def] of Object.entries(LANDMARKS)) {
  const physical = sizeClassFor(def.sizeClass);
  def.footprint = physical.envelope;
  def.id = type;
  def.activity = ACTIVITIES[type] || null;
  def.actionDefs = actionsFor(type);   // { id, phrases, anim, opts }
  def.actions = phrasesFor(type);      // flat phrase list, for matching
  def.hints = hintsFor(type);
  def.preferredAction = preferredFor(type);
  // "in the library", but "at the beach" and "on the farm"
  def.preposition = def.preposition || 'in';
}

/**
 * The places in play. Entries flagged `retired` stay in the file (so nothing
 * that references them breaks) but never appear as a choice or a tour stop.
 */
export const ALL_TYPES = Object.keys(LANDMARKS).filter((type) => !LANDMARKS[type].retired);

/** Apply the welcome-screen name to the already-created house definition. */
export function configureHouseOwner(value) {
  const owner = setHouseOwner(value);
  const label = `${owner}'s house`;
  const keyword = owner.toLowerCase();
  Object.assign(LANDMARKS.house, {
    displayName: label.toUpperCase(),
    spokenName: label,
    sign: label,
    keywords: [keyword, `${keyword}s house`, `${keyword}'s house`, 'house', 'home'],
  });
  return owner;
}

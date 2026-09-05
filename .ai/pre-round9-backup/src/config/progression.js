/**
 * PROGRESSION CONFIG
 * -------------------
 * Building unlocks are the only replay reward in this game: no points, no
 * score, no currency. A finished playthrough earns exactly one new place for
 * next time, and everything here is tunable in one spot.
 */

/**
 * Everyday places available from the very first playthrough, so town #1 never
 * feels thin. The more visually exciting places start locked and are
 * discovered through play - see `LOCKED_STARTERS` below, which is simply every
 * other active landmark.
 */
export const DEFAULT_UNLOCKED = [
  'school', 'library', 'hospital', 'police', 'fire', 'bank',
  'station', 'busStation', 'gasStation',
  'gym', 'park', 'playground',
  'supermarket', 'convenience', 'restaurant', 'cafe', 'bakery', 'bookstore',
  'hotel', 'house',
];

/** Mystery silhouettes appear this many times across one full run, at most. */
export const MYSTERY_APPEARANCES_MIN = 2;
export const MYSTERY_APPEARANCES_MAX = 3;

/** Never show a mystery card two rounds in a row. */
export const MYSTERY_MIN_GAP = 2;

/**
 * Rounds reserved as "just play" - no mystery card in the very first round
 * (let the child get oriented) or the very last (don't complicate the final
 * choice of a run).
 */
export const MYSTERY_SKIP_FIRST_ROUNDS = 1;
export const MYSTERY_SKIP_LAST_ROUNDS = 1;

/** How many buildings a fully completed run (all three phases) unlocks. */
export const UNLOCKS_PER_COMPLETED_RUN = 1;

/** How many times a newly unlocked place can appear as NEW before it fades. */
export const NEW_BADGE_APPEARANCES = 2;

export const STORAGE_KEY = 'matsubara.unlocks.v1';

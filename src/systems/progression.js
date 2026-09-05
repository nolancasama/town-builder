import { ALL_TYPES } from '../config/landmarks.js';
import {
  DEFAULT_UNLOCKED, MYSTERY_APPEARANCES_MIN, MYSTERY_APPEARANCES_MAX,
  MYSTERY_MIN_GAP, MYSTERY_SKIP_FIRST_ROUNDS, MYSTERY_SKIP_LAST_ROUNDS,
  UNLOCKS_PER_COMPLETED_RUN, NEW_BADGE_APPEARANCES, STORAGE_KEY,
} from '../config/progression.js';

/**
 * BUILDING PROGRESSION
 * --------------------
 * The only replay reward in this game: no points, no score, no currency.
 *
 * Two states are kept deliberately separate (per the design brief):
 *   unlocked     - the child is allowed to encounter this place across
 *                  playthroughs. Persists in localStorage.
 *   builtThisRun - this place currently exists in this session's Matsubara.
 *                  Lives entirely in main.js's `built` array and is never
 *                  touched here.
 *
 * A completed run - all the way through the phase 3 guided-tour finale, not
 * just construction - unlocks exactly one new place, preferring one the child
 * actually glimpsed as a mystery silhouette during that run. That is the whole
 * loop: curiosity during play, a small discovery at the end, a reason to build
 * Matsubara again.
 */
export function createProgression({ rng }) {
  let unlocked = new Set(DEFAULT_UNLOCKED);
  let newly = new Set();
  let appearances = new Map(); // type -> how many times shown as a NEW choice
  let storageOK = true;

  function load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const valid = new Set(ALL_TYPES);
      const saved = Array.isArray(data.unlocked) ? data.unlocked.filter((id) => valid.has(id)) : [];
      // union with the defaults: if the starter set ever grows, nobody loses
      // access to a place they already had.
      unlocked = new Set([...DEFAULT_UNLOCKED, ...saved]);
      newly = new Set((data.newlyUnlocked || []).filter((id) => valid.has(id) && unlocked.has(id)));
      appearances = new Map(Object.entries(data.appearances || {}));
    } catch (err) {
      storageOK = false;
      console.warn('[progression] localStorage unavailable - unlocks will not persist:', err && err.message);
    }
  }

  function save() {
    if (!storageOK) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          unlocked: [...unlocked],
          newlyUnlocked: [...newly],
          appearances: Object.fromEntries(appearances),
        })
      );
    } catch (err) {
      storageOK = false;
      console.warn('[progression] could not save unlocks:', err && err.message);
    }
  }

  load();

  /* ---------------- per-run mystery scheduling ---------------- */

  let mysteryRounds = new Set();
  let shownThisRun = new Set();

  function lockedTypes() {
    return ALL_TYPES.filter((type) => !unlocked.has(type));
  }

  /** Called once at the start of a playthrough (fresh load or Play Again). */
  function startRun(targetCount) {
    shownThisRun = new Set();
    mysteryRounds = new Set();

    const locked = lockedTypes();
    const firstEligible = 1 + MYSTERY_SKIP_FIRST_ROUNDS;
    const lastEligible = targetCount - MYSTERY_SKIP_LAST_ROUNDS;
    if (locked.length === 0 || firstEligible > lastEligible) return;

    const eligible = [];
    for (let r = firstEligible; r <= lastEligible; r++) eligible.push(r);
    for (let i = eligible.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }

    const want = Math.min(
      locked.length,
      eligible.length,
      MYSTERY_APPEARANCES_MIN + Math.floor(rng() * (MYSTERY_APPEARANCES_MAX - MYSTERY_APPEARANCES_MIN + 1))
    );
    for (const round of eligible) {
      if (mysteryRounds.size >= want) break;
      const tooClose = [...mysteryRounds].some((r) => Math.abs(r - round) < MYSTERY_MIN_GAP);
      if (!tooClose) mysteryRounds.add(round);
    }
  }

  /**
   * Decide whether round `roundIndex` (1-based) shows a mystery silhouette,
   * and if so which locked place it teases. The caller only asks this when
   * the real choice pool is still healthy - see main.js - so a mystery card
   * never reduces an already-thin round.
   */
  function maybeShowMystery(roundIndex) {
    if (!mysteryRounds.has(roundIndex)) return null;
    const locked = lockedTypes();
    if (!locked.length) return null;
    const unseen = locked.filter((type) => !shownThisRun.has(type));
    const pick = (unseen.length ? unseen : locked)[Math.floor(rng() * (unseen.length ? unseen.length : locked.length))];
    shownThisRun.add(pick);
    return pick;
  }

  /* ---------------- unlocking ---------------- */

  /** A real (non-mystery) choice was shown - track NEW-badge lifetime. */
  function noteChoiceShown(type) {
    if (!newly.has(type)) return;
    const count = (appearances.get(type) || 0) + 1;
    if (count >= NEW_BADGE_APPEARANCES) {
      newly.delete(type);
      appearances.delete(type);
    } else {
      appearances.set(type, count);
    }
    save();
  }

  /** The place was actually built - the NEW badge has done its job. */
  function noteBuilt(type) {
    if (newly.delete(type)) {
      appearances.delete(type);
      save();
    }
  }

  /**
   * The full experience just finished: town built, spoken about, and toured.
   * Reward one new place, preferring something this run actually teased.
   * Returns the unlocked type id, or null if everything is already unlocked.
   */
  function completeRun() {
    const locked = lockedTypes();
    if (!locked.length) return null;

    const seenThisRun = [...shownThisRun].filter((type) => locked.includes(type));
    const pool = seenThisRun.length ? seenThisRun : locked;
    const rewarded = [];
    for (let i = 0; i < UNLOCKS_PER_COMPLETED_RUN && pool.length; i++) {
      const pick = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      unlocked.add(pick);
      newly.add(pick);
      appearances.set(pick, 0);
      rewarded.push(pick);
    }
    save();
    return rewarded[0] || null;
  }

  return {
    unlockedSet: () => unlocked,
    isUnlocked: (type) => unlocked.has(type),
    isNew: (type) => newly.has(type),
    lockedTypes,
    startRun,
    maybeShowMystery,
    noteChoiceShown,
    noteBuilt,
    completeRun,

    /**
     * Debug control: make every place buildable at once. Persists exactly like
     * a real unlock, so `resetAll()` is the way back to a normal profile.
     * Returns how many places are now available.
     */
    unlockAll() {
      unlocked = new Set(ALL_TYPES);
      newly = new Set();
      save();
      return unlocked.size;
    },

    /** Teacher control: wipe progression back to the starting set. */
    resetAll() {
      unlocked = new Set(DEFAULT_UNLOCKED);
      newly = new Set();
      appearances = new Map();
      shownThisRun = new Set();
      mysteryRounds = new Set();
      save();
    },
  };
}

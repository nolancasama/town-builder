import { LANDMARKS, ALL_TYPES } from '../config/landmarks.js';
import { CHOICES_PER_ROUND } from '../config/lessons.js';
import { canPlace } from '../buildings/index.js';

/**
 * BUILDING CHOICES
 * ----------------
 * Each round offers a few places the town could have. The only real decision a
 * child makes is "what should our town have?" - never "where exactly does it
 * go?" - so this module just has to keep the menu interesting.
 *
 * Rules that do most of the work:
 *   - never offer something that has nowhere left to stand
 *   - never offer a place the child has not unlocked yet (see progression.js -
 *     an unset `unlockedTypes` allows everything, so tools and tests that
 *     don't care about progression are unaffected)
 *   - prefer three different categories, so the menu is not
 *     "cafe / bakery / restaurant" unless that really is all that is left
 */

/** Places that could legally be offered this round, before any trimming. */
export function availableChoices(builtTypes, takenLotIds, unlockedTypes = null) {
  const built = new Set(builtTypes);
  return ALL_TYPES.filter(
    (type) =>
      !built.has(type) &&
      (!unlockedTypes || unlockedTypes.has(type)) &&
      canPlace(type, takenLotIds)
  );
}

export function pickChoices(builtTypes, takenLotIds, rng, count = CHOICES_PER_ROUND, unlockedTypes = null) {
  const available = availableChoices(builtTypes, takenLotIds, unlockedTypes);
  if (available.length <= count) return available;

  // shuffle once, then take greedily while keeping the categories distinct
  const pool = available.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const chosen = [];
  const usedCategories = new Set();
  for (const type of pool) {
    if (chosen.length >= count) break;
    const category = LANDMARKS[type].category;
    if (usedCategories.has(category)) continue;
    chosen.push(type);
    usedCategories.add(category);
  }
  // top up if there were not enough distinct categories left
  for (const type of pool) {
    if (chosen.length >= count) break;
    if (!chosen.includes(type)) chosen.push(type);
  }
  return chosen;
}

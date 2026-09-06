/**
 * PLAYER-GIVEN BUILDING NAMES
 * ---------------------------
 * A child can rename any place they have built - "Ken's School", "Mario Cafe" -
 * and the name sticks across sessions.
 *
 * This deliberately renames the *place*, not the *lesson*. The target sentence
 * stays "We have a school in Matsubara." however the school is nicknamed,
 * because that sentence is the thing being taught and a custom noun would make
 * it wrong. The nickname is shown on the landmark card, with the real English
 * word kept visible underneath so the vocabulary is never hidden by it.
 */

const STORAGE_KEY = 'townbuilder.buildingNames';
const MAX_LENGTH = 24;

export function createBuildingNames() {
  let names = new Map();
  let storageOK = true;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) names = new Map(Object.entries(JSON.parse(raw)));
  } catch (err) {
    storageOK = false;
    console.warn('[names] localStorage unavailable - custom names will not persist:', err && err.message);
  }

  function save() {
    if (!storageOK) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(names)));
    } catch (err) {
      storageOK = false;
      console.warn('[names] could not save custom names:', err && err.message);
    }
  }

  /** Collapse whitespace and cap the length so it cannot break the card. */
  function clean(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  }

  return {
    /** The player's name for this place, or null if they have not set one. */
    get(type) {
      return names.get(type) || null;
    },

    has(type) {
      return names.has(type);
    },

    /** Set a name; an empty string clears it and restores the default. */
    set(type, text) {
      const value = clean(text);
      if (!value) names.delete(type);
      else names.set(type, value);
      save();
      return value || null;
    },

    clear(type) {
      names.delete(type);
      save();
    },

    clearAll() {
      names.clear();
      save();
    },

    maxLength: MAX_LENGTH,
  };
}

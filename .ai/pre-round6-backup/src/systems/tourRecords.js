import { LANDMARKS } from '../config/landmarks.js';

/**
 * TOUR SCRIPT
 * -----------
 * Everything the child said, kept so the guided tour can be built from it.
 *
 * This is the bridge between the three phases: phase one records "We have a
 * stadium in Matsubara", phase two records "We can watch soccer in the
 * stadium", and phase three replays both - in the child's own voice - as the
 * guide's dialogue. Nothing here is invented; a place the child skipped simply
 * has no activity line, and the guide says only what was actually said.
 */
export function createTourRecords() {
  /** placeId -> { placeId, build, activity, order } */
  const records = new Map();
  let order = 0;

  function ensure(placeId) {
    if (!records.has(placeId)) {
      records.set(placeId, {
        placeId,
        displayName: LANDMARKS[placeId] ? LANDMARKS[placeId].displayName : placeId,
        build: null,
        activity: null,
        order: order++,
      });
    }
    return records.get(placeId);
  }

  return {
    /**
     * Store a line the child successfully said.
     * `kind` is 'build' or 'activity'; a later accepted attempt replaces an
     * earlier one, so what is kept is always the take that worked.
     */
    remember(placeId, kind, { transcript, audio = null, action = null } = {}) {
      const record = ensure(placeId);
      record[kind] = {
        transcript: (transcript || '').trim(),
        audio,
        buffer: null,
        normalizedAction: action ? action.id : null,
        action,
      };
      return record;
    },

    /** Attach the recording to a line already stored (audio arrives async). */
    attachAudio(placeId, kind, audio) {
      const record = records.get(placeId);
      if (!record || !record[kind] || !audio) return;
      record[kind].audio = audio;
    },

    get(placeId) {
      return records.get(placeId) || null;
    },

    /** Every place the child built, in the order they built it. */
    all() {
      return [...records.values()].sort((a, b) => a.order - b.order);
    },

    /** Places that have at least a build sentence - the tour's stops. */
    stops(builtTypes) {
      return builtTypes.map((type) => records.get(type)).filter(Boolean);
    },

    /** How much of the tour will be in the child's own voice. */
    stats() {
      const all = [...records.values()];
      return {
        places: all.length,
        lines: all.reduce((n, r) => n + (r.build ? 1 : 0) + (r.activity ? 1 : 0), 0),
        recorded: all.reduce(
          (n, r) => n + (r.build && r.build.audio ? 1 : 0) + (r.activity && r.activity.audio ? 1 : 0),
          0
        ),
      };
    },

    clear() {
      records.clear();
      order = 0;
    },
  };
}

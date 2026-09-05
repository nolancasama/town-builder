import { LESSON, MATCHING } from '../config/lessons.js';

/**
 * SPEECH
 * ------
 * A thin wrapper over the Web Speech API plus a deliberately forgiving matcher.
 *
 * The pedagogical rule here: a child who says the sentence well enough for a
 * teacher to understand must always be rewarded. Recognition noise is the
 * game's problem, not the child's - so the matcher does fuzzy word matching,
 * only insists on the noun being taught, and treats the city name as a bonus.
 */

function normalise(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[.,!?;:"'`()\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  let curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

/** Is `word` present in the spoken tokens, allowing for small mis-hearings? */
function hasWord(tokens, word) {
  const slack = MATCHING.fuzz(word);
  return tokens.some((t) => t === word || levenshtein(t, word) <= slack);
}

/** Does the transcript contain any of these keywords / keyword phrases? */
function hasAny(text, tokens, keywords) {
  for (const kw of keywords) {
    if (kw.includes(' ')) {
      if (text.includes(kw)) return true;
      const parts = kw.split(' ');
      if (parts.every((p) => hasWord(tokens, p))) return true;
    } else if (hasWord(tokens, kw)) {
      return true;
    }
  }
  return false;
}

/**
 * Compare a transcript against the current target landmark.
 * Returns which pieces were heard so the UI can give useful, gentle feedback.
 */
export function matchSentence(transcript, landmark) {
  const text = normalise(transcript);
  const tokens = text.split(' ').filter(Boolean);

  const noun = hasAny(text, tokens, landmark.keywords);
  const city = hasAny(text, tokens, [normalise(LESSON.city), ...LESSON.cityAlternates]);
  const coreHits = LESSON.coreWords.filter((w) => hasWord(tokens, w));
  const coreOk = coreHits.length / LESSON.coreWords.length >= MATCHING.coreThreshold;

  const ok =
    (!MATCHING.requireNoun || noun) &&
    (!MATCHING.requireCity || city) &&
    coreOk &&
    tokens.length >= 2;

  return { ok, noun, city, core: coreOk, text, tokens };
}

/**
 * Recognition wrapper. Falls back gracefully: `supported` is false on browsers
 * without the API, and the UI then offers a typing route instead so a broken
 * microphone never blocks the lesson.
 */
export function createSpeech({ onStart, onResult, onEnd, onError } = {}) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const supported = Boolean(Recognition);
  let recognition = null;
  let listening = false;
  let guard = null;

  function build() {
    const r = new Recognition();
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = true;
    r.maxAlternatives = 3;

    let finalText = '';
    let bestInterim = '';

    r.onstart = () => {
      listening = true;
      if (onStart) onStart();
    };

    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const alternatives = [];
        for (let a = 0; a < result.length; a++) alternatives.push(result[a].transcript);
        if (result.isFinal) finalText += ` ${alternatives.join(' ')}`;
        else bestInterim = alternatives[0];
      }
      if (onResult) onResult((finalText || bestInterim).trim(), Boolean(finalText));
    };

    r.onerror = (event) => {
      if (onError) onError(event.error);
    };

    r.onend = () => {
      listening = false;
      clearTimeout(guard);
      if (onEnd) onEnd((finalText || bestInterim).trim());
      finalText = '';
      bestInterim = '';
    };

    return r;
  }

  return {
    supported,
    get listening() {
      return listening;
    },

    listen(maxSeconds = 7) {
      if (!supported || listening) return false;
      recognition = build();
      try {
        recognition.start();
      } catch (err) {
        if (onError) onError('start-failed');
        return false;
      }
      clearTimeout(guard);
      guard = setTimeout(() => {
        try {
          recognition.stop();
        } catch (err) {
          /* already stopped */
        }
      }, maxSeconds * 1000);
      return true;
    },

    stop() {
      clearTimeout(guard);
      if (recognition && listening) {
        try {
          recognition.stop();
        } catch (err) {
          /* ignore */
        }
      }
    },

    abort() {
      clearTimeout(guard);
      if (recognition) {
        try {
          recognition.abort();
        } catch (err) {
          /* ignore */
        }
      }
      listening = false;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Phase two: "We can ___ in the ___."
 * ------------------------------------------------------------------ */

const STOPWORDS = new Set(['a', 'an', 'the', 'some', 'to', 'my', 'our', 'your', 'at', 'in', 'on', 'of']);

/** Content words of a phrase - the bits that actually carry the meaning. */
function contentWords(phrase) {
  return normalise(phrase)
    .split(' ')
    .filter((w) => w && !STOPWORDS.has(w));
}

/**
 * Does the transcript contain this idea? Every content word of the phrase has
 * to show up (fuzzily), so "watch a baseball game" matches "watch baseball",
 * and a longer answer that happens to contain the idea still counts.
 */
function hasPhrase(tokens, phrase) {
  const words = contentWords(phrase);
  if (!words.length) return false;
  return words.every((w) => hasWord(tokens, w) || hasWord(tokens, `${w}s`) || hasWord(tokens, `${w}ing`));
}

/**
 * Grade a free-ish spoken answer about a place.
 *
 * This is a production activity, not a guessing game: the child is credited for
 * saying something sensible about the building in roughly the target pattern.
 * The action has to come from that place's bank, "we"/"can" carry the grammar,
 * and naming the location is treated as a bonus rather than a requirement -
 * "in the shopping mall" is the part recognition mangles most, and failing a
 * child for the recogniser's mistake is exactly what this game must not do.
 */
export function matchAction(transcript, landmark) {
  const text = normalise(transcript);
  const tokens = text.split(' ').filter(Boolean);

  // Longer phrases win, so "watch a baseball game" is preferred over the bare
  // "watch a game" and the right animation gets picked.
  let action = null;
  let matched = null;
  let best = -1;
  for (const def of landmark.actionDefs || []) {
    for (const phrase of def.phrases) {
      if (!hasPhrase(tokens, phrase)) continue;
      const weight = contentWords(phrase).length;
      if (weight > best) {
        best = weight;
        matched = phrase;
        action = def;
      }
    }
  }

  const canWords = ['we', 'can'];
  const coreHits = canWords.filter((w) => hasWord(tokens, w));
  const core = coreHits.length / canWords.length >= MATCHING.coreThreshold;
  const place = hasAny(text, tokens, landmark.keywords);
  const preposition = hasWord(tokens, 'in') || hasWord(tokens, 'at') || hasWord(tokens, 'on');

  return {
    ok: Boolean(matched) && core && tokens.length >= 3,
    matched,
    action,
    core,
    place,
    preposition,
    text,
    /** Said a good idea but dropped the grammar frame. */
    nearMiss: Boolean(matched) && !core,
  };
}

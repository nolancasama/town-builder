/**
 * LESSON DATA
 * -----------
 * The English content of the game, kept deliberately separate from the 3D code.
 * A teacher can change the city, the child's name, how many landmarks make a
 * finished town, or the sentence pattern - without touching anything else.
 */

/** The town everything is built in. This is the single source of truth. */
export const CITY_NAME = 'Matsubara';

/** Whose house appears in the building pool ("Ken's house"). */
export const HOUSE_OWNER = 'Ken';

/** How many landmarks the class builds before the finale. */
export const BUILD_TARGET = 10;

/** How many options the child chooses between each round. */
export const CHOICES_PER_ROUND = 3;

export const LESSON = {
  city: CITY_NAME,

  /** Extra spellings the recogniser might return for the city name. */
  cityAlternates: [
    'matsubara', 'matsu bara', 'matsubaru', 'matsabara', 'mazubara',
    'matsu para', 'matsuwara',
  ],

  /** Words that must appear (fuzzily) in every sentence. */
  coreWords: ['we', 'have'],

  /**
   * How the target sentence is written on screen and spoken by the child.
   * `landmark` is an entry from the building registry.
   */
  sentence: (landmark, city = CITY_NAME) => {
    const article = landmark.article ? `${landmark.article} ` : '';
    return `We have ${article}${landmark.spokenName} in ${city}.`;
  },

  /**
   * How a place is referred to inside a sentence. Most take "in the ___", but
   * "in the beach" and "in the farm" are not English, and "the Ken's house" is
   * not either - so the preposition and the article both come from the registry.
   */
  placePhrase: (landmark) => {
    const article = landmark.article ? 'the ' : '';
    return `${landmark.preposition || 'in'} ${article}${landmark.spokenName}`;
  },

  /** Phase two: "We can read books in the library." */
  activitySentence: (landmark, activity) =>
    `We can ${activity} ${LESSON.placePhrase(landmark)}.`,
};

/**
 * How forgiving the matcher is.
 * The goal is that a child who says the sentence clearly enough for a teacher
 * to understand is always rewarded - recognition noise must never feel like a
 * punishment.
 */
export const MATCHING = {
  /** Fraction of core words (we / have) that must be found. */
  coreThreshold: 0.5,
  /** The landmark noun must be found - this is the word being taught. */
  requireNoun: true,
  /** The city name is a bonus, not a requirement (it is the hardest word). */
  requireCity: false,
  /** Levenshtein slack allowed per word, scaled by word length. */
  fuzz: (word) => (word.length <= 4 ? 1 : word.length <= 7 ? 2 : 3),
};

/**
 * AUDIO
 * -----
 * Every sound is synthesised with WebAudio - no files to download, nothing to
 * wait for, and it keeps the whole game a single small bundle. Tones are soft
 * sine/triangle blends because this runs in a classroom of thirty Chromebooks.
 */

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];

/* ------------------------------------------------------------------ *
 * Background music
 * ------------------------------------------------------------------ *
 * Written as note data and played by a look-ahead scheduler, the way a MIDI
 * sequencer would - no audio file, nothing to download, and it loops forever
 * without a seam. Everything is in C major pentatonic so it can never clash
 * with the game's existing cues, which are drawn from the same scale.
 *
 * The tune is deliberately unobtrusive: a teacher has this playing for a
 * forty-minute lesson, so it stays quiet, avoids strong downbeats, and has no
 * percussion to count along with.
 */
const BPM = 92;
const BEAT = 60 / BPM;
const STEP = BEAT / 2;            // eighth notes
const STEPS_PER_BAR = 8;

/** Semitone offsets from C, as a frequency multiplier table. */
const semitone = (n) => Math.pow(2, n / 12);
const C4 = 261.63;
/** Scale degrees of the C major pentatonic, in semitones from C. */
const SCALE = [0, 2, 4, 7, 9];

/** Frequency for a scale degree, where 0 is C4 and 5 wraps to the next octave. */
function noteAt(degree, octave = 0) {
  const idx = ((degree % SCALE.length) + SCALE.length) % SCALE.length;
  const oct = octave + Math.floor(degree / SCALE.length);
  return C4 * semitone(SCALE[idx] + oct * 12);
}

/**
 * Eight bars. `-1` is a rest. Melody sits an octave up, bass an octave down,
 * and the pad holds one open fifth per bar. Two melody variants alternate so a
 * long session does not turn into the same eight bars over and over.
 */
const MELODY_A = [
  4, -1, 3, -1, 2, -1, 3, -1,
  2, -1, 1, -1, 0, -1, -1, -1,
  1, -1, 2, -1, 3, -1, 4, -1,
  3, -1, -1, -1, 2, -1, -1, -1,
  4, -1, 5, -1, 4, -1, 3, -1,
  2, -1, 3, -1, 4, -1, -1, -1,
  1, -1, 0, -1, 1, -1, 2, -1,
  0, -1, -1, -1, -1, -1, -1, -1,
];
const MELODY_B = [
  2, -1, 4, -1, 3, -1, -1, -1,
  1, -1, 3, -1, 2, -1, -1, -1,
  0, -1, 2, -1, 4, -1, 3, -1,
  2, -1, -1, -1, -1, -1, -1, -1,
  5, -1, 4, -1, 2, -1, 3, -1,
  4, -1, -1, -1, 3, -1, 2, -1,
  1, -1, 2, -1, 0, -1, 1, -1,
  0, -1, -1, -1, -1, -1, -1, -1,
];
/** One root per bar: I - V - vi - IV shaped, in pentatonic degrees. */
const BASS = [0, 3, 4, 2, 0, 3, 1, 2];

export function createAudio() {
  let ctx = null;
  let master = null;
  let ambientGain = null;
  let musicGain = null;
  let muted = false;
  let started = false;
  let birdTimer = null;
  let activity = 0; // 0..1, grows as the town fills up

  // sequencer state
  let musicOn = false;
  let musicTimer = null;
  let nextNoteTime = 0;
  let step = 0;
  let loopCount = 0;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    ambientGain = ctx.createGain();
    ambientGain.gain.value = 0.0;
    ambientGain.connect(master);
    // Music has its own trim so it can sit under the effects without the
    // effects having to be made louder. It still routes through master, so
    // duck() and mute affect it too - which is what you want under a recording.
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.0;
    musicGain.connect(master);
    return ctx;
  }

  /** One music note. Softer envelope than `tone`, and on the music bus. */
  function musicNote(freq, time, duration, { gain = 0.05, type = 'triangle' } = {}) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(g).connect(musicGain);
    osc.start(time);
    osc.stop(time + duration + 0.03);
  }

  /** Schedule whatever falls in the current look-ahead window. */
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    const horizon = ctx.currentTime + 0.25;
    while (nextNoteTime < horizon) {
      const melody = (loopCount % 2 === 0) ? MELODY_A : MELODY_B;
      const bar = Math.floor(step / STEPS_PER_BAR);

      const m = melody[step];
      if (m >= 0) musicNote(noteAt(m, 1), nextNoteTime, STEP * 1.7, { gain: 0.043, type: 'triangle' });

      // bass on the first and fifth eighth of each bar
      const inBar = step % STEPS_PER_BAR;
      if (inBar === 0 || inBar === 4) {
        musicNote(noteAt(BASS[bar], -1), nextNoteTime, BEAT * 1.5, { gain: 0.055, type: 'sine' });
      }
      // one soft open fifth per bar, holding underneath
      if (inBar === 0) {
        musicNote(noteAt(BASS[bar], 0), nextNoteTime, BEAT * 3.4, { gain: 0.018, type: 'sine' });
        musicNote(noteAt(BASS[bar] + 2, 0), nextNoteTime, BEAT * 3.4, { gain: 0.014, type: 'sine' });
      }

      nextNoteTime += STEP;
      step++;
      if (step >= melody.length) { step = 0; loopCount++; }
    }
  }

  function tone(freq, { duration = 0.4, type = 'sine', gain = 0.18, delay = 0, glide = 0, attack = 0.01 } = {}) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + glide), t0 + duration);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst({ duration = 0.6, gain = 0.12, freq = 500, q = 0.8, delay = 0, sweep = -260 } = {}) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq, t0);
    filter.frequency.linearRampToValueAtTime(Math.max(90, freq + sweep), t0 + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t0);
  }

  function chirp() {
    if (muted) return;
    const base = 1500 + Math.random() * 900;
    tone(base, { duration: 0.12, gain: 0.045, type: 'sine', glide: 420 });
    tone(base * 1.18, { duration: 0.1, gain: 0.035, type: 'sine', delay: 0.14, glide: -260 });
  }

  function scheduleBirds() {
    clearTimeout(birdTimer);
    birdTimer = setTimeout(() => {
      if (started) chirp();
      scheduleBirds();
    }, 3500 + Math.random() * 7000);
  }

  const api = {
    /** Must be called from a user gesture (the first mic tap). */
    start() {
      if (started) return;
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      started = true;
      api.setActivity(activity);
      scheduleBirds();
      api.startMusic();
    },

    /**
     * Begin the looping background theme. Safe to call repeatedly; only the
     * first call starts the sequencer. Needs a resumed AudioContext, so this is
     * driven from `start()` (itself gated on a user gesture).
     */
    startMusic() {
      if (musicOn || !ensure()) return;
      musicOn = true;
      step = 0;
      loopCount = 0;
      nextNoteTime = ctx.currentTime + 0.12;
      musicGain.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 1.4);
      // A 40ms timer against a 250ms look-ahead: the audio clock does the
      // timing, this only has to refill the queue in good time.
      clearInterval(musicTimer);
      musicTimer = setInterval(scheduleMusic, 40);
      scheduleMusic();
    },

    stopMusic() {
      musicOn = false;
      clearInterval(musicTimer);
      musicTimer = null;
      if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    },

    /** Teacher control: quieten or restore the music without touching effects. */
    setMusicVolume(value) {
      if (!musicGain || !ctx) return;
      musicGain.gain.setTargetAtTime(muted ? 0 : Math.max(0, Math.min(1, value)), ctx.currentTime, 0.3);
    },

    get muted() {
      return muted;
    },

    toggleMute() {
      muted = !muted;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.08);
      return muted;
    },

    /** Town ambience swells as the town grows. */
    setActivity(value) {
      activity = Math.max(0, Math.min(1, value));
      if (ambientGain && ctx) {
        ambientGain.gain.setTargetAtTime(0.02 + activity * 0.05, ctx.currentTime, 1.5);
      }
    },

    /**
     * Pull the town down under the child's own recording. Their voice is the
     * point of the guided tour - nothing should compete with it.
     */
    duck(amount = 0) {
      if (!master || !ctx) return;
      const level = muted ? 0 : 0.55 * (1 - Math.max(0, Math.min(1, amount)));
      master.gain.setTargetAtTime(level, ctx.currentTime, 0.15);
    },

    /** Camera shutter - the running joke of the guided tour. */
    shutter() {
      noiseBurst({ duration: 0.09, gain: 0.13, freq: 2600, q: 1.6, sweep: -1400 });
      tone(2100, { duration: 0.05, gain: 0.05, type: 'square' });
    },

    /** A short, warm "oh!" from the group - never words, never a distraction. */
    react(pitch = 1) {
      const base = 300 * pitch;
      tone(base, { duration: 0.34, gain: 0.075, type: 'sine', glide: base * 0.5 });
      tone(base * 1.5, { duration: 0.26, gain: 0.035, type: 'triangle', delay: 0.04 });
    },

    /** Applause for the end of the tour: a swell of filtered noise claps. */
    applause(duration = 3) {
      for (let i = 0; i < Math.floor(duration * 14); i++) {
        noiseBurst({
          duration: 0.07,
          gain: 0.035 + Math.random() * 0.03,
          freq: 1400 + Math.random() * 1800,
          q: 1.1,
          delay: Math.random() * duration,
          sweep: -700,
        });
      }
      [0, 0.3, 0.62].forEach((d, i) => {
        tone(PENTATONIC[i + 2], { duration: 0.7, gain: 0.11, type: 'triangle', delay: d });
      });
    },

    /**
     * Advancing a line of the opening character's dialogue. Short and dry - it
     * fires once per tap through a seven-beat scene, so anything with a tail
     * would stack up and start to nag.
     */
    speechAdvance() {
      tone(760, { duration: 0.075, gain: 0.075, type: 'triangle' });
      tone(1140, { duration: 0.055, gain: 0.04, type: 'sine', delay: 0.035 });
    },

    /** The character starts a new line: a softer, lower partner to the above. */
    speechBlip() {
      tone(430, { duration: 0.07, gain: 0.05, type: 'sine' });
    },

    micOn() {
      tone(660, { duration: 0.16, gain: 0.14, type: 'triangle' });
      tone(990, { duration: 0.22, gain: 0.1, type: 'sine', delay: 0.07 });
    },

    micOff() {
      tone(520, { duration: 0.14, gain: 0.08, type: 'sine' });
    },

    /** Warm, unmistakably positive - the moment the sentence lands. */
    success() {
      [0, 0.09, 0.18, 0.3].forEach((d, i) => {
        tone(PENTATONIC[i], { duration: 0.5, gain: 0.16, type: 'triangle', delay: d });
        tone(PENTATONIC[i] * 2, { duration: 0.35, gain: 0.05, type: 'sine', delay: d });
      });
    },

    /** Friendly, never a buzzer. */
    retry() {
      tone(520, { duration: 0.22, gain: 0.11, type: 'sine' });
      tone(430, { duration: 0.3, gain: 0.1, type: 'sine', delay: 0.13 });
    },

    construction() {
      noiseBurst({ duration: 1.5, gain: 0.1, freq: 420, sweep: -300 });
      for (let i = 0; i < 5; i++) {
        tone(160 + i * 12, { duration: 0.18, gain: 0.07, type: 'square', delay: 0.15 + i * 0.28 });
      }
    },

    land() {
      noiseBurst({ duration: 0.45, gain: 0.16, freq: 240, sweep: -160 });
      tone(110, { duration: 0.4, gain: 0.16, type: 'sine' });
      tone(PENTATONIC[2], { duration: 0.6, gain: 0.1, type: 'triangle', delay: 0.12 });
      tone(PENTATONIC[4], { duration: 0.7, gain: 0.08, type: 'sine', delay: 0.2 });
    },

    sparkle() {
      for (let i = 0; i < 6; i++) {
        tone(PENTATONIC[i % PENTATONIC.length] * 2, {
          duration: 0.3, gain: 0.05, type: 'sine', delay: i * 0.06,
        });
      }
    },

    /** A short celebratory hook for the finale. */
    finale() {
      const melody = [0, 2, 4, 5, 4, 2, 0, 4, 5];
      melody.forEach((step, i) => {
        const f = PENTATONIC[step % PENTATONIC.length];
        tone(f, { duration: 0.55, gain: 0.15, type: 'triangle', delay: i * 0.34 });
        tone(f / 2, { duration: 0.7, gain: 0.08, type: 'sine', delay: i * 0.34 });
      });
      [0, 1.36, 2.72].forEach((d) => {
        tone(PENTATONIC[0] / 2, { duration: 1.2, gain: 0.09, type: 'sine', delay: d });
      });
    },

    dispose() {
      clearTimeout(birdTimer);
      clearInterval(musicTimer);
      musicOn = false;
      if (ctx) ctx.close();
    },
  };

  return api;
}

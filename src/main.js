import * as THREE from 'three';
import { WORLD, CAMERA, LANDMARK_LOTS } from './config/town.js';
import { LESSON, BUILD_TARGET, CHOICES_PER_ROUND } from './config/lessons.js';
import { LANDMARKS, ALL_TYPES, configureHouseOwner } from './config/landmarks.js';
import { makeRng } from './core/rng.js';
import { updateTweens } from './core/tween.js';
import { updateSway } from './core/materials.js';
import { buildWorld, createLighting } from './world/index.js';
import { loadLandmark, selectLot } from './buildings/index.js';
import { createCameraRig } from './systems/cameraRig.js';
import { createParticles } from './systems/particles.js';
import { createPedestrians } from './systems/pedestrians.js';
import { createVehicles } from './systems/vehicles.js';
import { createAudio } from './systems/audio.js';
import { createSpeech, matchSentence, matchAction } from './systems/speech.js';
import { runConstruction } from './systems/construction.js';
import { runFinale } from './systems/finale.js';
import { createExplore } from './systems/explore.js';
import { createHUD } from './ui/hud.js';
import { pickChoices, availableChoices } from './systems/choices.js';
import { createTour } from './systems/tour.js';
import { createActivityDirector } from './systems/activities.js';
import { createRecorder } from './systems/recorder.js';
import { createTourRecords } from './systems/tourRecords.js';
import { createGuidedTour } from './systems/guidedTour.js';
import { createProgression } from './systems/progression.js';
import { createUnlockReveal } from './systems/unlockReveal.js';
import { createOpeningScene } from './systems/openingScene.js';
import { wait } from './core/tween.js';
import { preloadCharacterModels } from './world/characterModels.js';
import { preloadHouseModels } from './world/houseModels.js';

/**
 * OUR TOWN - speak English, build a town.
 *
 * Game flow:
 *   choosing -> ready -> listening -> building -> choosing ...   (phase 1)
 *   -> finale -> speaking tour                                    (phase 2)
 *   -> guided tour -> explore                                     (phase 3)
 *
 * Each round the child picks one of three places the town could have, says the
 * sentence for it, and watches it get built. Where it goes is the game's
 * problem, not the child's. The scene is built once and never rebuilt; "Play
 * Again" removes the landmarks and puts the empty lots back, so a replay is
 * instant - and picks a different mix of buildings.
 */

const params = new URLSearchParams(location.search);
const DEV = params.get('dev') === '1';
// Teacher overrides: ?city=Nara&owner=Yuki&target=6
if (params.get('city')) {
  LESSON.city = params.get('city');
  LESSON.cityAlternates = [LESSON.city.toLowerCase()];
}
const TARGET = Math.max(1, Number(params.get('target')) || BUILD_TARGET);

class Game {
  constructor() {
    this.phase = 'loading';
    this.built = [];
    this.offered = [];
    this.pendingType = null;
    this.takenLots = new Set();
    this.landmarks = new Map();
    this.animated = [];
    this.failStreak = 0;
    this.listeningFor = null;
    this.tourResolve = null;
    this.rng = makeRng(WORLD.seed);
    this.progression = createProgression({ rng: this.rng });
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frameSamples = [];
    this.qualityReduced = false;
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  async init(playerName = 'Ken') {
    this.hud = createHUD({
      onMic: () => this.onMicPressed(),
      onBack: () => this.offerChoices(),
      onType: (text) => this.onTyped(text),
      onMute: () => this.onMute(),
      onPlayAgain: () => this.playAgain(),
      onExplore: () => this.enterExplore(),
      onStartTour: () => this.startSpeakingTour(),
      onTourMic: () => this.onTourMicPressed(),
      onTourSkip: () => this.onTourSkip(),
      onTourContinue: () => this.onTourContinue(),
      onTourFinish: () => this.onTourFinish(),
      onResetUnlocks: () => this.onResetUnlocks(),
    });
    this.hud.buildProgress(TARGET);

    const canvas = document.getElementById('scene');
    const lowPower = navigator.hardwareConcurrency <= 4;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowPower,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov,
      window.innerWidth / window.innerHeight,
      0.5,
      600
    );

    this.lights = createLighting(this.scene, this.renderer);
    const characterPreload = preloadCharacterModels();
    const housePreload = preloadHouseModels();
    this.hud.setLoading(0.05);
    await this.nextFrame();

    // Houses are built synchronously inside buildWorld, so their models have to
    // be resident before it runs; characters are only needed once people spawn.
    await housePreload;
    this.world = buildWorld(this.scene, this.rng, (p) => this.hud.setLoading(0.05 + p * 0.8));
    await this.nextFrame();
    await characterPreload;

    this.rig = createCameraRig(this.camera, this.renderer.domElement);
    this.particles = createParticles(this.scene);
    this.pedestrians = createPedestrians(this.scene, this.world.graph, this.rng, {
      max: 48,
      camera: this.camera,
    });
    this.vehicles = createVehicles(this.scene, this.world.graph, this.rng, { maxCars: 16, maxBikes: 10 });
    this.pedestrians.setVehicles(this.vehicles);
    this.vehicles.setPedestrians(this.pedestrians);
    this.audio = createAudio();

    this.speech = createSpeech({
      onStart: () => this.hud.setStatus('Listening...'),
      onResult: (text) => this.hud.setHeard(text),
      onEnd: (text) => this.onSpeechEnd(text),
      onError: (err) => this.onSpeechError(err),
    });

    this.recorder = createRecorder();
    this.records = createTourRecords();
    this.activities = createActivityDirector({
      rng: this.rng,
      particles: this.particles,
      audio: this.audio,
      pedestrians: this.pedestrians,
      camera: this.camera,
    });
    this.tour = this.makeTour();
    this.guidedTour = createGuidedTour({
      scene: this.scene,
      rig: this.rig,
      graph: this.world.graph,
      landmarks: this.landmarks,
      records: this.records,
      rng: this.rng,
      audio: this.audio,
      recorder: this.recorder,
      particles: this.particles,
      activities: this.activities,
      hud: this.hud,
      pedestrians: this.pedestrians,
    });

    this.explore = createExplore({
      domElement: this.renderer.domElement,
      camera: this.camera,
      rig: this.rig,
      hud: this.hud,
      landmarks: this.landmarks,
    });

    this.unlockReveal = createUnlockReveal({ rng: this.rng, hud: this.hud });
    const openingLot = LANDMARK_LOTS.find((lot) => lot.id === 'large-center-north');
    this.openingScene = createOpeningScene({
      scene: this.scene,
      rig: this.rig,
      hud: this.hud,
      rng: makeRng(WORLD.seed ^ 0x4f50454e),
      lot: openingLot,
      pedestrians: this.pedestrians,
      skip: params.get('skipIntro') === '1',
    });

    if (!this.speech.supported) {
      // Firefox and Safari have no Web Speech API. Say so plainly rather than
      // letting a child press a microphone that can never work.
      console.warn('[speech] Web Speech API unavailable in this browser - use Chrome or Edge');
      this.hud.offerTyping(true);
    }

    this.hud.setLoading(1);
    this.updateLiveliness(true);
    this.progression.startRun(TARGET);
    this.phase = 'opening';

    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.clock.getDelta();
    });
    if (DEV) {
      // Keyed off `event.code` + shiftKey rather than `event.key`, so the
      // shortcut does not depend on case or keyboard layout.
      const isTyping = (el) => el instanceof HTMLInputElement
        || el instanceof HTMLTextAreaElement || el?.isContentEditable;
      window.addEventListener('keydown', (e) => {
        if (!e.shiftKey || e.repeat || isTyping(e.target)) return;

        // shift+B - skip speaking: pick the first card, or accept the sentence.
        // Also works while the mic is listening, which is when it is wanted.
        if (e.code === 'KeyB') {
          e.preventDefault();
          if (this.phase === 'choosing') this.chooseType(this.offered[0]);
          else if (this.phase === 'listening') { this.speech?.abort?.(); this.succeed(); }
          else if (this.phase === 'ready') this.succeed();
          return;
        }
        // shift+U - unlock every place, then re-deal so the full pool shows now
        if (e.code === 'KeyU') {
          e.preventDefault();
          const total = this.progression.unlockAll();
          console.info(`[debug] all ${total} places unlocked - shift+R resets`);
          if (this.phase === 'choosing') this.offerChoices();
          return;
        }
        // shift+R - back to a normal fresh profile
        if (e.code === 'KeyR') {
          e.preventDefault();
          this.progression.resetAll();
          this.progression.startRun(TARGET);
          console.info('[debug] progression reset to the starting set');
          if (this.phase === 'choosing') this.offerChoices();
        }
      });
    }

    this.hud.enterOpeningMode(true);
    this.hud.hideLoading();
    this.loop();
    await this.openingScene.play(playerName);
    this.hud.enterOpeningMode(false);
    this.offerChoices();
  }

  nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  /* ------------------------------------------------------------------ *
   * Lesson flow
   * ------------------------------------------------------------------ */

  get currentType() {
    return this.pendingType;
  }

  /* --- 1. Choose --------------------------------------------------- */

  /**
   * Offer the next few places the town could have. Occasionally one slot is a
   * locked mystery card instead of a real choice - a teaser for a place the
   * child has not unlocked yet. The real choices always stay at least two
   * strong, so a mystery card never thins an already-limited round.
   */
  offerChoices() {
    this.speech.abort();
    this.pendingType = null;
    this.phase = 'choosing';
    this.hud.showPanel(false);
    this.hud.setHeard('');
    this.hud.setProgress(this.built, null);

    const unlockedSet = this.progression.unlockedSet();
    const roundIndex = this.built.length + 1;
    const realPool = availableChoices(this.built, this.takenLots, unlockedSet);
    const mysteryType =
      realPool.length >= CHOICES_PER_ROUND ? this.progression.maybeShowMystery(roundIndex) : null;
    const realCount = mysteryType ? CHOICES_PER_ROUND - 1 : CHOICES_PER_ROUND;

    this.offered = pickChoices(this.built, this.takenLots, this.rng, realCount, unlockedSet);
    if (!this.offered.length && !mysteryType) {
      // nothing left that fits anywhere - finish the town here
      this.startFinale();
      return;
    }

    const slots = this.offered.map((type) => {
      const isNew = this.progression.isNew(type);
      if (isNew) this.progression.noteChoiceShown(type);
      return { type, locked: false, isNew };
    });
    if (mysteryType) {
      const at = Math.floor(this.rng() * (slots.length + 1));
      slots.splice(at, 0, { type: mysteryType, locked: true });
    }
    this.hud.showChoices(slots, (type) => this.chooseType(type), () => this.hud.showMysteryHint());
  }

  /** The child tapped a card: switch straight to the sentence for it. */
  chooseType(type) {
    if (this.phase !== 'choosing' || !type) return;
    this.audio.start();
    this.audio.micOn();
    this.pendingType = type;
    this.phase = 'ready';
    this.hud.hideChoices();
    this.hud.showPanel(true);
    this.hud.showBackButton(true);
    this.setTarget(type);
  }

  setTarget(type) {
    if (!type) return;
    this.hud.setTarget(type);
    this.hud.setProgress(this.built, type);
    this.hud.setStatus(this.speech.supported ? 'Press and speak' : 'Open in Chrome to speak - or type it');
    this.hud.setHeard('');
    this.hud.setMicState('idle');
  }

  /* --- 2. Speak ---------------------------------------------------- */

  onMicPressed() {
    this.audio.start();
    this.recorder.prime();
    if (this.phase !== 'ready') return;

    if (!this.speech.supported) {
      this.hud.setStatus('This browser has no microphone support - use Chrome');
      this.hud.offerTyping(true);
      return;
    }

    this.phase = 'listening';
    this.hud.setMicState('listening');
    this.hud.setStatus('Listening...');
    this.hud.setHeard('');
    this.audio.micOn();
    this.listeningFor = 'build';
    this.recorder.start();
    if (!this.speech.listen(7)) {
      this.listeningFor = null;
      this.phase = 'ready';
      this.hud.setMicState('idle');
    }
  }

  onSpeechEnd(text) {
    const target = this.listeningFor;
    this.listeningFor = null;
    if (!target) return;
    this.audio.micOff();
    if (target === 'tour') this.judgeTourAnswer(text);
    else if (this.phase === 'listening') this.judge(text);
  }

  /**
   * Recognition failures are common in a classroom (blocked mic, no network,
   * the wrong browser) and a child cannot debug any of them. So each cause gets
   * its own plain message, the real error code goes to the console for the
   * teacher, and anything that is not simply "I didn't hear you" immediately
   * offers the typing route so the lesson can continue.
   */
  onSpeechError(err) {
    console.warn(`[speech] recognition error: ${err}`);
    const target = this.listeningFor;
    this.listeningFor = null;
    if (!target) return;

    const MESSAGES = {
      'not-allowed': ['Microphone is blocked - allow it in the address bar', true],
      'service-not-allowed': ['Microphone is blocked - allow it in the address bar', true],
      'audio-capture': ['No microphone found', true],
      network: ['Speech needs an internet connection', true],
      'language-not-supported': ['English speech is unavailable here', true],
      'no-speech': ['I did not hear anything. Try again!', false],
      aborted: ['Try again!', false],
    };
    const [message, offerTyping] = MESSAGES[err] || ['Try again!', true];

    if (target === 'tour') {
      this.hud.setTourMicState('retry');
      this.hud.setTourStatus(message);
      return;
    }
    this.phase = 'ready';
    this.hud.setMicState('retry');
    this.hud.setStatus(message);
    if (offerTyping) this.hud.offerTyping(true);
  }

  onTyped(text) {
    if (this.phase !== 'ready' && this.phase !== 'listening') return;
    this.audio.start();
    this.judge(text);
  }

  /** The only place that decides whether a spoken sentence counts. */
  judge(text) {
    const type = this.currentType;
    if (!type) return;
    const result = matchSentence(text, LANDMARKS[type]);
    this.hud.setHeard(text);

    if (result.ok) {
      this.succeed(text);
    } else {
      this.fail(result);
    }
  }

  fail() {
    this.phase = 'ready';
    this.failStreak++;
    this.recorder.discard();   // only the take that worked is worth keeping
    this.hud.setMicState('retry');
    this.hud.wobble();
    this.hud.setStatus('Try again!');
    this.audio.retry();
    // after a couple of misses, quietly offer the keyboard route
    if (this.failStreak >= 2) this.hud.offerTyping(true);
  }

  async succeed(transcript = '') {
    const type = this.currentType;
    if (!type || this.phase === 'building') return;

    this.phase = 'building';
    this.failStreak = 0;
    this.speech.abort();
    this.hud.showBackButton(false);
    this.hud.setMicState('success');
    this.hud.setStatus('Building...', true);
    this.hud.markCorrect();
    this.audio.success();
    this.hud.showPanel(false);

    // keep the sentence and the voice that said it - the guided tour is built
    // out of these, not out of generated dialogue
    this.records.remember(type, 'build', {
      transcript: transcript || LESSON.sentence(LANDMARKS[type]),
    });
    this.recorder.stop().then((clip) => this.records.attachAudio(type, 'build', clip));

    await this.buildLandmark(type);

    this.built.push(type);
    this.pendingType = null;
    this.progression.noteBuilt(type);   // the NEW badge has done its job
    this.hud.celebratePip(this.built);
    this.updateLiveliness();

    if (this.built.length >= TARGET) {
      this.startFinale();
      return;
    }

    // straight back to "what should we build?" - no confirmation screens
    this.offerChoices();
  }

  /** Places one landmark and plays the whole construction sequence. */
  async buildLandmark(type) {
    const lot = selectLot(type, this.takenLots);
    if (!lot) return;
    this.takenLots.add(lot.id);

    const holder = await loadLandmark(type, lot, this.rng);
    holder.visible = false;
    this.scene.add(holder);
    this.landmarks.set(type, holder);
    if (holder.userData.animate) this.animated.push(holder.userData.animate);

    const dressing = this.world.dressings.get(lot.id);
    await runConstruction({
      rig: this.rig,
      particles: this.particles,
      audio: this.audio,
      scene: this.scene,
      holder,
      dressing,
      def: LANDMARKS[type],
      onSettled: () => {
        // The walk belongs to the developed landmark, not the vacant field.
        // Add it at settlement so pedestrians can use it immediately.
        this.world.addLotSidewalk(lot);
        this.pedestrians.addAttraction(lot.entrance[0], lot.entrance[1], lot.rot);
        this.updateLiveliness();
      },
    });
  }

  /**
   * The town gets busier with every landmark: this is the progress bar that
   * actually matters, and it is deliberately visible from the default camera.
   */
  updateLiveliness(initial = false) {
    let people = 5;
    let cars = 1;
    let bikes = 1;
    for (const type of this.built) {
      const def = LANDMARKS[type];
      people += def.population;
      cars += def.vehicles;
      bikes += 1;
    }
    if (this.phase === 'finale' || this.phase === 'explore') {
      people = Math.round(people * 1.35);
      cars += 4;
      bikes += 3;
    }
    this.pedestrians.setPopulation(people);
    this.vehicles.setTraffic(cars, bikes);
    this.audio.setActivity(Math.min(1, this.built.length / TARGET));
    if (initial) this.pedestrians.update(0.016);
  }

  /* ------------------------------------------------------------------ *
   * Phase two: the Town Speaking Tour
   * ------------------------------------------------------------------ */

  makeTour() {
    return createTour({
      rig: this.rig,
      landmarks: this.landmarks,
      particles: this.particles,
      audio: this.audio,
      pedestrians: this.pedestrians,
    });
  }

  /**
   * The town stays exactly as the child built it - alive, populated, running -
   * and the camera takes them round it to practise "We can ___ in the ___."
   */
  async startSpeakingTour() {
    this.hud.showFinale(false);
    this.hud.showExploreBanner(false);
    this.explore.disable();
    await wait(0.6);
    await this.runTourRound(this.built);
  }

  async runTourRound(types) {
    if (!types.length) {
      this.showTourSummary();
      return;
    }
    this.phase = 'tour';
    this.hud.setChromeQuiet(false);
    this.hud.enterTourMode(true);
    this.rig.setPlayerControlEnabled(false);

    const total = this.tour.start(types).length;
    let index = 0;

    while (this.phase === 'tour') {
      const stop = await this.tour.next();
      if (!stop) break;
      index += 1;
      this.hud.showTourPrompt(stop.type, { index, total });
      const outcome = await this.awaitTourAnswer();
      if (outcome === 'cancelled') return;
      this.hud.hideTourPrompt();
      await wait(0.35);
    }
    if (this.phase === 'tour') this.showTourSummary();
  }

  /** Resolves when the child speaks something accepted, or taps Skip. */
  awaitTourAnswer() {
    return new Promise((resolve) => {
      this.tourResolve = resolve;
    });
  }

  settleTour(outcome) {
    const resolve = this.tourResolve;
    this.tourResolve = null;
    if (resolve) resolve(outcome);
  }

  onTourMicPressed() {
    this.audio.start();
    this.recorder.prime();
    if (this.phase !== 'tour' || this.listeningFor) return;

    if (!this.speech.supported) {
      this.hud.setTourStatus('This browser has no microphone support - use Chrome');
      return;
    }
    this.hud.setTourMicState('listening');
    this.hud.setTourStatus('Listening...');
    this.hud.setTourHeard('');
    this.audio.micOn();
    this.listeningFor = 'tour';
    this.recorder.start();
    if (!this.speech.listen(8)) {
      this.listeningFor = null;
      this.hud.setTourMicState('idle');
    }
  }

  /**
   * Semi-free production: anything sensible for this place, in roughly the
   * target pattern, counts. There is no single hidden answer to guess.
   */
  judgeTourAnswer(text) {
    const type = this.tour.current;
    if (!type) return;
    const def = LANDMARKS[type];
    const result = matchAction(text, def);
    this.hud.setTourHeard(text);

    if (result.ok) {
      this.hud.setTourMicState('success');
      this.hud.setTourStatus('Great!', true);
      this.hud.tourCorrect(result.matched, def);
      this.tour.accept(type);
      // The sentence and the child's voice are kept for the guided tour; the
      // building's special animation is held back until they present it there.
      this.records.remember(type, 'activity', {
        transcript: text,
        action: result.action || null,
      });
      this.recorder.stop().then((clip) => this.records.attachAudio(type, 'activity', clip));
      this.updateLiveliness();
      setTimeout(() => this.settleTour('spoken'), 2200);
      return;
    }

    this.recorder.discard();
    const attempts = this.tour.miss(type);
    this.hud.setTourMicState('retry');
    this.hud.tourWobble();
    this.audio.retry();
    this.hud.setTourStatus(
      result.matched ? 'Say the whole sentence!' : 'Try again!'
    );
    // only after a couple of tries - the sentence should stay the child's own
    if (attempts >= 2) this.hud.showTourHints(def.hints);
  }

  onTourSkip() {
    if (this.phase !== 'tour') return;
    this.speech.abort();
    this.recorder.discard();
    this.listeningFor = null;
    const type = this.tour.current;
    if (type) this.tour.skip(type);
    this.audio.micOff();
    this.settleTour('skipped');
  }

  showTourSummary() {
    this.hud.hideTourPrompt();
    const { spoken, total } = this.tour.summary(this.built);
    this.phase = 'tour-summary';
    this.hud.showTourSummary({ spoken, total, allSpoken: spoken === total });
  }

  onTourContinue() {
    if (this.phase !== 'tour-summary') return;
    this.hud.hideTourSummary();
    const remaining = this.tour.unspoken(this.built);
    this.runTourRound(remaining);
  }

  /**
   * The speaking phase is over. Everything the child said is now a script, so
   * phase three hands them the payoff: their avatar guides visitors round the
   * town, presenting it in their own recorded voice.
   */
  async onTourFinish() {
    if (this.phase !== 'tour-summary') return;
    this.hud.hideTourSummary();
    this.hud.hideTourPrompt();
    await wait(0.5);
    await this.startGuidedTour();
  }

  async startGuidedTour() {
    this.phase = 'guided';
    this.hud.setChromeQuiet(true);
    this.hud.enterTourMode(false);
    this.hud.enterGuidedMode(true);
    this.rig.setPlayerControlEnabled(false);
    this.explore.disable();

    // a busier town for the visitors to look at
    this.updateLiveliness();

    const stops = this.records.stops(this.built);
    const summary = await this.guidedTour.run(stops);

    if (this.phase !== 'guided') return;   // Play Again interrupted the tour

    // The full experience is done - town, speaking tour, and guided tour.
    // This is the only progression reward in the game: one new place for next
    // time, shown briefly before the closing menu. The completed town stays
    // visible underneath; this never happens after construction alone.
    const unlockedType = this.progression.completeRun();
    if (unlockedType && this.phase === 'guided') {
      await this.unlockReveal.show(unlockedType);
    }
    if (this.phase !== 'guided') return;   // Play Again interrupted the reveal

    this.hud.enterGuidedMode(false);
    this.hud.showGuidedEnd({
      stops: summary.stops,
      lines: summary.lines || 0,
      spoken: summary.spoken || 0,
    });
    this.phase = 'guided-end';
  }

  /* ------------------------------------------------------------------ *
   * Finale / explore / replay
   * ------------------------------------------------------------------ */

  async startFinale() {
    this.phase = 'finale';
    this.hud.setChromeQuiet(true);
    this.hud.hideChoices();
    this.hud.showPanel(false);
    this.hud.setProgress(this.built, null);
    this.updateLiveliness();

    await runFinale({
      rig: this.rig,
      landmarks: this.landmarks,
      particles: this.particles,
      audio: this.audio,
    });

    this.hud.showFinale(true, this.built.length);
  }

  enterExplore() {
    this.phase = 'explore';
    this.hud.setChromeQuiet(false);
    this.hud.showFinale(false);
    this.hud.hideGuidedEnd();
    this.hud.enterTourMode(false);
    this.hud.enterGuidedMode(false);
    this.guidedTour.hide();
    this.rig.setPlayerControlEnabled(true);
    this.rig.releaseToPlayer();
    this.hud.showExploreBanner(true);
    this.rig.setPlayerControlEnabled(true);
    this.explore.enable();
    this.updateLiveliness();
  }

  /** Rewinds the lesson without rebuilding the world. */
  playAgain() {
    this.unlockReveal.cancel();
    this.guidedTour.cancel();
    this.hud.hideGuidedEnd();
    this.hud.enterGuidedMode(false);
    this.records.clear();
    this.tour.cancel();
    this.settleTour('cancelled');
    this.hud.hideTourSummary();
    this.hud.hideTourPrompt();
    this.hud.enterTourMode(false);
    this.listeningFor = null;
    this.explore.disable();
    this.hud.showFinale(false);
    this.hud.showExploreBanner(false);
    this.hud.showLandmarkCard(null);

    for (const [type, holder] of this.landmarks) {
      this.scene.remove(holder);
      holder.traverse((o) => {
        if (o.isMesh && o.geometry && o.geometry.dispose && o.userData.disposable) o.geometry.dispose();
      });
      void type;
    }
    this.landmarks.clear();
    this.animated.length = 0;
    this.built = [];
    this.takenLots.clear();
    this.pedestrians.clearAttractions();
    this.world.clearLotSidewalks();

    // put the empty lots back exactly as they started
    for (const lot of LANDMARK_LOTS) {
      const dressing = this.world.dressings.get(lot.id);
      if (!dressing) continue;
      for (const child of dressing.group.children) {
        if (child === dressing.ring) continue;
        child.visible = true;
        child.scale.setScalar(1);
        if (child.userData.restY !== undefined) child.position.y = child.userData.restY;
      }
      dressing.ring.visible = false;
      dressing.ring.material.opacity = 0;
    }

    this.rig.setHome(
      new THREE.Vector3(CAMERA.start.x, CAMERA.start.y, CAMERA.start.z),
      new THREE.Vector3(CAMERA.target.x, CAMERA.target.y, CAMERA.target.z)
    );
    this.rig.snapHome();
    this.rig.setPlayerControlEnabled(true);

    this.recorder = createRecorder();
    this.records = createTourRecords();
    this.activities = createActivityDirector({
      rng: this.rng,
      particles: this.particles,
      audio: this.audio,
      pedestrians: this.pedestrians,
      camera: this.camera,
    });
    this.activities.reset();
    this.tour = this.makeTour();
    this.hud.setChromeQuiet(false);
    document.getElementById('progress-panel').classList.remove('hidden');
    this.updateLiveliness(true);
    this.failStreak = 0;
    this.progression.startRun(TARGET);
    this.offerChoices();
  }

  /**
   * Teacher control, not exposed on the normal gameplay screen: wipe every
   * unlock back to the starting set. Confirmed once (the button itself arms,
   * then confirms) before the HUD calls this.
   */
  onResetUnlocks() {
    this.progression.resetAll();
  }

  onMute() {
    const muted = this.audio.toggleMute();
    this.hud.setMuted(muted);
  }

  /* ------------------------------------------------------------------ *
   * Frame loop
   * ------------------------------------------------------------------ */

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * If the machine is struggling for a sustained period, drop the pixel ratio
   * once rather than letting the whole town stutter. School hardware varies
   * wildly and children should never see a slideshow.
   */
  monitorPerformance(dt) {
    if (this.qualityReduced || this.elapsed < 4) return;
    this.frameSamples.push(dt);
    if (this.frameSamples.length < 120) return;
    const avg = this.frameSamples.reduce((a, b) => a + b, 0) / this.frameSamples.length;
    this.frameSamples.length = 0;
    if (avg > 0.027) {
      this.qualityReduced = true;
      this.renderer.setPixelRatio(1);
      this.lights.sun.shadow.mapSize.set(1024, 1024);
      this.lights.sun.shadow.map?.dispose();
      this.lights.sun.shadow.map = null;
    }
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    this.elapsed += dt;

    updateTweens(dt);
    this.rig.update(dt);
    this.pedestrians.update(dt);
    this.vehicles.update(dt);
    this.particles.update(dt);
    this.activities.update(dt, this.elapsed);
    this.guidedTour.update(dt);
    this.unlockReveal.update(dt);
    this.openingScene?.update(dt);
    this.world.update(dt, this.elapsed);
    updateSway(this.elapsed);
    for (const animate of this.animated) animate(dt, this.elapsed);

    this.monitorPerformance(dt);
    this.renderer.render(this.scene, this.camera);
    // the speaking cut-in and the unlock reveal draw over the town, sharing
    // the one WebGL context rather than opening a second renderer
    this.guidedTour.renderOverlay(this.renderer, window.innerWidth, window.innerHeight);
    this.unlockReveal.render(this.renderer, window.innerWidth, window.innerHeight);
  }
}

const game = new Game();
const nameEntry = document.getElementById('name-entry');
const nameForm = document.getElementById('name-form');
const playerName = document.getElementById('player-name');
const loading = document.getElementById('loading');

if (params.get('owner')) playerName.value = params.get('owner');

nameForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (nameForm.dataset.started) return;
  nameForm.dataset.started = 'true';
  const owner = configureHouseOwner(playerName.value);
  nameEntry.remove();
  loading.classList.remove('hidden');
  game.init(owner).catch((err) => {
    console.error(err);
    const status = document.getElementById('mic-status');
    if (status) status.textContent = 'Something went wrong loading the town.';
  });
});

if (DEV) window.game = game;

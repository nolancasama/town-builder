import { LESSON, BUILD_TARGET } from '../config/lessons.js';
import { LANDMARKS } from '../config/landmarks.js';

/**
 * HUD
 * ---
 * All DOM handling in one place. The interface stays tiny on purpose: a target
 * sentence, one big microphone, and a progress row. The reward for a correct
 * answer is the town itself, so the UI never shouts "CORRECT!" at anybody.
 */
export function createHUD(handlers = {}) {
  const $ = (id) => document.getElementById(id);

  const el = {
    loading: $('loading'),
    loadingFill: $('loading-fill'),
    hud: $('hud'),
    progressPanel: $('progress-panel'),
    progressCount: $('progress-count'),
    progressTotal: $('progress-total'),
    progressIcons: $('progress-icons'),
    panel: $('speech-panel'),
    targetCard: $('target-card'),
    targetSentence: $('target-sentence'),
    mic: $('mic-btn'),
    status: $('mic-status'),
    heard: $('heard'),
    mute: $('mute-btn'),
    muteIcon: $('mute-icon'),
    choicePanel: $('choice-panel'),
    choiceTitle: $('choice-title'),
    choiceCards: $('choice-cards'),
    choiceBack: $('choice-back'),
    btnToggleTyping: $('btn-toggle-typing'),
    typingState: $('typing-state'),
    typeForm: $('type-form'),
    typeInput: $('type-input'),
    landmarkCard: $('landmark-card'),
    landmarkRename: $('landmark-rename'),
    landmarkRealName: $('landmark-realname'),
    landmarkNameForm: $('landmark-name-form'),
    landmarkNameInput: $('landmark-name-input'),
    landmarkName: $('landmark-name'),
    landmarkSentence: $('landmark-sentence'),
    finale: $('finale'),
    finaleSub: $('finale-sub'),
    btnExplore: $('btn-explore'),
    btnAgain: $('btn-again'),
    exploreBanner: $('explore-banner'),
    exploreMessage: $('explore-message'),
    btnReplay: $('btn-replay'),
    btnTour: $('btn-tour'),
    tourPanel: $('tour-panel'),
    tourCard: $('tour-card'),
    tourPlace: $('tour-place'),
    tourFrame: $('tour-frame'),
    tourJpHint: $('tour-jp-hint'),
    tourHints: $('tour-hints'),
    tourMic: $('tour-mic'),
    tourSkip: $('tour-skip'),
    tourStatus: $('tour-status'),
    tourHeard: $('tour-heard'),
    tourCounter: $('tour-counter'),
    tourTitle: $('tour-title'),
    tourExit: $('tour-exit'),
    tourCount: $('tour-count'),
    tourSummary: $('tour-summary'),
    summaryTitle: $('summary-title'),
    summaryEn: $('summary-en'),
    summaryScore: $('summary-score'),
    btnContinue: $('btn-continue'),
    btnFinish: $('btn-finish'),
    settingsBtn: $('settings-btn'),
    settingsPanel: $('settings-panel'),
    btnResetUnlocks: $('btn-reset-unlocks'),
    btnResetCancel: $('btn-reset-cancel'),
    mysteryHint: $('mystery-hint'),
    subtitle: $('tour-subtitle'),
    subtitleSpeaker: $('subtitle-speaker'),
    subtitleText: $('subtitle-text'),
    subtitleAdvance: $('subtitle-advance'),
    tourEnd: $('tour-end'),
    tourEndScore: $('tour-end-score'),
    btnEndExplore: $('btn-end-explore'),
    btnEndAgain: $('btn-end-again'),
  };

  const pips = new Map();

  function makeSpan(className, text) {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  }

  function makeEnglishSpan(className, text) {
    const span = makeSpan(className, text);
    span.lang = 'en';
    return span;
  }

  function renderTourSentence(action, def) {
    const phrase = LESSON.placePhrase(def);
    const [preposition, ...placeWords] = phrase.split(' ');
    el.tourFrame.replaceChildren(
      document.createTextNode('We can '),
      makeSpan('blank', action),
      document.createTextNode(` ${preposition} `),
      makeSpan('place-word', placeWords.join(' ')),
      document.createTextNode('.')
    );
  }

  el.mic.addEventListener('click', () => handlers.onMic && handlers.onMic());
  el.choiceBack.addEventListener('click', () => handlers.onBack && handlers.onBack());
  el.mute.addEventListener('click', () => handlers.onMute && handlers.onMute());
  el.typeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = el.typeInput.value;
    el.typeInput.value = '';
    if (handlers.onType) handlers.onType(value);
  });
  el.btnExplore.addEventListener('click', () => handlers.onExplore && handlers.onExplore());
  el.btnTour.addEventListener('click', () => handlers.onStartTour && handlers.onStartTour());
  el.tourMic.addEventListener('click', () => handlers.onTourMic && handlers.onTourMic());
  el.tourSkip.addEventListener('click', () => handlers.onTourSkip && handlers.onTourSkip());
  el.btnContinue.addEventListener('click', () => handlers.onTourContinue && handlers.onTourContinue());
  el.btnFinish.addEventListener('click', () => handlers.onTourFinish && handlers.onTourFinish());
  el.btnEndExplore.addEventListener('click', () => handlers.onExplore && handlers.onExplore());
  el.btnEndAgain.addEventListener('click', () => handlers.onPlayAgain && handlers.onPlayAgain());
  el.tourExit.addEventListener('click', () => handlers.onTourExit && handlers.onTourExit());
  function closeSettings() {
    el.settingsPanel.classList.add('hidden');
    el.btnResetUnlocks.classList.remove('armed');
  }

  /**
   * Typing used to appear as a "Type it instead" button in the speaking panel,
   * offered automatically after a couple of failed attempts. That put an opt-out
   * of the speaking practice in front of the child at the exact moment speaking
   * got hard. It is now a teacher setting: off by default, and when a class
   * needs it, on for the whole session rather than per stumble.
   */
  const TYPING_KEY = 'townbuilder.allowTyping';
  // Whether the current prompt would like to offer typing, independent of
  // whether the teacher has permitted it.
  let typingWanted = false;
  let allowTyping = false;
  try {
    allowTyping = window.localStorage.getItem(TYPING_KEY) === '1';
  } catch (err) {
    console.warn('[hud] localStorage unavailable - typing preference will not persist:', err && err.message);
  }

  function applyTypingSetting() {
    el.typingState.textContent = allowTyping ? 'オン' : 'オフ';
    el.btnToggleTyping.setAttribute('aria-pressed', String(allowTyping));
    el.btnToggleTyping.classList.toggle('on', allowTyping);
    // The form only ever shows while a sentence is actually being asked for;
    // `offerTyping` owns that, this owns whether it is permitted at all.
    if (!allowTyping) el.typeForm.classList.add('hidden');
  }
  applyTypingSetting();

  el.btnToggleTyping.addEventListener('click', () => {
    allowTyping = !allowTyping;
    try {
      window.localStorage.setItem(TYPING_KEY, allowTyping ? '1' : '0');
    } catch { /* preference simply will not persist */ }
    applyTypingSetting();
    if (allowTyping && typingWanted) el.typeForm.classList.remove('hidden');
  });
  el.settingsBtn.addEventListener('click', () => el.settingsPanel.classList.toggle('hidden'));
  el.btnResetCancel.addEventListener('click', closeSettings);
  el.btnResetUnlocks.addEventListener('click', () => {
    if (!el.btnResetUnlocks.classList.contains('armed')) {
      el.btnResetUnlocks.classList.add('armed');
      return;
    }
    closeSettings();
    if (handlers.onResetUnlocks) handlers.onResetUnlocks();
  });
  document.addEventListener('pointerdown', (e) => {
    if (!el.settingsPanel.classList.contains('hidden') && !el.settingsPanel.contains(e.target) && e.target !== el.settingsBtn) {
      closeSettings();
    }
  });
  /* ---------------- renaming a place ---------------- */

  let cardType = null;
  let renaming = false;

  function renderLandmarkCard() {
    const def = LANDMARKS[cardType];
    const custom = handlers.getBuildingName ? handlers.getBuildingName(cardType) : null;
    el.landmarkName.textContent = custom || def.displayName;
    // When a nickname is showing, the real English word stays underneath: the
    // vocabulary is the point of the game and must not be renamed away.
    el.landmarkRealName.textContent = def.displayName;
    el.landmarkRealName.classList.toggle('hidden', !custom);
    el.landmarkSentence.textContent = LESSON.sentence(def, LESSON.city);
  }

  function openRename() {
    if (!cardType) return;
    renaming = true;
    const def = LANDMARKS[cardType];
    const custom = handlers.getBuildingName ? handlers.getBuildingName(cardType) : null;
    el.landmarkNameInput.value = custom || def.displayName;
    el.landmarkNameForm.classList.remove('hidden');
    el.landmarkNameInput.focus();
    el.landmarkNameInput.select();
  }

  function closeRename() {
    renaming = false;
    el.landmarkNameForm.classList.add('hidden');
  }

  el.landmarkRename.addEventListener('click', () => {
    if (renaming) closeRename(); else openRename();
  });
  el.landmarkNameForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (cardType && handlers.onRenameBuilding) handlers.onRenameBuilding(cardType, el.landmarkNameInput.value);
    closeRename();
    renderLandmarkCard();
  });
  // Escape abandons the edit rather than committing whatever is half-typed.
  el.landmarkNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); closeRename(); }
  });

  el.btnAgain.addEventListener('click', () => handlers.onPlayAgain && handlers.onPlayAgain());
  el.btnReplay.addEventListener('click', () => handlers.onPlayAgain && handlers.onPlayAgain());

  const hud = {
    el,

    /**
     * The town can be built from any mix of places, so progress is a row of
     * empty slots that fill with whatever the child actually chose.
     */
    buildProgress(target = BUILD_TARGET) {
      el.progressIcons.innerHTML = '';
      pips.clear();
      el.progressTotal.textContent = target;
      for (let i = 0; i < target; i++) {
        const pip = document.createElement('div');
        pip.className = 'pip';
        pip.textContent = '';
        el.progressIcons.appendChild(pip);
        pips.set(i, pip);
      }
    },

    setProgress(builtTypes, currentType) {
      el.progressCount.textContent = builtTypes.length;
      pips.forEach((pip, index) => {
        const type = builtTypes[index];
        pip.textContent = type ? LANDMARKS[type].icon : '';
        pip.title = type ? LANDMARKS[type].displayName : '';
        pip.classList.toggle('done', Boolean(type));
        pip.classList.toggle('current', index === builtTypes.length && Boolean(currentType));
      });
    },

    celebratePip(builtTypes) {
      const pip = pips.get(builtTypes.length - 1);
      if (!pip) return;
      pip.classList.add('done', 'pop');
      setTimeout(() => pip.classList.remove('pop'), 400);
    },

    /**
     * Three (or fewer) places the town could have next. A slot is either a
     * real, selectable choice or a locked mystery card - see
     * systems/progression.js for how those are decided. The mystery card
     * reuses this exact card shape (same size, same framing) with a darkened
     * silhouette of its own real icon standing in for a 3D preview, per the
     * "reuse the existing preview system" rule: it is never an unrelated icon.
     */
    showChoices(slots, onPick, onMysteryTap) {
      el.choiceCards.innerHTML = '';
      for (const slot of slots) {
        const def = LANDMARKS[slot.type];
        const card = document.createElement('button');
        card.type = 'button';

        if (slot.locked) {
          card.className = 'choice-card locked';
          card.replaceChildren(
            makeSpan('choice-icon silhouette', def.icon),
            makeSpan('lock-badge', '🔒'),
            makeSpan('choice-name', '???'),
            makeSpan('choice-kind', 'まだえらべない')
          );
          card.addEventListener('click', () => {
            card.classList.remove('nudge');
            void card.offsetWidth;
            card.classList.add('nudge');
            if (onMysteryTap) onMysteryTap();
          });
        } else {
          card.className = 'choice-card';
          const content = [
            makeSpan('choice-icon', def.icon),
            makeEnglishSpan('choice-name', def.displayName),
            makeEnglishSpan('choice-kind', def.category),
          ];
          if (slot.isNew) content.unshift(makeSpan('new-badge', 'あたらしい'));
          card.replaceChildren(...content);
          card.addEventListener('click', () => {
            card.classList.add('picked');
            onPick(slot.type);
          });
        }
        el.choiceCards.appendChild(card);
      }
      el.choicePanel.classList.remove('hidden');
    },

    /** A quiet, non-blocking nudge - never a popup that must be dismissed. */
    showMysteryHint() {
      el.mysteryHint.classList.remove('show');
      void el.mysteryHint.offsetWidth;
      el.mysteryHint.classList.add('show');
      clearTimeout(el.mysteryHint._timer);
      el.mysteryHint._timer = setTimeout(() => el.mysteryHint.classList.remove('show'), 2200);
    },

    hideChoices() {
      el.choicePanel.classList.add('hidden');
    },

    showBackButton(show) {
      el.choiceBack.classList.toggle('hidden', !show);
    },

    /** Writes the target sentence, highlighting the word being taught. */
    setTarget(type) {
      const def = LANDMARKS[type];
      const sentence = LESSON.sentence(def, LESSON.city);
      const key = def.spokenName;
      const start = sentence.indexOf(key);
      if (start < 0) {
        el.targetSentence.textContent = sentence;
      } else {
        el.targetSentence.replaceChildren(
          document.createTextNode(sentence.slice(0, start)),
          makeSpan('key', key),
          document.createTextNode(sentence.slice(start + key.length))
        );
      }
      el.targetCard.classList.remove('correct');
      return sentence;
    },

    setMicState(state) {
      el.mic.classList.remove('listening', 'success', 'retry');
      el.mic.disabled = state === 'disabled';
      if (state === 'listening' || state === 'success' || state === 'retry') {
        el.mic.classList.add(state);
      }
      if (state === 'retry') setTimeout(() => el.mic.classList.remove('retry'), 520);
    },

    setStatus(text, good = false) {
      el.status.textContent = text;
      el.status.classList.toggle('good', good);
    },

    setHeard(text) {
      el.heard.textContent = text ? `"${text}"` : '';
      el.heard.classList.toggle('show', Boolean(text));
    },

    wobble() {
      el.targetCard.classList.remove('wobble');
      void el.targetCard.offsetWidth;
      el.targetCard.classList.add('wobble');
      setTimeout(() => el.targetCard.classList.remove('wobble'), 520);
    },

    markCorrect() {
      el.targetCard.classList.add('correct');
    },

    showPanel(show) {
      el.panel.classList.toggle('away', !show);
    },

    /**
     * The prompt asks for typing; the teacher setting decides whether it appears.
     */
    offerTyping(show) {
      typingWanted = show;
      el.typeForm.classList.toggle('hidden', !(show && allowTyping));
    },

    setMuted(muted) {
      el.muteIcon.textContent = muted ? '🔇' : '🔊';
    },

    setLoading(fraction) {
      el.loadingFill.style.width = `${Math.round(fraction * 100)}%`;
    },

    hideLoading() {
      el.loading.classList.add('fade');
      el.hud.classList.remove('hidden');
      setTimeout(() => el.loading.remove(), 700);
    },

    showFinale(show, builtCount) {
      // the counter has done its job once the town is finished
      document.getElementById('progress-panel').classList.toggle('hidden', show);
      if (builtCount !== undefined) {
        el.finaleSub.textContent = `英語で場所を${builtCount}か所つくったよ！`;
      }
      el.finale.classList.toggle('hidden', false);
      requestAnimationFrame(() => el.finale.classList.toggle('show', show));
      if (!show) setTimeout(() => el.finale.classList.add('hidden'), 900);
    },

    showExploreBanner(show) {
      el.exploreBanner.classList.toggle('hidden', !show);
    },

    /* ---------------- Speaking tour ---------------- */

    /**
     * Switches the whole interface from build mode to speaking mode. The child
     * should see the building, the sentence frame and two buttons - nothing
     * left over from town building.
     */
    enterTourMode(on) {
      el.panel.classList.add('away');
      el.choicePanel.classList.add('hidden');
      document.getElementById('progress-panel').classList.toggle('hidden', on);
      el.tourCounter.classList.toggle('hidden', !on);
      el.tourTitle.classList.toggle('hidden', !on);
      if (!on) el.tourPanel.classList.add('hidden');
    },

    /** Show the sentence frame for one place. */
    showTourPrompt(type, { index, total } = {}) {
      const def = LANDMARKS[type];
      el.tourPlace.textContent = def.displayName;
      renderTourSentence('___', def);
      // the English frame above already shows the pattern; a second Japanese
      // line restating it is noise, so only the short instruction stays
      el.tourHints.classList.add('hidden');
      el.tourHints.innerHTML = '';
      el.tourCard.classList.remove('correct');
      el.tourStatus.textContent = 'マイクを押して話してみよう';
      el.tourStatus.classList.remove('good');
      el.tourHeard.textContent = '';
      el.tourHeard.classList.remove('show');
      el.tourMic.classList.remove('listening', 'success', 'retry');
      el.tourMic.disabled = false;
      el.tourPanel.classList.remove('hidden');
      if (index && total) el.tourCount.textContent = `${index} / ${total}`;
    },

    hideTourPrompt() {
      el.tourPanel.classList.add('hidden');
    },

    setTourMicState(state) {
      el.tourMic.classList.remove('listening', 'success', 'retry');
      el.tourMic.disabled = state === 'disabled';
      if (['listening', 'success', 'retry'].includes(state)) el.tourMic.classList.add(state);
      if (state === 'retry') setTimeout(() => el.tourMic.classList.remove('retry'), 520);
    },

    setTourStatus(text, good = false) {
      el.tourStatus.textContent = text;
      el.tourStatus.classList.toggle('good', good);
    },

    setTourHeard(text) {
      el.tourHeard.textContent = text ? `"${text}"` : '';
      el.tourHeard.classList.toggle('show', Boolean(text));
    },

    /** Offered only after a couple of tries - the answer stays the child's. */
    showTourHints(hints) {
      if (!hints || !hints.length) return;
      el.tourHints.innerHTML = '';
      for (const hint of hints) {
        const chip = document.createElement('span');
        chip.className = 'hint-chip';
        chip.lang = 'en';
        chip.textContent = hint;
        el.tourHints.appendChild(chip);
      }
      el.tourHints.classList.remove('hidden');
    },

    tourWobble() {
      el.tourCard.classList.remove('wobble');
      void el.tourCard.offsetWidth;
      el.tourCard.classList.add('wobble');
      setTimeout(() => el.tourCard.classList.remove('wobble'), 520);
    },

    tourCorrect(action, def) {
      el.tourCard.classList.add('correct');
      if (action && def) renderTourSentence(action, def);
    },

    /**
     * End-of-round panel. Continue is offered only while somewhere still has no
     * spoken sentence - nobody is ever kept in a mandatory loop.
     */
    showTourSummary({ spoken, total, allSpoken }) {
      el.summaryTitle.textContent = allSpoken ? 'ぜんぶ言えたよ！' : 'すべての場所を見たよ！';
      el.summaryEn.textContent = allSpoken
        ? 'すべての場所について話せたよ！'
        : 'まだ言っていない場所にもチャレンジできるよ。';
      el.summaryScore.textContent = `話せた場所：${spoken} / ${total}`;
      el.btnContinue.classList.toggle('hidden', allSpoken);
      el.tourSummary.classList.remove('hidden');
      requestAnimationFrame(() => el.tourSummary.classList.add('show'));
    },

    hideTourSummary() {
      el.tourSummary.classList.remove('show');
      setTimeout(() => el.tourSummary.classList.add('hidden'), 600);
    },

    /** The relaxed end state: no more prompts, the town just runs. */
    showFinishedBanner({ spoken, total }) {
      el.exploreMessage.textContent = `よくできたね！ 話せた場所：${spoken} / ${total}`;
      el.exploreBanner.classList.remove('hidden');
    },

    /* ---------------- Guided tour (phase 3) ---------------- */

    /** Everything except the subtitle goes away - this phase is a film. */
    enterGuidedMode(on) {
      el.panel.classList.add('away');
      el.choicePanel.classList.add('hidden');
      el.tourPanel.classList.add('hidden');
      document.getElementById('progress-panel').classList.toggle('hidden', on);
      el.tourCounter.classList.toggle('hidden', !on);
      el.tourTitle.classList.toggle('hidden', !on);
      el.tourExit.classList.toggle('hidden', !on);
      if (!on) {
        el.subtitle.classList.add('hidden');
        el.tourCounter.classList.add('hidden');
        el.tourTitle.classList.add('hidden');
        el.tourExit.classList.add('hidden');
      }
    },

    /** The cinematic speaker and their current line. */
    showTourSubtitle(text, speaker = 'YOUR GUIDE', awaitingInput = false) {
      el.subtitleSpeaker.textContent = speaker;
      el.subtitleText.textContent = text;
      el.subtitle.classList.toggle('awaiting-input', awaitingInput);
      el.subtitle.classList.remove('hidden');
    },

    hideTourSubtitle() {
      el.subtitle.classList.add('hidden');
      el.subtitle.classList.remove('awaiting-input');
    },

    /** Keep gameplay chrome out of the way while the opening owns the town. */
    enterOpeningMode(on) {
      el.panel.classList.toggle('away', on);
      el.choicePanel.classList.add('hidden');
      el.progressPanel.classList.toggle('hidden', on);
      document.getElementById('top-right').classList.toggle('quiet', on);
      if (!on) el.subtitle.classList.add('hidden');
    },

    setTourStop(index, total, name) {
      el.tourCount.textContent = `${index} / ${total}`;
      el.tourCounterLabel = el.tourCounterLabel || document.getElementById('tour-counter-label');
      el.tourCounterLabel.textContent = name || 'ガイドツアー';
      el.tourCounter.classList.remove('hidden');
    },

    showGuidedEnd({ stops, lines, spoken }) {
      const voice = spoken
        ? `${stops}か所 ・ 自分の声 ${spoken} / ${lines}文`
        : `${stops}か所 ・ ${lines}文を紹介したよ`;
      el.tourEndScore.textContent = voice;
      el.tourEnd.classList.remove('hidden');
      requestAnimationFrame(() => el.tourEnd.classList.add('show'));
    },

    /** Settings chrome steps back while a cinematic owns the screen. */
    setChromeQuiet(quiet) {
      document.getElementById('top-right').classList.toggle('quiet', Boolean(quiet));
    },

    /** Unlock reveal text - the 3D preview itself is drawn by unlockReveal.js. */
    setUnlockText({ name, jp }) {
      document.getElementById('unlock-name').textContent = name;
      document.getElementById('unlock-jp').textContent = jp || '';
    },
    showUnlockTitle(show) {
      document.getElementById('unlock-titles').classList.toggle('show', show);
    },
    showUnlockLock(show) {
      document.getElementById('unlock-lock').classList.toggle('show', show);
    },
    showUnlockReveal(show) {
      document.getElementById('unlock-reveal').classList.toggle('hidden', !show);
      requestAnimationFrame(() => document.getElementById('unlock-reveal').classList.toggle('show', show));
    },
    onUnlockRevealTap(fn) {
      document.getElementById('unlock-reveal').addEventListener('pointerdown', fn, { once: true });
    },
    get unlockStageEl() {
      return document.getElementById('unlock-stage');
    },

    hideGuidedEnd() {
      el.tourEnd.classList.remove('show');
      setTimeout(() => el.tourEnd.classList.add('hidden'), 700);
    },

    showLandmarkCard(type) {
      if (!type) {
        el.landmarkCard.classList.remove('show');
        closeRename();
        cardType = null;
        return;
      }
      cardType = type;
      closeRename();
      renderLandmarkCard();
      el.landmarkCard.classList.remove('hidden');
      el.landmarkCard.classList.add('show');
    },

    /** True while the child is typing a new name - the caller must not auto-hide. */
    isRenaming() {
      return renaming;
    },

    /** Re-read the current name, e.g. after it is cleared elsewhere. */
    refreshLandmarkCard() {
      if (cardType) renderLandmarkCard();
    },
  };

  return hud;
}

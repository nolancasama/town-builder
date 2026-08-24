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
    typeToggle: $('type-toggle'),
    typeForm: $('type-form'),
    typeInput: $('type-input'),
    landmarkCard: $('landmark-card'),
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
    subtitleText: $('subtitle-text'),
    tourEnd: $('tour-end'),
    tourEndScore: $('tour-end-score'),
    btnEndExplore: $('btn-end-explore'),
    btnEndAgain: $('btn-end-again'),
  };

  const pips = new Map();

  el.mic.addEventListener('click', () => handlers.onMic && handlers.onMic());
  el.choiceBack.addEventListener('click', () => handlers.onBack && handlers.onBack());
  el.mute.addEventListener('click', () => handlers.onMute && handlers.onMute());
  el.typeToggle.addEventListener('click', () => {
    el.typeForm.classList.toggle('hidden');
    el.typeInput.focus();
  });
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
  function closeSettings() {
    el.settingsPanel.classList.add('hidden');
    el.btnResetUnlocks.classList.remove('armed');
  }
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
          card.innerHTML =
            `<span class="choice-icon silhouette">${def.icon}</span>` +
            `<span class="lock-badge">🔒</span>` +
            `<span class="choice-name">???</span>` +
            `<span class="choice-kind">Locked</span>`;
          card.addEventListener('click', () => {
            card.classList.remove('nudge');
            void card.offsetWidth;
            card.classList.add('nudge');
            if (onMysteryTap) onMysteryTap();
          });
        } else {
          card.className = 'choice-card';
          card.innerHTML =
            (slot.isNew ? '<span class="new-badge">NEW</span>' : '') +
            `<span class="choice-icon">${def.icon}</span>` +
            `<span class="choice-name">${def.displayName}</span>` +
            `<span class="choice-kind">${def.category}</span>`;
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
      const html = sentence.replace(key, `<span class="key">${key}</span>`);
      el.targetSentence.innerHTML = html;
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

    offerTyping(show) {
      el.typeToggle.classList.toggle('hidden', !show);
      if (!show) el.typeForm.classList.add('hidden');
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
        const plural = builtCount === 1 ? 'place' : 'places';
        el.finaleSub.textContent = `You built ${builtCount} ${plural} with your English.`;
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
      if (!on) el.tourPanel.classList.add('hidden');
    },

    /** Show the sentence frame for one place. */
    showTourPrompt(type, { index, total } = {}) {
      const def = LANDMARKS[type];
      const phrase = LESSON.placePhrase(def);
      const [preposition, ...rest] = phrase.split(' ');
      el.tourPlace.textContent = def.displayName;
      el.tourFrame.innerHTML =
        `We can <span class="blank">___</span> ${preposition} ` +
        `<span class="place-word">${rest.join(' ')}</span>.`;
      // the English frame above already shows the pattern; a second Japanese
      // line restating it is noise, so only the short instruction stays
      el.tourHints.classList.add('hidden');
      el.tourHints.innerHTML = '';
      el.tourCard.classList.remove('correct');
      el.tourStatus.textContent = 'Press and speak';
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

    tourCorrect(sentence) {
      el.tourCard.classList.add('correct');
      if (sentence) el.tourFrame.innerHTML = sentence;
    },

    /**
     * End-of-round panel. Continue is offered only while somewhere still has no
     * spoken sentence - nobody is ever kept in a mandatory loop.
     */
    showTourSummary({ spoken, total, allSpoken }) {
      el.summaryTitle.textContent = allSpoken ? 'ぜんぶ 言えました！' : 'すべての場所を見ました！';
      el.summaryEn.textContent = allSpoken ? 'You spoke about every place!' : 'You visited every place!';
      el.summaryScore.textContent = `${spoken} / ${total} places spoken`;
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
      el.exploreMessage.textContent = `Great job!  ${spoken} / ${total} places spoken`;
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
      if (!on) {
        el.subtitle.classList.add('hidden');
        el.tourCounter.classList.add('hidden');
      }
    },

    /** The line the guide is saying, in the student's own words. */
    showTourSubtitle(text) {
      el.subtitleText.textContent = text;
      el.subtitle.classList.remove('hidden');
    },

    hideTourSubtitle() {
      el.subtitle.classList.add('hidden');
    },

    setTourStop(index, total, name) {
      el.tourCount.textContent = `${index} / ${total}`;
      el.tourCounterLabel = el.tourCounterLabel || document.getElementById('tour-counter-label');
      el.tourCounterLabel.textContent = name || 'Guided Tour';
      el.tourCounter.classList.remove('hidden');
    },

    showGuidedEnd({ stops, lines, spoken }) {
      const placeWord = stops === 1 ? 'place' : 'places';
      const voice = spoken
        ? `${stops} ${placeWord} · ${spoken} of ${lines} sentences in your own voice`
        : `${stops} ${placeWord} · ${lines} of your sentences`;
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
        return;
      }
      const def = LANDMARKS[type];
      el.landmarkName.textContent = def.displayName;
      el.landmarkSentence.textContent = LESSON.sentence(def, LESSON.city);
      el.landmarkCard.classList.remove('hidden');
      el.landmarkCard.classList.add('show');
    },
  };

  return hud;
}

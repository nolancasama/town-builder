/**
 * VOICE RECORDER
 * --------------
 * Captures the child's microphone alongside speech recognition, so their actual
 * voice can be replayed later by the tour guide.
 *
 * Recognition and recording are separate systems that run at the same time:
 * the Web Speech API does its own capture, and MediaRecorder captures the same
 * stream for us. Only the clip belonging to the final *accepted* attempt is
 * kept - failed tries are discarded as soon as the next one starts.
 *
 * Everything degrades gracefully. If the browser has no MediaRecorder, or the
 * child declines the microphone, the game plays exactly as before and the
 * guided tour falls back to on-screen sentences.
 */
export function createRecorder() {
  const supported =
    typeof window !== 'undefined' &&
    Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
    typeof window.MediaRecorder !== 'undefined';

  let stream = null;
  let recorder = null;
  let chunks = [];
  let pending = null;
  let denied = false;
  let ctx = null;

  function audioContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** Pick a container the browser will actually give us. */
  function mimeType() {
    const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const type of options) {
      if (window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  async function ensureStream() {
    if (!supported || denied) return null;
    if (stream && stream.active) return stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      return stream;
    } catch (err) {
      denied = true;
      console.warn('[recorder] microphone capture unavailable:', err && err.name);
      return null;
    }
  }

  return {
    supported,

    get available() {
      return supported && !denied;
    },

    /** Warm up the permission prompt on the first mic press. */
    async prime() {
      await ensureStream();
      audioContext();
    },

    /** Begin capturing. Any previous unclaimed clip is thrown away. */
    async start() {
      const live = await ensureStream();
      if (!live) return false;
      if (recorder && recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch (err) {
          /* ignore */
        }
      }
      chunks = [];
      const type = mimeType();
      try {
        recorder = type ? new MediaRecorder(live, { mimeType: type }) : new MediaRecorder(live);
      } catch (err) {
        console.warn('[recorder] could not start:', err && err.name);
        return false;
      }
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size) chunks.push(event.data);
      };
      pending = new Promise((resolve) => {
        recorder.onstop = () => {
          const blob = chunks.length ? new Blob(chunks, { type: chunks[0].type || 'audio/webm' }) : null;
          chunks = [];
          resolve(blob);
        };
      });
      recorder.start();
      return true;
    },

    /** Stop and hand back the clip (or null if there is nothing usable). */
    async stop() {
      if (!recorder || recorder.state === 'inactive') return null;
      try {
        recorder.stop();
      } catch (err) {
        return null;
      }
      const blob = await pending;
      pending = null;
      return blob && blob.size > 900 ? blob : null;
    },

    /** Throw away whatever is being captured - a rejected attempt. */
    discard() {
      if (recorder && recorder.state === 'recording') {
        try {
          recorder.stop();
        } catch (err) {
          /* ignore */
        }
      }
      chunks = [];
      pending = null;
    },

    /** Decode once so tour playback never stutters on first use. */
    async decode(blob) {
      const context = audioContext();
      if (!context || !blob) return null;
      try {
        return await context.decodeAudioData(await blob.arrayBuffer());
      } catch (err) {
        console.warn('[recorder] could not decode clip:', err && err.name);
        return null;
      }
    },

    /**
     * Play a decoded clip, reporting its loudness every frame so the guide's
     * mouth can move with it. Resolves when the clip finishes.
     */
    play(buffer, { onLevel, gain = 1 } = {}) {
      const context = audioContext();
      if (!context || !buffer) return Promise.resolve(false);

      const source = context.createBufferSource();
      source.buffer = buffer;
      const volume = context.createGain();
      volume.gain.value = gain;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      const data = new Uint8Array(analyser.frequencyBinCount);

      source.connect(volume).connect(analyser);
      analyser.connect(context.destination);

      // Children record at wildly different volumes, and a quiet take would
      // otherwise leave the guide's mouth barely moving. Normalise against the
      // loudest moment heard so far, so every recording drives a full range.
      let loudest = 0.05;
      let raf = 0;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
        }
        loudest = Math.max(loudest * 0.995, peak);
        if (onLevel) onLevel(Math.min(1, (peak / loudest) * 0.95));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return new Promise((resolve) => {
        source.onended = () => {
          cancelAnimationFrame(raf);
          if (onLevel) onLevel(0);
          resolve(true);
        };
        source.start();
      });
    },

    dispose() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    },
  };
}

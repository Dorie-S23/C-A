import { VOICE_DIR, VOICE_MANIFEST, voiceKey } from './voiceKey.js';

/**
 * Plays the pre-generated voice clip for a dialogue line (see
 * tools/generateVoices.mjs). Lines without a clip — not generated yet, or
 * edited since — simply stay silent, so the dialogue never waits on audio.
 *
 * Only keys listed in the manifest are requested, rather than trying every
 * line and letting missing ones 404: a stale clip set would otherwise fill
 * the console with errors on the lab machines.
 *
 * One reused <audio> element rather than THREE.Audio: voice is UI sound,
 * not positional, and streaming a short MP3 needs no decode-to-buffer step.
 *
 * @returns {{ play(speaker: string, text: string): boolean, progress(): number|null, stop(): void,
 *   setPaused(paused: boolean): void, setVolume(volume: number): void }}
 */
export function createVoicePlayer() {
  const audio = new Audio();
  audio.preload = 'auto';
  // key -> gain for that clip (muttered lines are recorded at full level and
  // played quieter; see QUIET_GAIN in the generator).
  let available = new Map();
  let volume = 1;
  let clipGain = 1;
  // True from play() until the clip ends or is stopped, so unpausing after a
  // clip already finished doesn't replay it from the start.
  let active = false;
  // True from play() until stop(), even once the clip has ended — what
  // progress() reports on. Cleared if the clip can't be played after all.
  let following = false;

  fetch(VOICE_MANIFEST)
    .then((response) => (response.ok ? response.json() : { clips: {} }))
    .then((manifest) => {
      available = new Map(Object.entries(manifest.clips ?? {}).map(([key, entry]) => [key, entry?.gain ?? 1]));
    })
    .catch(() => { available = new Map(); });

  audio.addEventListener('ended', () => { active = false; });
  audio.addEventListener('error', () => { active = false; following = false; });

  function stop() {
    active = false;
    following = false;
    audio.pause();
  }

  return {
    /** @returns {boolean} whether a clip is starting for this line */
    play(speaker, text) {
      stop();
      if (!speaker || !text || volume === 0) return false;
      const key = voiceKey(speaker, text);
      if (!available.has(key)) return false;
      audio.src = `${VOICE_DIR}${key}.mp3`;
      clipGain = available.get(key);
      audio.volume = volume * clipGain;
      active = true;
      following = true;
      // Rejects if the browser hasn't had a user gesture yet; the text still shows.
      audio.play().catch(() => { active = false; following = false; });
      return true;
    },
    /**
     * How far through the current line's clip playback is, 0–1, for the
     * typewriter to keep pace with; null while there's nothing to follow
     * (no clip, it failed, or its length isn't known yet because it's
     * still loading).
     */
    progress() {
      if (!following) return null;
      if (audio.ended) return 1;
      const { duration } = audio;
      return Number.isFinite(duration) && duration > 0 ? Math.min(1, audio.currentTime / duration) : null;
    },
    stop,
    setPaused(paused) {
      if (!active) return;
      if (paused) audio.pause();
      else audio.play().catch(() => { active = false; });
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      audio.volume = volume * clipGain;
      if (volume === 0) stop();
    },
  };
}

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
 * @returns {{ play(speaker: string, text: string): void, stop(): void,
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

  fetch(VOICE_MANIFEST)
    .then((response) => (response.ok ? response.json() : { clips: {} }))
    .then((manifest) => {
      available = new Map(Object.entries(manifest.clips ?? {}).map(([key, entry]) => [key, entry?.gain ?? 1]));
    })
    .catch(() => { available = new Map(); });

  audio.addEventListener('ended', () => { active = false; });

  function stop() {
    active = false;
    audio.pause();
  }

  return {
    play(speaker, text) {
      stop();
      if (!speaker || !text || volume === 0) return;
      const key = voiceKey(speaker, text);
      if (!available.has(key)) return;
      audio.src = `${VOICE_DIR}${key}.mp3`;
      clipGain = available.get(key);
      audio.volume = volume * clipGain;
      active = true;
      // Rejects if the browser hasn't had a user gesture yet; the text still shows.
      audio.play().catch(() => { active = false; });
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

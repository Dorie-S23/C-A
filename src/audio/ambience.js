import { loadSound } from './sounds.js';

const FADE_SECONDS = 1.5;
// Under the pause menu the room bed ducks rather than cuts out: silence
// would read as the game having crashed.
const PAUSED_LEVEL = 0.35;
// Average loudness each room's bed is scaled to (see loadSound), well under
// the voices so dialogue always sits on top.
const RMS = 0.03;

/**
 * A quiet looping background bed per room (`ambience-<room key>`, generated
 * by tools/generateSounds.mjs), crossfaded on every room change. Rooms
 * without a generated loop are just silent.
 *
 * Plain Web Audio rather than THREE.Audio: a looping AudioBufferSourceNode
 * wraps without the gap an <audio loop> element leaves, and the bed isn't
 * positional, so it bypasses the listener and goes straight out.
 *
 * @param {() => (AudioContext|null)} getContext - the game's shared context,
 *   or null until the first click/key unlocks audio
 * @returns {{ setRoom(key: string|null): void, setPaused(paused: boolean): void,
 *   setVolume(volume: number): void }}
 */
export function createAmbience(getContext) {
  let wanted = null;
  let playing = null; // { key, source, fade }
  let master = null;
  let volume = 0.45;
  let paused = false;
  let request = 0;
  const buffers = new Map(); // key -> Promise<AudioBuffer|null>, so each loop downloads once

  const level = () => volume * (paused ? PAUSED_LEVEL : 1);

  function fadeOut(context) {
    if (!playing) return;
    const { source, fade } = playing;
    playing = null;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    source.onended = () => { source.disconnect(); fade.disconnect(); };
    source.stop(now + FADE_SECONDS);
  }

  async function setRoom(key) {
    wanted = key ?? null;
    const context = getContext();
    if (!context || playing?.key === wanted) return;
    const mine = ++request;
    fadeOut(context);
    if (!wanted) return;
    if (!buffers.has(wanted)) buffers.set(wanted, loadSound(context, `ambience-${wanted}`, { rms: RMS }));
    const buffer = await buffers.get(wanted);
    // Another room was picked (or home) while this one downloaded.
    if (!buffer || mine !== request) return;

    if (!master) {
      master = context.createGain();
      master.gain.value = level();
      master.connect(context.destination);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const fade = context.createGain();
    const now = context.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
    source.connect(fade).connect(master);
    // A random point in the loop, so walking back into a room doesn't
    // restart the exact same few seconds every time.
    source.start(now, Math.random() * buffer.duration);
    playing = { key: wanted, source, fade };
  }

  function applyLevel() {
    const context = getContext();
    if (!master || !context) return;
    master.gain.setTargetAtTime(level(), context.currentTime, 0.15);
  }

  // A room picked before audio was unlocked starts on the first gesture.
  // Deferred a tick so the opening audio's own unlock listener has created
  // the context first.
  const retry = () => setTimeout(() => { if (wanted && !playing) setRoom(wanted); });
  window.addEventListener('pointerdown', retry, { capture: true });
  window.addEventListener('keydown', retry, { capture: true });

  return {
    setRoom,
    setPaused(value) {
      paused = value;
      applyLevel();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      applyLevel();
    },
  };
}

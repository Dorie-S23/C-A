import { loadSound, loadSoundFile } from './sounds.js';

const FADE_SECONDS = 1.5;
// Under the pause menu the room bed ducks rather than cuts out: silence
// would read as the game having crashed.
const PAUSED_LEVEL = 0.35;
// Average loudness each room's bed is scaled to (see loadSound), well under
// the voices so dialogue always sits on top.
const RMS = 0.03;
const XDDCC_CUT_START = 64;
const XDDCC_CUT_END = 68.05;
const XDDCC_CROSSFADE = 0.04;

function cutAudioRange(context, buffer, startSeconds, endSeconds) {
  if (buffer.duration <= startSeconds || endSeconds <= startSeconds) return buffer;
  const start = Math.min(buffer.length, Math.floor(startSeconds * buffer.sampleRate));
  const end = Math.min(buffer.length, Math.floor(endSeconds * buffer.sampleRate));
  const crossfade = Math.min(
    Math.floor(XDDCC_CROSSFADE * buffer.sampleRate),
    start,
    buffer.length - end,
  );
  if (end <= start) return buffer;

  // Overlap a few milliseconds on either side of the edit so the removed
  // passage doesn't leave a sharp waveform discontinuity.
  const output = context.createBuffer(
    buffer.numberOfChannels,
    buffer.length - (end - start) - crossfade,
    buffer.sampleRate,
  );
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const input = buffer.getChannelData(channel);
    const result = output.getChannelData(channel);
    const prefixEnd = start - crossfade;
    result.set(input.subarray(0, prefixEnd));
    for (let i = 0; i < crossfade; i++) {
      const blend = (i + 1) / (crossfade + 1);
      result[prefixEnd + i] = input[start - crossfade + i] * (1 - blend)
        + input[end + i] * blend;
    }
    result.set(input.subarray(end + crossfade), prefixEnd + crossfade);
  }
  return output;
}

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
  let kaufmoProximity = 0;
  let roomGain = 1;
  let request = 0;
  const buffers = new Map(); // key -> Promise<AudioBuffer|null>, so each loop downloads once

  const level = () => volume * (paused ? PAUSED_LEVEL : 1);

  function fadeOut(context) {
    if (!playing) return;
    const { source, fade, proximity } = playing;
    playing = null;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FADE_SECONDS);
    source.onended = () => { source.disconnect(); fade.disconnect(); proximity.disconnect(); };
    source.stop(now + FADE_SECONDS);
  }

  async function setRoom(key) {
    const next = key ?? null;
    if (next !== wanted) roomGain = 1;
    wanted = next;
    const context = getContext();
    if (!context || playing?.key === wanted) return;
    const mine = ++request;
    fadeOut(context);
    if (!wanted) return;
    if (!buffers.has(wanted)) {
      const buffer = wanted === 'ribbit'
        ? loadSoundFile(context, 'Still Friends.mp3', { rms: RMS })
        : wanted === 'pomni'
          ? loadSoundFile(context, 'XDDCC.mp3', { rms: RMS })
        : loadSound(context, `ambience-${wanted}`, { rms: RMS });
      buffers.set(wanted, wanted === 'pomni'
        ? buffer.then(decoded => decoded ? cutAudioRange(context, decoded, XDDCC_CUT_START, XDDCC_CUT_END) : null)
        : buffer);
    }
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
    const proximity = context.createGain();
    proximity.gain.value = wanted === 'kaufmo'
      ? (paused ? 0 : kaufmoProximity) * roomGain
      : roomGain;
    const now = context.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_SECONDS);
    source.connect(fade).connect(proximity).connect(master);
    // A random point in the loop, so walking back into a room doesn't
    // restart the exact same few seconds every time.
    source.start(now, Math.random() * buffer.duration);
    playing = { key: wanted, source, fade, proximity };
  }

  function applyLevel() {
    const context = getContext();
    if (!master || !context) return;
    master.gain.setTargetAtTime(level(), context.currentTime, 0.15);
  }

  function applyTrackGain() {
    const context = getContext();
    if (!playing || !context) return;
    const target = playing.key === 'kaufmo'
      ? (paused ? 0 : kaufmoProximity) * roomGain
      : roomGain;
    playing.proximity.gain.setTargetAtTime(target, context.currentTime, 0.12);
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
      applyTrackGain();
    },
    /** Kaufmo's writing loop fades with distance and silences during dialogue. */
    setKaufmoProximity(value) {
      const next = Math.max(0, Math.min(1, value));
      if (Math.abs(next - kaufmoProximity) < 0.005) return;
      kaufmoProximity = next;
      applyTrackGain();
    },
    /** Fades the active room track independently from the ambience setting. */
    setRoomGain(value) {
      roomGain = Math.max(0, Math.min(1, value));
      applyTrackGain();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      applyLevel();
    },
  };
}

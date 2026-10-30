/**
 * Loads the recorded sound effects tools/generateSounds.mjs writes into
 * public/audio/sounds/ (room ambience, the opening's snore and knock).
 *
 * Every loader resolves to null rather than throwing when a sound hasn't
 * been generated or won't decode, so callers keep their fallback (the
 * synthesized placeholders, or silence) and audio never blocks gameplay.
 * Only ids listed in the manifest are fetched, so an ungenerated sound
 * doesn't 404 on the lab machines.
 */
export const SOUNDS_DIR = './audio/sounds/';
const MANIFEST = `${SOUNDS_DIR}manifest.json`;

let manifest = null;
function loadManifest() {
  manifest ??= fetch(MANIFEST)
    .then((response) => (response.ok ? response.json() : {}))
    .then((data) => data.sounds ?? {})
    .catch(() => ({}));
  return manifest;
}

// Never boost a recording more than this to reach its target loudness: a
// near-silent generation scaled up to full level is mostly its noise floor,
// which plays as a steady hiss (it sounded like rain).
const MAX_GAIN = 3;

/**
 * @param {BaseAudioContext} context
 * @param {string} id - a key of SOUNDS in tools/generateSounds.mjs
 * @param {{ peak?: number, rms?: number, trimStart?: boolean }} shape - the
 *   level to scale the recording to, so it sits where the game was balanced:
 *   `peak` (the loudest sample) for one-shots like the knock, `rms` (average
 *   loudness) for beds, which otherwise vary hugely — a dense drone and a
 *   sparse ticking clock with the same peak are nowhere near equally loud.
 *   trimStart: cut the lead-in before the first real sound, for one-shots
 *   timed to an animation (the knock), where even 50 ms of silence shows.
 * @returns {Promise<AudioBuffer|null>}
 */
export async function loadSound(context, id, { peak, rms, trimStart = false }) {
  try {
    if (!(await loadManifest())[id]) return null;
    const response = await fetch(`${SOUNDS_DIR}${id}.mp3`);
    if (!response.ok) return null;
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    return reshape(context, decoded, { peak, rms }, trimStart);
  } catch {
    return null;
  }
}

/** Loads an audio file from the sounds folder without requiring a manifest entry. */
export async function loadSoundFile(context, fileName, { peak, rms, trimStart = false } = {}) {
  try {
    const response = await fetch(`${SOUNDS_DIR}${encodeURIComponent(fileName)}`);
    if (!response.ok) return null;
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    return reshape(context, decoded, { peak, rms }, trimStart);
  } catch {
    return null;
  }
}

function reshape(context, buffer, target, trimStart) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let max = 0;
  let sumSquares = 0;
  for (const data of channels) {
    for (let i = 0; i < data.length; i++) {
      max = Math.max(max, Math.abs(data[i]));
      sumSquares += data[i] * data[i];
    }
  }
  if (max === 0) return null;
  const level = Math.sqrt(sumSquares / (channels.length * buffer.length));
  // Also kept under full scale, so boosting a quiet bed can't clip its peaks.
  const scale = Math.min(target.peak ? target.peak / max : target.rms / level, MAX_GAIN, 0.95 / max);

  // Edges below this are dropped: for one-shots, the lead-in before the
  // attack; for every sound, the near-silent padding MP3 encoders add at
  // both ends, which would otherwise click or gap each time a loop wraps.
  const startFloor = trimStart ? max * 0.05 : 1e-4;
  const loud = (i, floor) => channels.some((data) => Math.abs(data[i]) > floor);
  let start = 0;
  while (start < buffer.length - 1 && !loud(start, startFloor)) start++;
  let end = buffer.length;
  while (end > start + 1 && !loud(end - 1, 1e-4)) end--;

  const out = context.createBuffer(channels.length, end - start, buffer.sampleRate);
  channels.forEach((data, c) => {
    const samples = out.getChannelData(c);
    for (let i = start; i < end; i++) samples[i - start] = data[i] * scale;
  });
  return out;
}

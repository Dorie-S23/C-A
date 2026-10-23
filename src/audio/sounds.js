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

/**
 * @param {BaseAudioContext} context
 * @param {string} id - a key of SOUNDS in tools/generateSounds.mjs
 * @param {{ peak: number, trimStart?: boolean }} shape - peak: the loudest
 *   sample after scaling, so a recording sits at the level the game was
 *   balanced for (the generated files all come out near full scale).
 *   trimStart: cut the lead-in before the first real sound, for one-shots
 *   timed to an animation (the knock), where even 50 ms of silence shows.
 * @returns {Promise<AudioBuffer|null>}
 */
export async function loadSound(context, id, { peak, trimStart = false }) {
  try {
    if (!(await loadManifest())[id]) return null;
    const response = await fetch(`${SOUNDS_DIR}${id}.mp3`);
    if (!response.ok) return null;
    const decoded = await context.decodeAudioData(await response.arrayBuffer());
    return reshape(context, decoded, peak, trimStart);
  } catch {
    return null;
  }
}

function reshape(context, buffer, peak, trimStart) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  let max = 0;
  for (const data of channels) for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max === 0) return null;

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
  const scale = peak / max;
  channels.forEach((data, c) => {
    const target = out.getChannelData(c);
    for (let i = start; i < end; i++) target[i - start] = data[i] * scale;
  });
  return out;
}

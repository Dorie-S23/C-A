/**
 * Where the dialogue voice clips live and what each one is called. Shared by
 * tools/generateVoices.mjs (which writes them) and voicePlayer.js (which
 * plays them), so both derive the same file name from a line on their own.
 *
 * A clip is named after its speaker and a hash of the exact text, not after
 * the node's id or position: most lines have no id, positions shift whenever
 * someone inserts a line, and lineFor can swap a line's text at runtime.
 * Hashing the text also means an edited line can never play its old
 * recording — it just has no clip until the generator is re-run.
 */
export const VOICE_DIR = './audio/voice/';
export const VOICE_MANIFEST = `${VOICE_DIR}manifest.json`;

/**
 * @param {string} speaker - a SPEAKERS id
 * @param {string} text - the line exactly as displayed
 * @returns {string} e.g. 'ribbit-3f9a01c2' (the clip is `${VOICE_DIR}${key}.mp3`)
 */
export function voiceKey(speaker, text) {
  // 32-bit FNV-1a: tiny, synchronous and identical in Node and the browser.
  let hash = 0x811c9dc5;
  const input = text.trim();
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${speaker}-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * The part of a line that's actually said aloud: drops stage directions in
 * parentheses ("(beat)", "(Sit down next to her and wait.)") and the quote
 * marks choice options wrap around speech, which the voice would otherwise
 * read out or trip over.
 *
 * @param {string} text
 * @returns {string} '' when nothing is left to say (an action-only option,
 *   or a line that's just "…")
 */
export function speechText(text) {
  const said = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^["“]\s*/, '').replace(/\s*["”]$/, '');
  return /[\p{L}\p{N}]/u.test(said) ? said : '';
}

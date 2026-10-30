// A looping AudioBufferSourceNode can't be paused, only stopped, so holding
// a loop means remembering where it was and starting a fresh source there.
const HOLD_FADE_SECONDS = .05;   // a hard stop mid-waveform clicks
const RESUME_FADE_SECONDS = .2;

/**
 * Starts `buffer` looping into `fade` from `offset` seconds in, and returns
 * the entry holdLoop/resumeLoop work on: { buffer, fade, source, startedAt,
 * offset, held }.
 */
export function startLoop(context, buffer, fade, offset = 0) {
  const entry = { buffer, fade, source: null, startedAt: 0, offset, held: true };
  resumeLoop(context, entry, { fadeIn: false });
  return entry;
}

/** Stops the loop and remembers its position, so resumeLoop carries on from there. */
export function holdLoop(context, entry) {
  if (!entry || entry.held) return;
  const now = context.currentTime;
  entry.offset = (entry.offset + now - entry.startedAt) % entry.buffer.duration;
  entry.held = true;
  const { source, fade } = entry;
  entry.source = null;
  fade.gain.cancelScheduledValues(now);
  fade.gain.setValueAtTime(fade.gain.value, now);
  fade.gain.linearRampToValueAtTime(0, now + HOLD_FADE_SECONDS);
  source.onended = () => source.disconnect();
  source.stop(now + HOLD_FADE_SECONDS);
}

/** Picks a held loop back up where holdLoop left it. */
export function resumeLoop(context, entry, { fadeIn = true } = {}) {
  if (!entry?.held) return;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = entry.buffer;
  source.loop = true;
  source.connect(entry.fade);
  source.start(now, entry.offset);
  if (fadeIn) {
    entry.fade.gain.cancelScheduledValues(now);
    entry.fade.gain.setValueAtTime(0, now);
    entry.fade.gain.linearRampToValueAtTime(1, now + RESUME_FADE_SECONDS);
  }
  Object.assign(entry, { source, startedAt: now, held: false });
}

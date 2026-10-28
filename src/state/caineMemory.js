export const CAINE_HISTORY_KEY = 'tadc.caineMemory.history.v1';
export const CAINE_ENABLED_KEY = 'tadc.caineMemory.enabled';
const MAX_COUNT = 9999;
const SCENES = { level1: 'Ribbit’s scene', level2: 'the photo search', maze: 'the maze' };
const emptyHistory = () => ({ version: 1, runs: 0, retries: { level1: 0, level2: 0, maze: 0 } });
const count = value => Number.isInteger(value) && value >= 0 && value <= MAX_COUNT ? value : 0;

/** Browser-local flavor only: no campaign state, score, identity, or network access. */
export function createCaineMemory({ storage } = {}) {
  if (storage === undefined) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  const read = key => { try { return storage?.getItem(key); } catch { return null; } };
  let enabled = read(CAINE_ENABLED_KEY) !== '0';
  let history = emptyHistory();
  let jokeShown = false;
  try {
    const saved = JSON.parse(read(CAINE_HISTORY_KEY));
    if (saved?.version === 1) {
      history.runs = count(saved.runs);
      jokeShown = saved.pauseJokeShown === true;
      for (const level of Object.keys(SCENES)) history.retries[level] = count(saved.retries?.[level]);
    }
  } catch { /* Malformed/blocked storage falls back to empty local history. */ }
  let revision = 0;
  let caption = null, captionLeft = 0, wasVisible = false;
  function cancelCaption() { caption = null; captionLeft = 0; wasVisible = false; }
  function persist() {
    try { storage?.setItem(CAINE_HISTORY_KEY, JSON.stringify({ ...history, pauseJokeShown: jokeShown })); } catch { /* Session-only fallback. */ }
  }
  return {
    get enabled() { return enabled; },
    get revision() { return revision; },
    snapshot: () => ({ ...history, retries: { ...history.retries } }),
    setEnabled(value) {
      const next = Boolean(value);
      if (next !== enabled) revision++;
      enabled = next;
      if (!enabled) cancelCaption();
      try { storage?.setItem(CAINE_ENABLED_KEY, enabled ? '1' : '0'); } catch { /* Session-only fallback. */ }
    },
    clear() {
      revision++;
      history = emptyHistory();
      cancelCaption();
      // Keep the current run's joke latch and the user's on/off preference.
      try { storage?.removeItem(CAINE_HISTORY_KEY); } catch { /* Still clears this session. */ }
    },
    beginRun() {
      revision++;
      jokeShown = false;
      cancelCaption();
      if (!enabled) return;
      const retries = Object.values(history.retries).some(value => value > 0);
      caption = history.runs === 0 && !retries
        ? 'Caine: A brand-new adventure! I have an excellent memory for entrances.'
        : retries
          ? 'Caine: A fresh start! I remember a few rehearsals from last time.'
          : 'Caine: Back for another opening act? I remember that entrance.';
      captionLeft = 6;
      history.runs = Math.min(MAX_COUNT, history.runs + 1);
      persist();
    },
    takePauseJoke() {
      if (!enabled || jokeShown) return null;
      jokeShown = true;
      persist();
      return 'Caine: “Escape”? What a splendid name for a pause button!';
    },
    retryCaption(level) {
      if (!enabled || !Object.hasOwn(SCENES, level)) return null;
      return history.retries[level] === 0
        ? `Caine: Another take of ${SCENES[level]}? Let’s call it a rehearsal!`
        : `Caine: Back to ${SCENES[level]}? I remember this encore. No extra tickets required!`;
    },
    recordRetry(level, ticket) {
      if (!enabled || ticket !== revision || !Object.hasOwn(SCENES, level)) return false;
      history.retries[level] = Math.min(MAX_COUNT, history.retries[level] + 1);
      persist();
      return true;
    },
    cancelCaption,
    updateCaption(delta, { playable = false } = {}) {
      if (!enabled || !playable || !caption) { wasVisible = false; return null; }
      const elapsed = wasVisible && Number.isFinite(delta) && delta >= 0 ? delta : 0;
      wasVisible = true;
      captionLeft = Math.max(0, captionLeft - elapsed);
      if (captionLeft === 0) { cancelCaption(); return null; }
      return caption;
    },
  };
}

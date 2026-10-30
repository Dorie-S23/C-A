// Six shared map hints, always targeted at the current collection goal.
export const MAZE_HINT_OBJECTS = [
  { id: 'hot-chocolate-mug', number: 1, marker: 'M', label: 'Hot Chocolate Mug', station: 'Hot Chocolate Station', landmark: 'The Cocoa Club', alcove: 1,
    text: 'Looking for something warm? Check the Hot Chocolate Station.' },
  { id: 'bowling-ball', number: 2, marker: 'B', label: 'Bowling Ball', station: 'Bowling Station', landmark: 'Lost & Found', alcove: 0,
    text: 'Something round has gone missing. Try the Bowling Station.' },
];
export const MAZE_HINT_LIMIT = 6;

export function createMazeHintProgress({ hasCollected = () => false } = {}) {
  let used = 0;
  const bounded = value => Number.isInteger(value) ? Math.max(0, Math.min(MAZE_HINT_LIMIT, value)) : 0;
  const next = () => {
    if (used >= MAZE_HINT_LIMIT) return null;
    return MAZE_HINT_OBJECTS.some(item => !hasCollected(item.id))
      ? { kind: 'objects', number: used + 1,
          text: 'P marks where you are. The other markers show the objects you still need.' }
      : { kind: 'jax', number: used + 1,
          text: 'P marks where you are. Look for J to find Jax.' };
  };
  return {
    get next() { return next(); },
    get canReveal() { return Boolean(next()); },
    get used() { return used; },
    get remaining() { return MAZE_HINT_LIMIT - used; },
    reveal() {
      const hint = next();
      if (hint) used++;
      return hint;
    },
    snapshot() { return { version: 3, used }; },
    restore(saved) {
      if (saved?.version === 3) used = bounded(saved.used);
      else if (saved?.version === 2) {
        // Keep previously spent hints spent when upgrading old checkpoints.
        const stations = MAZE_HINT_OBJECTS.filter(item => Array.isArray(saved.stationHints) && saved.stationHints.includes(item.id)).length;
        const oldMaps = value => Math.min(2, bounded(value));
        used = bounded(stations + oldMaps(saved.objectMaps) + oldMaps(saved.jaxMaps));
      } else used = Math.min(4, bounded(saved?.unlocked));
    },
    reset() { used = 0; },
  };
}

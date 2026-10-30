// Six shared hints: maps (targeted at the current goal) and, last, two trails to Jax.
export const MAZE_HINT_OBJECTS = [
  { id: 'hot-chocolate-mug', number: 1, marker: 'M', label: 'Hot Chocolate Mug', station: 'Hot Chocolate Station', landmark: 'The Cocoa Club', alcove: 1,
    text: 'Looking for something warm? Check the Hot Chocolate Station.' },
  { id: 'bowling-ball', number: 2, marker: 'B', label: 'Bowling Ball', station: 'Bowling Station', landmark: 'Lost & Found', alcove: 0,
    text: 'Something round has gone missing. Try the Bowling Station.' },
];
export const MAZE_HINT_LIMIT = 6;
// The last two are trails, not maps: back in the maze, a trail of light
// runs through the corridors from Pomni to Jax and is gone in a few seconds.
export const MAZE_TRAIL_HINTS = 2;

export function createMazeHintProgress({ hasCollected = () => false } = {}) {
  let used = 0;
  // The map kinds she's unlocked ('objects', 'jax'): she can look at those again.
  const maps = new Set();
  const bounded = value => Number.isInteger(value) ? Math.max(0, Math.min(MAZE_HINT_LIMIT, value)) : 0;
  const next = () => {
    if (used >= MAZE_HINT_LIMIT) return null;
    if (used >= MAZE_HINT_LIMIT - MAZE_TRAIL_HINTS) {
      return { kind: 'trail', number: used + 1,
        text: 'Back in the maze, a trail of light will run from you to Jax. It only lasts a few seconds, so watch where it goes.' };
    }
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
    /** The map she can look at again: Jax's if she's unlocked it, else the objects' (null if neither). */
    get map() { return maps.has('jax') ? 'jax' : maps.has('objects') ? 'objects' : null; },
    reveal() {
      const hint = next();
      if (hint) {
        used++;
        if (hint.kind !== 'trail') maps.add(hint.kind);
      }
      return hint;
    },
    snapshot() { return { version: 4, used, maps: [...maps] }; },
    restore(saved) {
      maps.clear();
      if (saved?.version === 4 || saved?.version === 3) {
        used = bounded(saved.used);
        for (const kind of Array.isArray(saved.maps) ? saved.maps : []) if (kind === 'objects' || kind === 'jax') maps.add(kind);
        // Before maps were remembered: any map hint spent was the objects'.
        if (saved.version === 3 && used > 0) maps.add('objects');
      } else if (saved?.version === 2) {
        // Keep previously spent hints spent when upgrading old checkpoints.
        const stations = MAZE_HINT_OBJECTS.filter(item => Array.isArray(saved.stationHints) && saved.stationHints.includes(item.id)).length;
        const oldMaps = value => Math.min(2, bounded(value));
        used = bounded(stations + oldMaps(saved.objectMaps) + oldMaps(saved.jaxMaps));
        if (oldMaps(saved.objectMaps)) maps.add('objects');
        if (oldMaps(saved.jaxMaps)) maps.add('jax');
      } else used = Math.min(4, bounded(saved?.unlocked));
    },
    reset() { used = 0; maps.clear(); },
  };
}

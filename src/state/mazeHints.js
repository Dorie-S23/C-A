// Three hints: first the map (the keepsakes still to find, and Jax), which
// she can look at again after; then two trails to Jax.
export const MAZE_HINT_OBJECTS = [
  { id: 'hot-chocolate-mug', number: 1, marker: 'M', label: 'Hot Chocolate Mug', station: 'Hot Chocolate Station', landmark: 'The Cocoa Club', alcove: 1,
    text: 'Looking for something warm? Check the Hot Chocolate Station.' },
  { id: 'bowling-ball', number: 2, marker: 'B', label: 'Bowling Ball', station: 'Bowling Station', landmark: 'Lost & Found', alcove: 0,
    text: 'Something round has gone missing. Try the Bowling Station.' },
];
export const MAZE_HINT_LIMIT = 3;
// The last two are trails, not maps: back in the maze, a trail of light
// runs through the corridors from Pomni to Jax and is gone in a few seconds.
export const MAZE_TRAIL_HINTS = 2;
const MAP_TEXT = 'P marks where you are. J is Jax, and the other markers show anything of his you haven’t found.';

export function createMazeHintProgress() {
  let used = 0;
  let mapUnlocked = false; // she can look at it again
  const bounded = value => Number.isInteger(value) ? Math.max(0, Math.min(MAZE_HINT_LIMIT, value)) : 0;
  const next = () => {
    if (used >= MAZE_HINT_LIMIT) return null;
    if (used >= MAZE_HINT_LIMIT - MAZE_TRAIL_HINTS) {
      return { kind: 'trail', number: used + 1,
        text: 'Back in the maze, a trail of light will run from you to Jax. It only lasts a few seconds, so watch where it goes.' };
    }
    return { kind: 'map', number: used + 1, text: MAP_TEXT };
  };
  return {
    get next() { return next(); },
    get canReveal() { return Boolean(next()); },
    get used() { return used; },
    get remaining() { return MAZE_HINT_LIMIT - used; },
    /** The map, once unlocked (null before): she can look at it again. */
    get map() { return mapUnlocked ? 'map' : null; },
    mapText: MAP_TEXT,
    reveal() {
      const hint = next();
      if (hint) {
        used++;
        if (hint.kind === 'map') mapUnlocked = true;
      }
      return hint;
    },
    snapshot() { return { version: 5, used, map: mapUnlocked }; },
    restore(saved) {
      // Saves from when there were six hints keep what they'd spent, up to
      // the three there are now; any spent then included a map.
      if (saved?.version === 5) { used = bounded(saved.used); mapUnlocked = Boolean(saved.map) || used > 0; }
      else if (saved?.version === 4 || saved?.version === 3) used = bounded(saved.used);
      else if (saved?.version === 2) {
        const stations = MAZE_HINT_OBJECTS.filter(item => Array.isArray(saved.stationHints) && saved.stationHints.includes(item.id)).length;
        used = bounded(stations + Math.min(2, bounded(saved.objectMaps)) + Math.min(2, bounded(saved.jaxMaps)));
      } else used = bounded(saved?.unlocked);
      if (saved?.version !== 5) mapUnlocked = used > 0;
    },
    reset() { used = 0; mapUnlocked = false; },
  };
}

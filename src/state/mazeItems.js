/**
 * The maze's two hidden keepsakes (the storyline outline's "bowling ball
 * and a hot chocolate mug") — small finds along the way, not scored
 * against the Escape Threshold like Level 2's photos. One of each, not a
 * counted collectible set.
 */
export const MAZE_FINDABLES = [
  { id: 'bowling-ball', label: 'bowling ball' },
  { id: 'hot-chocolate-mug', label: 'mug of hot chocolate' },
];

/** One run's maze finds, shared by the maze room the same way
 * createLevel2Items() shares Level 2's photos. */
export function createMazeItems({ onCollect = () => {} } = {}) {
  const collected = new Set();
  return {
    hasCollected: (id) => collected.has(id),
    collect(id) {
      if (collected.has(id)) return;
      collected.add(id);
      onCollect(id, collected.size, MAZE_FINDABLES.length);
    },
    totalFound: () => collected.size,
    reset() { collected.clear(); },
  };
}

export const MAZE_SEARCH_SECONDS = 180;

/** Per-attempt gameplay clock; reaching Jax is not a Level 3 completion. */
export function createMazeSearch() {
  let timeLeft = null;
  let status = 'idle';
  return {
    get timeLeft() { return timeLeft; },
    get status() { return status; },
    start() { timeLeft = MAZE_SEARCH_SECONDS; status = 'searching'; },
    clear() { timeLeft = null; status = 'idle'; },
    tick(deltaSeconds, { playable = false, allItems = false, atJax = false } = {}) {
      if (!playable || status !== 'searching') return null;
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) throw new RangeError('Maze clock delta must be finite and nonnegative.');
      if (allItems && atJax) { status = 'reached'; return 'reached'; }
      timeLeft = Math.max(0, timeLeft - deltaSeconds);
      if (timeLeft === 0) { status = 'expired'; return 'expired'; }
      return null;
    },
  };
}

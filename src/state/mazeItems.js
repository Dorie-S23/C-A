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

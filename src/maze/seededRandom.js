/** Repeatable random values in [0, 1) from an unsigned 32-bit maze seed. */
export function createSeededRandom(seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Maze seed must be an integer from 0 to 4294967295.');
  }
  let state = seed;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

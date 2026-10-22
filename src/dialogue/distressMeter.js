/**
 * How upset the character on the other end of a graded conversation is,
 * 0 (calm) to DISTRESS_MAX: each correct pick (see choiceTally) eases it
 * one step, each wrong one pushes it one step. Reaching DISTRESS_MAX is
 * the breaking point — Level 1's lose condition: Ribbit shuts Pomni out
 * (see src/levels/level1.js). Like choiceTally, it's kept free of
 * DOM/Three.js so it can be tested in Node (see _verify_dialogue.mjs).
 *
 * Starting at 1, that means two wrong answers in a row from the start, or
 * three wrong answers in all, lose the level; anything better wins.
 */
export const DISTRESS_START = 1;
export const DISTRESS_MAX = 3;

export function createDistressMeter(start = DISTRESS_START) {
  let level = start;
  return {
    /** Moves the meter for one graded pick and returns the new level. */
    record(correct) {
      level = Math.max(0, Math.min(DISTRESS_MAX, level + (correct ? -1 : 1)));
      return level;
    },
    get level() {
      return level;
    },
    get brokeDown() {
      return level >= DISTRESS_MAX;
    },
  };
}

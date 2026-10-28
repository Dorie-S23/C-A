import { createChoiceTally } from '../dialogue/choiceTally.js';
import { level1RibbitDialogue } from '../data/dialogues.js';

export const RIBBIT_DISTRESS_LIMIT = 3;

/**
 * One conversation attempt. A right answer calms Ribbit a step, a 0-point
 * one upsets her a step (shown on her, never past LIMIT - 1), and a
 * negative-point one (each choice's "game over" option) takes her straight
 * to the limit: that branch plays out its lines and ends on a `gameOver`
 * beat, where level1.js calls fail(). Failure is latched.
 */
export function createLevel1Attempt() {
  const tally = createChoiceTally(level1RibbitDialogue);
  let distress = 1;
  let failed = false;
  return {
    record(option) {
      if (failed) return null;
      const correct = tally.record(option);
      if (correct === null) return null;
      if ((option.points ?? 0) < 0) distress = RIBBIT_DISTRESS_LIMIT;
      else distress = Math.max(0, Math.min(RIBBIT_DISTRESS_LIMIT - 1, distress + (correct ? -1 : 1)));
      return correct;
    },
    /** The game-over beat was reached. */
    fail() { failed = true; },
    get distress() { return distress; },
    get failed() { return failed; },
    get points() { return Math.max(0, tally.points); },
    get correct() { return tally.correct; },
    get answered() { return tally.answered; },
  };
}

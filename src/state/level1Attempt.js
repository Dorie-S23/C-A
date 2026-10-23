import { createChoiceTally } from '../dialogue/choiceTally.js';
import { level1RibbitDialogue } from '../data/dialogues.js';

export const RIBBIT_DISTRESS_LIMIT = 3;

/** One conversation attempt. Failure is latched, even if later input arrives. */
export function createLevel1Attempt() {
  const tally = createChoiceTally(level1RibbitDialogue);
  let distress = 1;
  let failed = false;
  return {
    record(option) {
      if (failed) return null;
      const correct = tally.record(option);
      if (correct === null) return null;
      distress = Math.max(0, Math.min(RIBBIT_DISTRESS_LIMIT, distress + (correct ? -1 : 1)));
      failed = distress === RIBBIT_DISTRESS_LIMIT;
      return correct;
    },
    get distress() { return distress; },
    get failed() { return failed; },
    get points() { return tally.points; },
    get correct() { return tally.correct; },
    get answered() { return tally.answered; },
  };
}

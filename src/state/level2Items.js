import { setLevelPoints } from './escapeThreshold.js';

/**
 * One run's Level 2 pictures, shared by every room. Held and handed-in
 * pictures both stay found, but only handed-in pictures earn Escape points.
 * onCollect lets the browser show its pickup hint without coupling this
 * state to the DOM, room models, or renderer.
 */
export function createLevel2Items({ onCollect = () => {} } = {}) {
  const collectedItems = new Set();
  const presentedItems = new Set();
  let stallSeen = false;
  let done = false; // the payoff has actually been heard once already

  const items = {
    hasCollected: (id) => collectedItems.has(id) || presentedItems.has(id),
    collect(id) {
      if (items.hasCollected(id)) return;
      collectedItems.add(id);
      onCollect(items.totalFound());
    },
    heldCount: () => collectedItems.size,
    totalPresented: () => presentedItems.size,
    totalFound: () => collectedItems.size + presentedItems.size,
    /** Hands over everything held; returns the running total, not this batch. */
    presentHeld() {
      for (const id of collectedItems) presentedItems.add(id);
      collectedItems.clear();
      setLevelPoints('level2', presentedItems.size);
      return presentedItems.size;
    },
    /** First post-completion revisit stalls; later visits reveal the payoff. */
    pickPostHandInScript() {
      if (!stallSeen) {
        stallSeen = true;
        return 'level2Complete';
      }
      return 'level2Payoff';
    },
    /** Whether the payoff has actually played through once already — lets
     *  a caller show the "Level 2 Complete" beat only the first time a
     *  replay still hears the same line. */
    isDone: () => done,
    markDone() {
      done = true;
    },
    reset() {
      collectedItems.clear();
      presentedItems.clear();
      stallSeen = false;
      done = false;
      setLevelPoints('level2', 0);
    },
  };

  return items;
}

/**
 * The existing Kaufmo interaction flow: hand over held pictures immediately,
 * choose the reaction for the cumulative total, then use idle/stall/payoff
 * dialogue on revisits. Pictures can be handed in before the opening plays.
 */
export function pickKaufmoScript(items) {
  if (!items) return 'level2Opening';
  if (items.heldCount() > 0) {
    const total = items.presentHeld();
    return `level2HandIn${total}`;
  }
  if (items.totalPresented() >= 3) return items.pickPostHandInScript();
  if (items.totalPresented() > 0) return 'level2Idle';
  return 'level2Opening';
}

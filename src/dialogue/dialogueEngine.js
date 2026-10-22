/**
 * Pure state machine over a dialogue script: given an array of nodes, it
 * tracks the current node and exposes advance()/choose() to move through
 * it. Kept free of DOM/Three.js so the branching logic is testable on its
 * own (see _verify_dialogue.mjs) and so DialogueUI only has to render
 * whatever node is current, never work out what comes next itself.
 *
 * Node shapes:
 *   { type: 'line', id?, speaker, side: 'left'|'right', direction?, text, next? }
 *   { type: 'beat', id?, text, next? }                      — stage direction, no speaker
 *   { type: 'choice', id?, speaker?, text?, options: [{ text, next, points? }] }
 *   { type: 'cue', id?, next? }                              — no box at all; DialogueUI
 *                                                               auto-advances through it and
 *                                                               fires onNode so a caller can
 *                                                               sync a scene-level side effect
 *                                                               to this point in the script
 *
 * `next` is a node `id` to jump to, or omitted to fall through to the next
 * array entry, or `null` to end the script. Choice nodes only advance via
 * choose(optionIndex) — calling advance() on one is a no-op.
 *
 * A script can also be played in parts — e.g. Level 1's knock at the door
 * in one room, the rest inside Ribbit's room after a room change: `startAt`
 * begins at that node id instead of the first node, and reaching the
 * `stopAt` node id ends this part (without showing it) as if the script
 * had finished there.
 *
 * jump(id) moves straight to a node the script doesn't route to itself —
 * for branches decided outside it, e.g. Level 1's 'l1_shut_out' ending
 * once Ribbit's distress hits its limit (see src/levels/level1.js).
 *
 * @param {Array} script
 * @param {{ startAt?: string, stopAt?: string }} [options]
 */
export function createDialogueEngine(script, { startAt, stopAt } = {}) {
  const byId = new Map();
  script.forEach((node, i) => {
    if (node.id) byId.set(node.id, i);
  });

  function lookup(id) {
    if (!byId.has(id)) throw new Error(`Unknown dialogue node id: ${id}`);
    return byId.get(id);
  }
  const stopIndex = stopAt === undefined ? null : lookup(stopAt);

  function resolve(next, index) {
    let target;
    if (next === undefined) target = index + 1 >= script.length ? null : index + 1;
    else if (next === null) target = null;
    else target = lookup(next);
    return target === stopIndex ? null : target;
  }

  let index = startAt !== undefined ? lookup(startAt) : (script.length > 0 ? 0 : null);

  return {
    get current() {
      return index === null ? null : script[index];
    },
    get done() {
      return index === null;
    },
    advance() {
      if (index === null) return;
      const node = script[index];
      if (node.type === 'choice') return;
      index = resolve(node.next, index);
    },
    choose(optionIndex) {
      if (index === null) return null;
      const node = script[index];
      if (node.type !== 'choice') return null;
      const option = node.options[optionIndex];
      if (!option) return null;
      index = resolve(option.next, index);
      return option;
    },
    jump(id) {
      if (index === null) return;
      const target = lookup(id);
      index = target === stopIndex ? null : target;
    },
  };
}

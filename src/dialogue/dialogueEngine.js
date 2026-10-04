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
 *
 * `next` is a node `id` to jump to, or omitted to fall through to the next
 * array entry, or `null` to end the script. Choice nodes only advance via
 * choose(optionIndex) — calling advance() on one is a no-op.
 */
export function createDialogueEngine(script) {
  const byId = new Map();
  script.forEach((node, i) => {
    if (node.id) byId.set(node.id, i);
  });

  function resolve(next, index) {
    if (next === undefined) return index + 1 >= script.length ? null : index + 1;
    if (next === null) return null;
    if (!byId.has(next)) throw new Error(`Unknown dialogue node id: ${next}`);
    return byId.get(next);
  }

  let index = script.length > 0 ? 0 : null;

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
  };
}

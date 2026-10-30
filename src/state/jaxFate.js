import { level3JaxFinalDialogue } from '../data/dialogues.js';

/**
 * Jax's Fate (Gate 2): the second hidden meter, built entirely in Level 3
 * and separate from the Escape Threshold. Each graded choice in the Face to
 * Face conversation (level3JaxFinalDialogue) earns its option's `points`,
 * and each keepsake Pomni recovered in the maze adds KEEPSAKE_BONUS. At the
 * script's 'jaxFate' beat the total is checked once against JAX_SAVE_MARK:
 * enough and he's saved, too few (too many bad choices) and he abstracts.
 * The outcome is latched, so a resumed or replayed conversation follows
 * the same branch, and src/game/endings.js reads it for the ending.
 *
 * Points are kept per choice and *set*, not added, like escapeThreshold.js:
 * answering a choice again after an interrupted conversation replaces the
 * old answer instead of stacking.
 *
 * Hidden on purpose. What the player sees is Jax himself: his distress
 * (0-3, DialogueUI's levels, and the abstraction effect's static through
 * distressFromDialogue) starts at START_DISTRESS and moves a step for each
 * answer, down for a good one and up for a poor one.
 */
export const KEEPSAKE_BONUS = 1;
// The team plan's proposed mark: with both keepsakes, two good answers out
// of five save him; with none, it takes four. Items help but can't save
// him on their own.
export const JAX_SAVE_MARK = 4;
export const START_DISTRESS = 2; // she finds him already glitching
const MAX_DISTRESS = 3;

const choiceNodes = level3JaxFinalDialogue.filter((node) => node.type === 'choice');
export const JAX_FATE_CHOICES = choiceNodes.length;
const choiceOf = new Map(); // option object -> its choice node
const bestPoints = new Map(); // choice node -> points of its best answer
for (const node of choiceNodes) {
  bestPoints.set(node, Math.max(...node.options.map((option) => option.points ?? 0)));
  for (const option of node.options) choiceOf.set(option, node);
}

const OUTCOMES = ['saved', 'abstracted'];

export function createJaxFate() {
  const answers = new Map(); // choice node -> the option picked
  let outcome = null;

  const choicePoints = () => {
    let total = 0;
    for (const option of answers.values()) total += option.points ?? 0;
    return total;
  };

  return {
    /**
     * Records a pick from DialogueUI's onChoice. Returns whether it was the
     * best answer, or null for an option from another script, or once the
     * outcome is decided (nothing changes then).
     */
    record(option) {
      const node = choiceOf.get(option);
      if (!node || outcome) return null;
      answers.set(node, option);
      return (option.points ?? 0) === bestPoints.get(node);
    },

    /** Choice points plus the keepsake bonus. */
    points(keepsakes = 0) {
      return choicePoints() + Math.max(0, keepsakes) * KEEPSAKE_BONUS;
    },

    /** The 'jaxFate' beat: decides once, then keeps answering the same. */
    decide(keepsakes = 0) {
      outcome ??= this.points(keepsakes) >= JAX_SAVE_MARK ? 'saved' : 'abstracted';
      return outcome;
    },

    /** 'saved', 'abstracted', or null until decide(). */
    get outcome() { return outcome; },

    /** 0-3: how close to the edge he looks right now. */
    get distress() {
      if (outcome === 'saved') return 0;
      if (outcome === 'abstracted') return MAX_DISTRESS;
      let level = START_DISTRESS;
      for (const [node, option] of answers) {
        level += (option.points ?? 0) === bestPoints.get(node) ? -1 : 1;
        level = Math.max(0, Math.min(MAX_DISTRESS, level));
      }
      return level;
    },

    /**
     * For a save: the outcome only. Main.js saves it once the encounter is
     * complete; an unfinished conversation starts over on load anyway.
     */
    snapshot() { return { outcome }; },

    restore(saved = {}) {
      answers.clear();
      outcome = OUTCOMES.includes(saved?.outcome) ? saved.outcome : null;
    },

    reset() {
      answers.clear();
      outcome = null;
    },
  };
}

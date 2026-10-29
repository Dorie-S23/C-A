/**
 * Scores the player's picks in a graded dialogue script: each choice
 * node's correct answer is its highest-`points` option, and every pick is
 * checked against it as it's made. Like dialogueEngine, it's kept free of
 * DOM/Three.js so it can be tested in Node (see test/_verify_dialogue.mjs).
 *
 * Feed it from DialogueUI's onChoice callback, which hands back the picked
 * option object itself; the tally looks up which choice that option
 * belongs to, so the caller never has to track where in the script it is.
 *
 * maxPoints assumes every path passes through every choice node once,
 * as the Level 1 script does (each branch rejoins the main line).
 *
 * @param {Array} script see src/data/dialogues.js for node shapes
 */
export function createChoiceTally(script) {
  const choiceOf = new Map(); // option object -> the choice node offering it
  const bestPoints = new Map(); // choice node -> points of its correct answer
  for (const node of script) {
    if (node.type !== 'choice') continue;
    bestPoints.set(node, Math.max(...node.options.map(pointsOf)));
    for (const option of node.options) choiceOf.set(option, node);
  }
  const maxPoints = [...bestPoints.values()].reduce((sum, p) => sum + p, 0);

  let points = 0;
  let correct = 0;
  let answered = 0;

  return {
    /**
     * Records one pick. Returns whether it was the correct answer, or null
     * for an option that isn't from this script (nothing is counted).
     */
    record(option) {
      const node = choiceOf.get(option);
      if (!node) return null;
      answered++;
      points += pointsOf(option);
      const isCorrect = pointsOf(option) === bestPoints.get(node);
      if (isCorrect) correct++;
      return isCorrect;
    },
    get points() {
      return points;
    },
    get correct() {
      return correct;
    },
    get answered() {
      return answered;
    },
    maxPoints,
    totalChoices: bestPoints.size,
  };
}

function pointsOf(option) {
  return option.points ?? 0;
}

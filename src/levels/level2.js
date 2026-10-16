/**
 * Level 2, "Missing Pieces" — the mission wrapper around Kaufmo's hallway
 * scene. Chained straight from Level 1 (see level1.js's onComplete) rather
 * than offering its own standalone start: Kaufmo's "hurries past,
 * mumbling" beat is written to happen the instant Pomni steps out of
 * Ribbit's door, not from a cold start.
 *
 * The scene itself — level2Opening, Kaufmo's hallway cutscene, the photo
 * hunt, hand-ins and payoff — is already fully built and self-contained
 * (see kaufmoRoom.js and state/level2Items.js), so this mission only owns
 * the entry: playing the opening and marking Find Kaufmo done once Pomni's
 * actually caught up with him. The item hunt afterward stays free
 * exploration rather than anything scripted here — three scattered photos
 * play better as "go look around" than a staged sequence.
 *
 * @param {object} game the mission API from main.js (see `missionApi`)
 * @param {{ objectives?: ReturnType<typeof import('../game/objectives.js').createObjectiveController> }} [deps]
 */
export function runLevel2(game, { objectives } = {}) {
  game.playDialogue('level2Opening', {
    onComplete: () => objectives?.complete('find-kaufmo'),
  });
}

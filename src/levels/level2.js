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
 * the entry: playing the opening in two parts around a real room
 * transition, and marking Find Kaufmo done once it's finished. The item
 * hunt afterward stays free exploration rather than anything scripted
 * here — three photos round one room play better as "go look around"
 * than a staged sequence.
 *
 * The script's second half ("Pomni catches up. Kaufmo is pacing") is
 * written as if she's now with him in his room — it previously just
 * said so in text while she stood still in the Dorm Hall, so the
 * conversation would carry on in the wrong place the moment it resumed.
 * Travelling into his room for real between the two halves (same
 * stopAt/startAt-around-a-room-change shape level1.js uses for Ribbit's
 * door) fixes that properly instead of trying to fake a chase on foot.
 *
 * @param {object} game the mission API from main.js (see `missionApi`)
 * @param {{ objectives?: ReturnType<typeof import('../game/objectives.js').createObjectiveController> }} [deps]
 */
export function runLevel2(game, { objectives } = {}) {
  game.playDialogue('level2Opening', {
    stopAt: INSIDE,
    onComplete: async () => {
      await game.travel('kaufmo');
      game.playDialogue('level2Opening', {
        startAt: INSIDE,
        onComplete: () => objectives?.complete('find-kaufmo'),
      });
    },
  });
}

const INSIDE = 'l2_inside'; // the script's first beat with Kaufmo actually in frame

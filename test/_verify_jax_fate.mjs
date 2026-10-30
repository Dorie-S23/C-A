// Jax's Fate (src/state/jaxFate.js), the Face to Face script it scores
// (level3JaxFinalDialogue), and the ending resolver (src/game/endings.js):
// every path through the five graded choices, where the fate is decided,
// that too many bad choices abstract him and that the result routes to
// the right ending. No DOM/WebGL; main.js's faceToFace() wiring is the
// same calls these make.
// Run: node --test test/_verify_jax_fate.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDialogueEngine } from '../src/dialogue/dialogueEngine.js';
import { SPEAKERS, level3JaxFinalDialogue, endingBittersweetDialogue } from '../src/data/dialogues.js';
import { SPRITES, MOODS } from '../src/ui/portraitSprites.js';
import {
  createJaxFate, JAX_FATE_CHOICES, JAX_SAVE_MARK, KEEPSAKE_BONUS, START_DISTRESS,
} from '../src/state/jaxFate.js';
import { resolveEnding } from '../src/game/endings.js';
import { MAZE_FINDABLES } from '../src/state/mazeItems.js';

const choices = level3JaxFinalDialogue.filter((node) => node.type === 'choice');
const best = (choice) => choice.options.find((option) => option.points === 1);
const poor = (choice, which = 0) => choice.options.filter((option) => !option.points)[which];

/**
 * Plays the script as DialogueUI would with main.js's faceToFace(): picks
 * from `picks` (one option index per choice), records each in `fate`,
 * and decides at the 'jaxFate' beat. Returns the ids of every node seen.
 */
function play(picks, fate, keepsakes) {
  const engine = createDialogueEngine(level3JaxFinalDialogue);
  const seen = [];
  let choice = 0;
  for (let guard = 0; !engine.done; guard++) {
    if (guard > 500) throw new Error('dialogue does not terminate');
    const node = engine.current;
    seen.push(node);
    if (node.type === 'choice') {
      const option = engine.choose(picks[choice++]);
      fate?.record(option);
    } else if (node.id === 'jaxFate' && fate) {
      engine.jump(fate.decide(keepsakes) === 'saved' ? 'jaxSaved' : 'jaxBreaks');
    } else {
      engine.advance();
    }
  }
  return seen;
}

/** Every combination of option indexes across the choices. */
function allPicks() {
  let paths = [[]];
  for (const choice of choices) {
    paths = paths.flatMap((path) => choice.options.map((_, i) => [...path, i]));
  }
  return paths;
}

test('five graded choices, each with exactly one best answer worth a point', () => {
  assert.equal(JAX_FATE_CHOICES, 5);
  for (const choice of choices) {
    assert.ok(choice.id, 'choices carry ids so an interrupted conversation resumes on them');
    assert.equal(choice.options.filter((option) => option.points === 1).length, 1);
    assert.ok(choice.options.every((option) => (option.points ?? 0) >= 0), 'no instant-fail options here');
    assert.ok(choice.options.every((option) => option.text?.trim()));
  }
});

test('every path answers all five choices and reaches the fate beat; without a decision it ends saved', () => {
  const paths = allPicks();
  assert.equal(paths.length, 3 ** 5);
  for (const picks of paths) {
    const seen = play(picks);
    assert.equal(seen.filter((node) => node.type === 'choice').length, 5);
    const ids = seen.map((node) => node.id);
    assert.ok(ids.includes('jaxFate'));
    assert.ok(ids.includes('jaxSaved'));
    assert.ok(!ids.includes('jaxBreaks') && !ids.includes('jaxAbstracts'));
  }
});

test('every node on every path has a known speaker, a side, text and a recognized mood', () => {
  const seen = new Set();
  for (const picks of allPicks()) {
    for (const node of play(picks, createJaxFate(), 0)) seen.add(node);
    for (const node of play(picks, createJaxFate(), MAZE_FINDABLES.length)) seen.add(node);
  }
  for (const node of [...seen, ...endingBittersweetDialogue]) {
    if (node.type === 'choice') continue;
    assert.ok(node.text?.trim(), 'text');
    if (node.type !== 'line') continue;
    assert.ok(SPEAKERS[node.speaker], `speaker ${node.speaker}`);
    assert.ok(node.side === 'left' || node.side === 'right');
    if (SPRITES[node.speaker]) assert.ok(MOODS.includes(node.mood), `mood on "${node.text.slice(0, 30)}"`);
  }
  // Both endings of the conversation are reachable.
  const ids = new Set([...seen].map((node) => node.id));
  for (const id of ['jaxSaved', 'jaxBreaks', 'jaxAbstracts']) assert.ok(ids.has(id), id);
});

test('too many bad choices abstract him: the save mark with and without the keepsakes', () => {
  const keepsakes = MAZE_FINDABLES.length;
  for (const held of [0, 1, keepsakes]) {
    const needed = Math.max(0, JAX_SAVE_MARK - held * KEEPSAKE_BONUS);
    for (const picks of allPicks()) {
      const fate = createJaxFate();
      const seen = play(picks, fate, held);
      const good = picks.filter((pick, i) => choices[i].options[pick].points === 1).length;
      const saved = good >= needed;
      assert.equal(fate.outcome, saved ? 'saved' : 'abstracted', `held ${held}, ${good} good`);
      const ids = seen.map((node) => node.id);
      assert.equal(ids.includes('jaxAbstracts'), !saved);
      assert.equal(ids.includes('jaxSaved'), saved);
      assert.equal(ids.at(-1), saved ? 'jf_saved_thanks' : 'jf_gone_sorry');
    }
  }
  // As the maze stands (both keepsakes required to reach him): two good
  // answers save him, four or five bad ones lose him.
  const fate = createJaxFate();
  choices.forEach((choice, i) => fate.record(i < 2 ? best(choice) : poor(choice)));
  assert.equal(fate.decide(keepsakes), 'saved');
  const lost = createJaxFate();
  choices.forEach((choice, i) => lost.record(i < 1 ? best(choice) : poor(choice, i % 2)));
  assert.equal(lost.decide(keepsakes), 'abstracted');
  // Items alone don't save him.
  const itemsOnly = createJaxFate();
  choices.forEach((choice) => itemsOnly.record(poor(choice)));
  assert.equal(itemsOnly.decide(keepsakes), 'abstracted');
});

test('answers are set per choice, the outcome latches, and foreign options are ignored', () => {
  const fate = createJaxFate();
  assert.equal(fate.record({ text: 'not from this script', points: 1 }), null);
  assert.equal(fate.record(best(choices[0])), true);
  assert.equal(fate.record(best(choices[0])), true);
  assert.equal(fate.points(), 1, 'a repeated answer after a resume does not stack');
  assert.equal(fate.record(poor(choices[0])), false);
  assert.equal(fate.points(), 0, 'answering again replaces the old answer');
  assert.equal(fate.points(2), 2 * KEEPSAKE_BONUS);

  assert.equal(fate.decide(0), 'abstracted');
  assert.equal(fate.record(best(choices[1])), null, 'nothing changes once decided');
  assert.equal(fate.decide(MAZE_FINDABLES.length), 'abstracted', 'decided once');
});

test('his distress steps with each answer and settles with the outcome', () => {
  const fate = createJaxFate();
  assert.equal(fate.distress, START_DISTRESS);
  fate.record(poor(choices[0]));
  assert.equal(fate.distress, START_DISTRESS + 1);
  fate.record(poor(choices[1]));
  assert.equal(fate.distress, 3, 'never past 3');
  fate.record(best(choices[2]));
  fate.record(best(choices[3]));
  fate.record(best(choices[4]));
  assert.equal(fate.distress, 0);
  assert.equal(fate.decide(2), 'saved');
  assert.equal(fate.distress, 0);

  const lost = createJaxFate();
  lost.record(best(choices[0]));
  assert.equal(lost.distress, START_DISTRESS - 1);
  lost.decide(0);
  assert.equal(lost.distress, 3);
});

test('a save keeps only a valid outcome; reset starts over', () => {
  const fate = createJaxFate();
  choices.forEach((choice) => fate.record(poor(choice)));
  fate.decide(2);
  const saved = JSON.parse(JSON.stringify(fate.snapshot()));
  assert.deepEqual(saved, { outcome: 'abstracted' });

  const loaded = createJaxFate();
  loaded.restore(saved);
  assert.equal(loaded.outcome, 'abstracted');
  assert.equal(loaded.decide(0), 'abstracted');
  for (const bad of [undefined, null, {}, { outcome: 'maybe' }]) {
    loaded.restore(bad);
    assert.equal(loaded.outcome, null);
  }
  fate.reset();
  assert.equal(fate.outcome, null);
  assert.equal(fate.points(), 0);
  assert.equal(fate.distress, START_DISTRESS);
});

test('the two gates route every combination; Jax cannot make up for a missed Escape Threshold', () => {
  assert.equal(resolveEnding({ escaped: true, jaxSaved: true }), 'happy');
  assert.equal(resolveEnding({ escaped: true, jaxSaved: false }), 'bittersweet');
  assert.equal(resolveEnding({ escaped: false, jaxSaved: true }), 'noEscape');
  assert.equal(resolveEnding({ escaped: false, jaxSaved: false }), 'noEscape');
});

test('the bittersweet ending plays straight through, and Jax is not in it', () => {
  const engine = createDialogueEngine(endingBittersweetDialogue);
  let count = 0;
  while (!engine.done) {
    assert.notEqual(engine.current.speaker, 'jax');
    count++;
    engine.advance();
  }
  assert.equal(count, endingBittersweetDialogue.length);
});

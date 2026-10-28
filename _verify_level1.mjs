import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { runLevel1 } from './src/levels/level1.js';
import { createLevel1Attempt } from './src/state/level1Attempt.js';
import { level1RibbitDialogue } from './src/data/dialogues.js';
import { getLevelPoints, setLevelPoints, resetEscapeThreshold } from './src/state/escapeThreshold.js';
import { createObjectiveController } from './src/game/objectives.js';
import { createStoryProgress } from './src/game/storyProgress.js';
import { createCaineMemory } from './src/state/caineMemory.js';

const choices = level1RibbitDialogue.filter(n => n.type === 'choice');
const best = choices.map(n => n.options.find(o => o.points === 1));
const wrong = choices.map(n => n.options.find(o => o.points === 0));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture() {
  resetEscapeThreshold();
  setLevelPoints('level2', 2);
  const objectives = createObjectiveController();
  objectives.activate('find-ribbit');
  const progress = createStoryProgress({ objectives, isStorySession: () => true });
  let script, resolveCard;
  const cards = [], poses = [], distress = [];
  const memory = createCaineMemory({ storage: null });
  const hall = { group: new THREE.Group() };
  const room = { group: new THREE.Group(), ribbitScene: {
    door: { open() {}, close() {} }, points: {}, seatY: 1, shots: {},
    setPose: p => poses.push(p), setDistress: d => distress.push(d),
  } };
  const stage = new Proxy({}, { get: (_, key) => key === 'walkTo' || key === 'wait' ? async () => true : () => {} });
  const game = {
    session: 1, token: 1, stage,
    get memoryTicket() { return memory.revision; },
    rememberRetry: (level, ticket) => memory.recordRetry(level, ticket),
    isRoom: () => true,
    async travel(key) { this.token++; return key === 'dorm' ? hall : room; },
    playDialogue(key, callbacks) { script = callbacks; },
    cancelDialogue() { script.onCancel(); },
    showLevelComplete(title, subtitle, options) {
      cards.push({ title, subtitle, options });
      return new Promise(resolve => { resolveCard = resolve; });
    },
    showHint() {},
  };
  return { game, hall, objectives, progress, cards, poses, distress, memory,
    script: () => script, continue: () => resolveCard(true),
    start: () => runLevel1(game, { hall, story: true, onComplete: p => progress.finishRibbit(p) }),
  };
}

// Each choice's game-over option (D, -1) and the gameOver beat its branch ends on.
const quit = choices.map(n => n.options.find(o => o.points === -1));
const gameOverBeat = quit.map((option) => {
  let i = level1RibbitDialogue.findIndex(n => n.id === option.next);
  while (!level1RibbitDialogue[i].gameOver) i++;
  return level1RibbitDialogue[i];
});

test('0-point answers upset Ribbit but never fail; only a game-over pick does', () => {
  for (let path = 0; path < 81; path++) {
    const attempt = createLevel1Attempt();
    let expected = 1, points = 0;
    for (let i = 0; i < 4; i++) {
      const option = choices[i].options.filter(o => o.points >= 0)[Math.floor(path / 3 ** i) % 3];
      points += option.points;
      expected = Math.max(0, Math.min(2, expected + (option.points ? -1 : 1)));
      attempt.record(option);
      assert.equal(attempt.distress, expected);
      assert.equal(attempt.points, points);
    }
    assert.equal(attempt.failed, false);
    assert.equal(attempt.answered, 4);
  }
  const doomed = createLevel1Attempt();
  doomed.record(best[0]);
  doomed.record(quit[1]);
  assert.equal(doomed.distress, 3);
  assert.equal(doomed.failed, false); // not until its lines play out to the gameOver beat
  doomed.fail();
  assert.equal(doomed.failed, true);
  assert.equal(doomed.record(best[2]), null);
});

test('a game-over pick plays out, then fails with its own message; retry resets only Level 1, then a win carries points', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(best[0]);
  await f.script().onComplete(); // enter bedroom
  f.script().onChoice(quit[1]);
  assert.equal(f.cards.length, 0); // her line plays first
  f.script().onNode(gameOverBeat[1]);
  assert.equal(f.cards[0].title, 'Game Over');
  assert.equal(f.cards[0].subtitle, gameOverBeat[1].text);
  assert.equal(f.cards[0].options.buttonLabel, 'Retry Level');
  assert.equal(f.cards[0].options.chime, 'fail');
  assert.equal(f.cards[0].options.memoryRetry, 'level1');
  assert.equal(f.memory.snapshot().retries.level1, 0);
  assert.equal(getLevelPoints('level1'), 0);
  assert.equal(getLevelPoints('level2'), 2);
  assert.equal(f.progress.ribbitComplete, false);
  assert.equal(f.progress.hallwayPending, false);
  assert.equal(f.progress.finishHallway(), false);
  assert.equal(f.objectives.active.id, 'find-ribbit');
  assert.deepEqual(f.poses, []);
  assert.equal(f.distress.at(-1), 3);
  await f.script().onComplete(); // even a late completion cannot win
  assert.equal(f.cards.length, 1);
  f.continue();
  await flush();
  assert.equal(f.script().stopAt, 'l1_inside');
  assert.equal(f.memory.snapshot().retries.level1, 1);
  f.script().onChoice(wrong[0]); // a fresh attempt: a wrong answer doesn't fail
  assert.equal(f.cards.length, 1);
  await f.script().onComplete();
  for (let i = 1; i < 4; i++) f.script().onChoice(best[i]);
  await f.script().onNode({ action: 'ribbitSitsUp' });
  const completion = f.script().onComplete();
  await flush();
  assert.equal(f.cards[1].title, 'Level 1 Complete');
  assert.equal(f.progress.ribbitComplete, true);
  assert.equal(f.progress.hallwayPending, true);
  assert.equal(f.objectives.active.id, 'find-kaufmo');
  assert.deepEqual(f.poses, ['sitting']);
  assert.equal(getLevelPoints('level1'), 3);
  assert.equal(getLevelPoints('level2'), 2);
  f.continue();
  await completion;
});

test('a game over at the door stops before going inside', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(quit[0]);
  f.script().onNode(gameOverBeat[0]);
  assert.equal(f.cards[0].title, 'Game Over');
  assert.equal(f.cards[0].subtitle, gameOverBeat[0].text);
  const tokenBefore = f.game.token;
  await f.script().onComplete(); // must not travel into her room
  assert.equal(f.game.token, tokenBefore);
});

test('failure clears points already earned and repeated retries do not accumulate them', async () => {
  const f = fixture();
  await f.start();
  for (let retry = 0; retry < 2; retry++) {
    f.script().onChoice(best[0]);
    await f.script().onComplete();
    f.script().onChoice(best[1]);
    f.script().onChoice(best[2]);
    assert.equal(getLevelPoints('level1'), 3);
    f.script().onChoice(quit[3]);
    f.script().onNode(gameOverBeat[3]);
    assert.equal(getLevelPoints('level1'), 0);
    assert.equal(f.progress.ribbitComplete, false);
    assert.equal(f.progress.hallwayPending, false);
    assert.equal(f.progress.finishHallway(), false);
    f.continue();
    await flush();
  }
  assert.equal(getLevelPoints('level2'), 2);
  assert.equal(f.memory.snapshot().retries.level1, 2);
});

test('leaving a failed session invalidates its pending retry', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(best[0]);
  await f.script().onComplete();
  f.script().onChoice(quit[1]);
  f.script().onNode(gameOverBeat[1]);
  const token = f.game.token;
  f.game.session++;
  f.continue();
  await flush();
  assert.equal(f.game.token, token);
  assert.equal(f.memory.snapshot().retries.level1, 0);
  assert.equal(f.progress.ribbitComplete, false);
  assert.equal(f.progress.hallwayPending, false);
  assert.equal(f.progress.finishHallway(), false);
});

test('clearing memory while a Level 1 retry is pending prevents stale history from returning', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(quit[0]);
  f.script().onNode(gameOverBeat[0]);
  f.memory.clear();
  f.continue();
  await flush();
  assert.equal(f.script().stopAt, 'l1_inside');
  assert.equal(f.memory.snapshot().retries.level1, 0);
});

test('cancelling a retry cannot restore points from an older attempt', async () => {
  const f = fixture();
  setLevelPoints('level1', 4);
  await f.start();
  f.script().onChoice(best[0]);
  await f.script().onComplete();
  f.script().onChoice(quit[1]);
  f.script().onNode(gameOverBeat[1]);
  f.continue();
  await flush();
  f.script().onChoice(best[0]);
  f.script().onCancel();
  assert.equal(getLevelPoints('level1'), 0);
  assert.equal(getLevelPoints('level2'), 2);
});

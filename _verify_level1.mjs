import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { runLevel1 } from './src/levels/level1.js';
import { createLevel1Attempt } from './src/state/level1Attempt.js';
import { level1RibbitDialogue } from './src/data/dialogues.js';
import { getLevelPoints, setLevelPoints, resetEscapeThreshold } from './src/state/escapeThreshold.js';
import { createObjectiveController } from './src/game/objectives.js';
import { createStoryProgress } from './src/game/storyProgress.js';

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
  const hall = { group: new THREE.Group() };
  const room = { group: new THREE.Group(), ribbitScene: {
    door: { open() {}, close() {} }, points: {}, seatY: 1, shots: {},
    setPose: p => poses.push(p), setDistress: d => distress.push(d),
  } };
  const stage = new Proxy({}, { get: (_, key) => key === 'walkTo' || key === 'wait' ? async () => true : () => {} });
  const game = {
    session: 1, token: 1, stage,
    isRoom: () => true,
    async travel(key) { this.token++; return key === 'dorm' ? hall : room; },
    playDialogue(key, callbacks) { script = callbacks; },
    cancelDialogue() { script.onCancel(); },
    showLevelComplete(title, subtitle, options) {
      cards.push({ title, options });
      return new Promise(resolve => { resolveCard = resolve; });
    },
    showHint() {},
  };
  return { game, hall, objectives, progress, cards, poses, distress,
    script: () => script, continue: () => resolveCard(true),
    start: () => runLevel1(game, { hall, story: true, onComplete: p => progress.finishRibbit(p) }),
  };
}

test('all 81 answer combinations obey the first threshold crossing, not final points', () => {
  let wins = 0, losses = 0;
  for (let path = 0; path < 81; path++) {
    const attempt = createLevel1Attempt();
    let expected = 1, points = 0;
    for (let i = 0; i < 4; i++) {
      const option = choices[i].options[Math.floor(path / 3 ** i) % 3];
      points += option.points;
      expected = Math.max(0, expected + (option.points ? -1 : 1));
      attempt.record(option);
      assert.equal(attempt.distress, expected);
      assert.equal(attempt.points, points);
      if (expected === 3) {
        assert.equal(attempt.failed, true);
        assert.equal(attempt.record(best[i]), null);
        assert.equal(attempt.distress, 3);
        losses++;
        break;
      }
    }
    if (!attempt.failed) { assert.equal(attempt.answered, 4); wins++; }
  }
  assert.equal(wins + losses, 81);
  assert.equal(wins, 29);
  assert.equal(losses, 52);
});

test('immediate failure blocks recovery/completion, retry resets only Level 1, then win carries points', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(wrong[0]); // 1 -> 2
  await f.script().onComplete(); // enter bedroom
  f.script().onChoice(wrong[1]); // 2 -> 3, synchronous failure
  assert.equal(f.cards[0].title, 'Level 1 Failed');
  assert.equal(f.cards[0].options.buttonLabel, 'Retry Level');
  assert.equal(f.cards[0].options.chime, 'fail');
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
  f.script().onChoice(wrong[0]); // fresh distress 1 -> 2, does not fail
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

test('failure clears points already earned and repeated retries do not accumulate them', async () => {
  const f = fixture();
  await f.start();
  for (let retry = 0; retry < 2; retry++) {
    f.script().onChoice(best[0]); // distress 0, point 1
    await f.script().onComplete();
    f.script().onChoice(wrong[1]);
    f.script().onChoice(wrong[2]);
    assert.equal(getLevelPoints('level1'), 1);
    f.script().onChoice(wrong[3]); // distress 3 at final choice
    assert.equal(getLevelPoints('level1'), 0);
    assert.equal(f.progress.ribbitComplete, false);
  assert.equal(f.progress.hallwayPending, false);
  assert.equal(f.progress.finishHallway(), false);
    f.continue();
    await flush();
  }
  assert.equal(getLevelPoints('level2'), 2);
});

test('leaving a failed session invalidates its pending retry', async () => {
  const f = fixture();
  await f.start();
  f.script().onChoice(wrong[0]);
  await f.script().onComplete();
  f.script().onChoice(wrong[1]);
  const token = f.game.token;
  f.game.session++;
  f.continue();
  await flush();
  assert.equal(f.game.token, token);
  assert.equal(f.progress.ribbitComplete, false);
  assert.equal(f.progress.hallwayPending, false);
  assert.equal(f.progress.finishHallway(), false);
});


test('cancelling a retry cannot restore points from an older attempt', async () => {
  const f = fixture();
  setLevelPoints('level1', 4);
  await f.start();
  f.script().onChoice(wrong[0]);
  await f.script().onComplete();
  f.script().onChoice(wrong[1]);
  f.continue();
  await flush();
  f.script().onChoice(best[0]);
  f.script().onCancel();
  assert.equal(getLevelPoints('level1'), 0);
  assert.equal(getLevelPoints('level2'), 2);
});

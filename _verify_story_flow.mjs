import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObjectiveController } from './src/game/objectives.js';
import { createStoryProgress } from './src/game/storyProgress.js';
import { runLevel2 } from './src/levels/level2.js';

function fixture() {
  const objectives = createObjectiveController();
  let story = true;
  const progress = createStoryProgress({ objectives, isStorySession: () => story });
  return { objectives, progress, preview: () => { story = false; } };
}

test('Caine → Ribbit → hallway → Kaufmo → photos advances once and survives revisits', () => {
  const { objectives, progress } = fixture();
  assert.equal(progress.finishRibbit(4), false);
  assert.equal(progress.finishKaufmoIntro(), false);
  objectives.activate('find-ribbit');
  assert.equal(progress.finishRibbit(3), true);
  assert.equal(objectives.active.id, 'find-kaufmo');
  assert.equal(progress.ribbitPoints, 3);
  assert.equal(progress.hallwayPending, true);
  assert.equal(progress.finishRibbit(0), false);
  assert.equal(progress.ribbitPoints, 3);
  assert.equal(progress.finishHallway(), true);
  assert.equal(progress.finishHallway(), false);
  assert.equal(progress.hallwayPending, false);
  assert.equal(progress.finishKaufmoIntro(), true);
  assert.equal(objectives.active.id, 'collect-photos');
  assert.equal(progress.finishKaufmoIntro(), false);
  progress.presentedPhotos(2);
  assert.equal(objectives.active.id, 'collect-photos');
  progress.presentedPhotos(3);
  assert.equal(objectives.active.id, 'check-kaufmo');
  progress.presentedPhotos(3);
  assert.equal(objectives.active.id, 'check-kaufmo');
});

test('poor Ribbit choices still advance, and previews cannot award story milestones', () => {
  const { objectives, progress, preview } = fixture();
  objectives.activate('find-ribbit');
  assert.equal(progress.finishRibbit(0), true);
  assert.equal(progress.ribbitComplete, true);
  assert.equal(progress.ribbitPoints, 0);
  preview();
  assert.equal(progress.finishKaufmoIntro(), false);
  assert.equal(progress.ribbitComplete, false);
  assert.equal(progress.hallwayPending, false);
});

test('new run clears completed encounters and Kaufmo introduction eligibility', () => {
  const { objectives, progress } = fixture();
  objectives.activate('find-ribbit'); progress.finishRibbit(4); progress.finishKaufmoIntro();
  objectives.reset(); progress.reset();
  assert.equal(progress.ribbitComplete, false);
  assert.equal(progress.ribbitPoints, null);
  assert.equal(progress.hallwayPending, false);
  assert.equal(progress.kaufmoIntroduced, false);
  assert.equal(progress.finishKaufmoIntro(), false);
});

function missionFixture() {
  const calls = [], room = {};
  let resolveTravel;
  const game = {
    session: 1, token: 1,
    playDialogue(key, options) { calls.push({ key, options }); return true; },
    travel() { return new Promise(resolve => { resolveTravel = resolve; }); },
    isRoom: candidate => candidate === room,
    showHint() {},
  };
  return { game, calls, arrive() { game.token++; resolveTravel(room); } };
}

test('Kaufmo introduction waits for real travel and awards its milestone only on completion', async () => {
  const { game, calls, arrive } = missionFixture();
  let hallway = 0, introduced = 0;
  runLevel2(game, { onHallway: () => hallway++, onIntroduced: () => introduced++ });
  assert.equal(calls[0].key, 'level2Hallway');
  const pending = calls[0].options.onComplete();
  assert.equal(hallway, 1);
  assert.equal(calls.length, 1);
  arrive(); await pending;
  assert.equal(calls[1].key, 'level2RoomOpening');
  calls[1].options.onCancel();
  assert.equal(introduced, 0);
  calls[1].options.onComplete();
  assert.equal(introduced, 1);
});

test('leaving a session during Kaufmo travel cannot resurrect the old introduction', async () => {
  const { game, calls, arrive } = missionFixture();
  runLevel2(game);
  const pending = calls[0].options.onComplete();
  game.session++;
  arrive(); await pending;
  assert.equal(calls.length, 1);
});

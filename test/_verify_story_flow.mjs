import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObjectiveController } from '../src/game/objectives.js';
import { createStoryProgress } from '../src/game/storyProgress.js';

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
  progress.presentedPhotos(3);
  assert.equal(objectives.active.id, 'collect-photos');
  progress.presentedPhotos(4);
  assert.equal(objectives.active.id, 'check-kaufmo');
  progress.presentedPhotos(5);
  assert.equal(objectives.active.id, 'check-kaufmo');
});

test('surviving lower-score completion advances, and previews cannot award story milestones', () => {
  const { objectives, progress, preview } = fixture();
  objectives.activate('find-ribbit');
  assert.equal(progress.finishRibbit(2), true);
  assert.equal(progress.ribbitComplete, true);
  assert.equal(progress.ribbitPoints, 2);
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

// Real-hall geometry/animation checks: test/_verify_kaufmo_hallway.mjs.
// Browser win/failure/cancellation checks: tools/verify_level1_browser.mjs.

test('Kaufmo pass-by is unavailable before a win and can be claimed only once', () => {
  const { objectives, progress } = fixture();
  objectives.activate('find-ribbit');
  assert.equal(progress.hallwayPending, false);
  assert.equal(progress.finishHallway(), false);
  assert.equal(objectives.active.id, 'find-ribbit');
  assert.equal(progress.finishRibbit(2), true);
  assert.equal(progress.finishHallway(), true);
  assert.equal(progress.finishHallway(), false);
  assert.equal(objectives.active.id, 'find-kaufmo');
  assert.equal(progress.ribbitPoints, 2);
});

// The scenes themselves (the hall, Jax's corner, the door search): tools/verify_jax_chase_browser.mjs.
test('Level 2 hand-in → find Jax → follow him → the maze door, each step once and in order', () => {
  const { objectives, progress } = fixture();
  objectives.activate('find-ribbit'); progress.finishRibbit(4); progress.finishKaufmoIntro();
  assert.equal(progress.finishLevel2(), false, 'not before the photos are in');
  assert.equal(progress.sawJaxBolt(), false);
  assert.equal(progress.caughtUpWithJax(), false);
  progress.presentedPhotos(4);
  assert.equal(progress.findingJax, false);
  assert.equal(progress.finishLevel2(), true);
  assert.equal(objectives.active.id, 'find-jax');
  assert.equal(progress.findingJax, true);
  assert.equal(progress.chasingJax, false);
  assert.equal(progress.finishLevel2(), false);
  assert.equal(progress.caughtUpWithJax(), false, 'the Lobby talk waits for the hall scene');
  assert.equal(progress.sawJaxBolt(), true);
  assert.equal(objectives.active.id, 'follow-jax');
  assert.equal(progress.findingJax, false);
  assert.equal(progress.chasingJax, true);
  assert.equal(progress.mazeOpen, false);
  assert.equal(progress.sawJaxBolt(), false);
  assert.equal(progress.enteredMaze(), false, 'the maze waits for the Lobby talk');
  assert.equal(progress.caughtUpWithJax(), true);
  assert.equal(objectives.active.id, 'enter-maze');
  assert.equal(progress.chasingJax, false);
  assert.equal(progress.mazeOpen, true);
  assert.equal(progress.caughtUpWithJax(), false);
  assert.equal(progress.enteredMaze(), true);
  assert.equal(objectives.active, null);
  assert.equal(progress.mazeOpen, true, 'the maze door stays open once used');
  assert.equal(progress.enteredMaze(), false);
});

test('a save before the hall scene restores it, and previews never start it', () => {
  const { objectives, progress, preview } = fixture();
  objectives.activate('find-ribbit'); progress.finishRibbit(4); progress.finishKaufmoIntro();
  progress.presentedPhotos(5); progress.finishLevel2();
  const saved = objectives.snapshot();
  const restored = fixture();
  restored.objectives.restore(saved);
  assert.equal(restored.progress.findingJax, true);
  assert.equal(restored.progress.sawJaxBolt(), true);
  assert.equal(restored.progress.chasingJax, true, 'and on from there to the Lobby');
  preview();
  assert.equal(progress.findingJax, false);
  assert.equal(progress.sawJaxBolt(), false);
  assert.equal(progress.caughtUpWithJax(), false);
  assert.equal(objectives.active.id, 'find-jax');
});

test('Level 2 restarts from Kaufmo hurrying past, keeping Ribbit and her points', () => {
  const { objectives, progress } = fixture();
  assert.equal(progress.restartLevel2(), false, 'nothing to restart before Ribbit is done');
  objectives.activate('find-ribbit');
  progress.finishRibbit(3);
  progress.finishHallway();
  progress.finishKaufmoIntro();
  assert.equal(objectives.active.id, 'collect-photos');
  assert.equal(progress.restartLevel2(), true);
  assert.equal(objectives.active.id, 'find-kaufmo');
  assert.equal(objectives.isComplete('find-ribbit'), true);
  assert.equal(objectives.isComplete('find-kaufmo'), false);
  assert.equal(progress.ribbitPoints, 3);
  assert.equal(progress.kaufmoIntroduced, false);
  assert.equal(progress.hallwayPending, true, 'the hallway pass-by plays again');
  assert.equal(progress.finishHallway(), true);
  assert.equal(progress.finishKaufmoIntro(), true);
  assert.equal(objectives.active.id, 'collect-photos');
});

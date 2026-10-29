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

test('leaving the maze records Level 3 and its ending variant once, through saves and new runs', () => {
  const { progress, preview } = fixture();
  assert.equal(progress.level3Complete, false);
  assert.equal(progress.ending, null);
  assert.equal(progress.finishLevel3('escaped'), false);
  assert.equal(progress.finishLevel3('saved'), true);
  assert.equal(progress.level3Complete, true);
  assert.equal(progress.finishLevel3('abstracted'), false);
  assert.equal(progress.ending, 'saved');

  const saved = JSON.parse(JSON.stringify(progress.snapshot()));
  progress.reset();
  assert.equal(progress.level3Complete, false);
  progress.restore(saved);
  assert.equal(progress.ending, 'saved');
  progress.restore({});
  assert.equal(progress.level3Complete, false, 'saves from before Level 3 had an ending load without one');
  progress.restore({ ending: 'bogus' });
  assert.equal(progress.ending, null);

  preview();
  assert.equal(progress.finishLevel3('abstracted'), false, 'the raw maze review never records story progress');
});

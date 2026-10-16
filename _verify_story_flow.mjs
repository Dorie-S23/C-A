import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObjectiveController } from './src/game/objectives.js';
import { createStoryProgress } from './src/game/storyProgress.js';

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

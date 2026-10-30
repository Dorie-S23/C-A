import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObjectiveController } from '../src/game/objectives.js';
import { createStoryProgress, wayOutVariantForJaxFate } from '../src/game/storyProgress.js';
import { parseSaveFile, saveFileContents } from '../src/game/saveGame.js';

function fixture() {
  const objectives = createObjectiveController();
  let storySession = true;
  const story = createStoryProgress({ objectives, isStorySession: () => storySession });
  return { objectives, story, preview: () => { storySession = false; } };
}

test('Jax fate explicitly selects saved or bittersweet, never visibility', () => {
  assert.equal(wayOutVariantForJaxFate('saved'), 'saved');
  assert.equal(wayOutVariantForJaxFate('abstracted'), 'bittersweet');
  assert.equal(wayOutVariantForJaxFate('visible'), null);
  assert.equal(wayOutVariantForJaxFate(null), null);

  const saved = fixture();
  assert.equal(saved.story.finishLevel3('saved'), true);
  assert.equal(saved.story.level3Complete, true);
  assert.equal(saved.story.jaxFate, 'saved');
  assert.equal(saved.story.endingVariant, 'saved');

  const abstracted = fixture();
  assert.equal(abstracted.story.finishLevel3('abstracted'), true);
  assert.equal(abstracted.story.endingVariant, 'bittersweet');
});

test('Level 3 completion is idempotent and previews cannot award it', () => {
  const { story } = fixture();
  assert.equal(story.finishLevel3('unknown'), false);
  assert.equal(story.finishLevel3('saved'), true);
  const snapshot = story.snapshot();
  assert.equal(story.finishLevel3('abstracted'), false);
  assert.deepEqual(story.snapshot(), snapshot, 'a duplicate exit cannot change Jax’s fate');

  const preview = fixture();
  preview.preview();
  assert.equal(preview.story.finishLevel3('saved'), false);
  assert.equal(preview.story.level3Complete, false);
});

test('ending state survives JSON and save-file restoration', () => {
  const original = fixture();
  original.story.finishLevel3('abstracted');
  const checkpoint = {
    room: 'maze', objectives: original.objectives.snapshot(), story: original.story.snapshot(),
  };
  const restoredFile = parseSaveFile(saveFileContents(checkpoint));
  const restored = fixture();
  restored.objectives.restore(restoredFile.objectives);
  restored.story.restore(restoredFile.story);
  assert.equal(restored.story.level3Complete, true);
  assert.equal(restored.story.jaxFate, 'abstracted');
  assert.equal(restored.story.endingVariant, 'bittersweet');
  assert.deepEqual(restored.story.snapshot(), original.story.snapshot());
});

test('legacy story snapshots restore without an ending and reset clears fate', () => {
  const { story } = fixture();
  story.restore({ ribbitPoints: 4, hallwaySeen: true, kaufmoIntroduced: true });
  assert.equal(story.level3Complete, false);
  assert.equal(story.jaxFate, null);
  assert.equal(story.endingVariant, null);

  story.finishLevel3('saved');
  story.reset();
  assert.equal(story.level3Complete, false);
  assert.equal(story.jaxFate, null);
  assert.equal(story.endingVariant, null);
});

test('legacy completed-story saves restore the live abstracted ending route', () => {
  const { story } = fixture();
  story.restore({ level3Complete: true, jaxFate: 'abstracted' });
  assert.equal(story.level3Complete, true);
  assert.equal(story.ending, 'abstracted');
  assert.equal(story.jaxFate, 'abstracted');
  assert.equal(story.endingVariant, 'bittersweet');
});

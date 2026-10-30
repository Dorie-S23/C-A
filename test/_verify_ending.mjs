import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createObjectiveController } from '../src/game/objectives.js';
import { createStoryProgress, wayOutVariantForJaxFate } from '../src/game/storyProgress.js';
import { parseSaveFile, saveFileContents } from '../src/game/saveGame.js';
import { createWayOutEnding } from '../src/levels/wayOutEnding.js';

function fixture() {
  const objectives = createObjectiveController();
  let storySession = true;
  const story = createStoryProgress({ objectives, isStorySession: () => storySession });
  return { objectives, story, preview: () => { storySession = false; } };
}

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
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
    room: 'ending', objectives: original.objectives.snapshot(), story: original.story.snapshot(),
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

test('duplicate starts share one active sequence and cannot restart a completed one', async () => {
  const entrance = deferred();
  let plays = 0;
  let completions = 0;
  const controller = createWayOutEnding({
    variant: 'saved',
    play: () => { plays++; return entrance.promise; },
    onComplete: () => { completions++; },
  });
  const first = controller.start();
  assert.equal(await controller.start(), false);
  assert.equal(controller.diagnostics.starts, 1);
  await Promise.resolve();
  assert.equal(plays, 1);
  entrance.resolve(true);
  assert.equal(await first, true);
  assert.equal(completions, 1);
  assert.equal(controller.phase, 'complete');
  assert.equal(await controller.start(), false);
  assert.equal(plays, 1);
});

test('cancellation cleans up and suppresses stale animation, dialogue, audio and room-load callbacks', async () => {
  const entrance = deferred();
  const calls = [];
  let context;
  let cleaned = 0;
  const controller = createWayOutEnding({
    variant: 'bittersweet',
    play: value => { context = value; return entrance.promise; },
    update: () => calls.push('animation'),
    cleanup: () => { cleaned++; },
    onComplete: () => calls.push('complete'),
  });
  const starting = controller.start();
  await Promise.resolve();
  const callbacks = ['dialogue', 'audio', 'room-load'].map(name => context.guard(() => calls.push(name)));
  controller.update(1 / 60);
  assert.deepEqual(calls, ['animation']);
  assert.equal(controller.cancel(), true);
  controller.update(1 / 60);
  callbacks.forEach(callback => callback());
  entrance.resolve(true);
  assert.equal(await starting, false);
  assert.deepEqual(calls, ['animation']);
  assert.equal(cleaned, 1);
  assert.equal(controller.phase, 'cancelled');
  assert.equal(controller.cancel(), false);
});

test('cancelling before the first microtask prevents the performance from starting', async () => {
  let plays = 0;
  let cleaned = 0;
  const controller = createWayOutEnding({
    variant: 'saved',
    play: () => { plays++; },
    cleanup: () => { cleaned++; },
  });
  const starting = controller.start();
  controller.cancel();
  assert.equal(await starting, false);
  assert.equal(plays, 0);
  assert.equal(cleaned, 1);
});

test('a stale room token cannot complete an active ending', async () => {
  let live = true;
  let completions = 0;
  const controller = createWayOutEnding({
    variant: 'saved', isLive: () => live,
    play: () => true,
    onComplete: () => { completions++; },
  });
  const starting = controller.start();
  live = false;
  assert.equal(await starting, false);
  assert.equal(completions, 0);
  assert.equal(controller.phase, 'playing', 'room teardown remains responsible for cancellation');
  controller.cancel();
});

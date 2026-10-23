// Save/load: every piece of story state a checkpoint holds survives a
// round trip through JSON and a save slot, without WebGL or rooms.
// Run: node --test _verify_save.mjs
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createObjectiveController } from './src/game/objectives.js';
import { createStoryProgress } from './src/game/storyProgress.js';
import { createLevel2Items } from './src/state/level2Items.js';
import {
  getLevelPoints, resetEscapeThreshold, restoreEscapeThreshold, setLevelPoints, snapshotEscapeThreshold,
} from './src/state/escapeThreshold.js';
import { createSaveSlots, SAVE_VERSION, SLOT_COUNT } from './src/game/saveGame.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

function session() {
  const objectives = createObjectiveController();
  const story = createStoryProgress({ objectives, isStorySession: () => true });
  const items = createLevel2Items();
  return { objectives, story, items };
}

beforeEach(() => resetEscapeThreshold());

test('a mid-Level-2 checkpoint restores exactly into a fresh session', () => {
  const a = session();
  a.objectives.activate('find-caine');
  a.objectives.complete('find-caine');
  a.objectives.activate('find-ribbit');
  a.story.finishRibbit(3);
  a.story.finishKaufmoIntro();
  a.items.collect('ca1');
  a.items.collect('ca2');
  a.items.presentHeld();
  a.items.collect('ca3');
  setLevelPoints('level1', 3);

  const checkpoint = JSON.parse(JSON.stringify({
    objectives: a.objectives.snapshot(), story: a.story.snapshot(),
    items: a.items.snapshot(), escape: snapshotEscapeThreshold(),
  }));

  resetEscapeThreshold();
  const b = session();
  b.objectives.restore(checkpoint.objectives);
  b.story.restore(checkpoint.story);
  b.items.restore(checkpoint.items);
  restoreEscapeThreshold(checkpoint.escape);

  assert.equal(b.objectives.active?.id, 'collect-photos');
  assert.ok(b.objectives.isComplete('find-ribbit') && b.objectives.isComplete('find-kaufmo'));
  assert.equal(b.story.ribbitPoints, 3);
  assert.equal(b.story.kaufmoIntroduced, true);
  assert.equal(b.items.totalPresented(), 2);
  assert.equal(b.items.heldCount(), 1);
  assert.equal(getLevelPoints('level1'), 3);
  assert.equal(getLevelPoints('level2'), 2);
});

test('unknown objectives and levels in an old save are dropped, not fatal', () => {
  const objectives = createObjectiveController();
  objectives.restore({ active: 'no-such-objective', completed: ['find-caine', 'removed-one'] });
  assert.equal(objectives.active, null);
  assert.ok(objectives.isComplete('find-caine'));
  restoreEscapeThreshold({ level9: 4, level1: 2 });
  assert.equal(getLevelPoints('level1'), 2);
});

test('slots store, list, overwrite and reject other versions', () => {
  const storage = memoryStorage();
  const slots = createSaveSlots(storage);
  assert.equal(slots.list().length, SLOT_COUNT);
  assert.deepEqual(slots.list(), [null, null, null]);

  slots.write(2, { room: 'dorm', objectiveTitle: 'Find Ribbit' });
  const saved = slots.read(2);
  assert.equal(saved.version, SAVE_VERSION);
  assert.equal(saved.room, 'dorm');
  assert.ok(saved.savedAt);

  slots.write(2, { room: 'kaufmo' });
  assert.equal(slots.read(2).room, 'kaufmo');

  storage.setItem('tadc.save.3', JSON.stringify({ version: SAVE_VERSION + 1, room: 'dorm' }));
  assert.equal(slots.read(3).incompatible, true);
  storage.setItem('tadc.save.1', '{not json');
  assert.equal(slots.read(1), null);
});

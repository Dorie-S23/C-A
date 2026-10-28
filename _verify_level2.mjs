// KAN-44: exercise the same collection and Kaufmo interaction code as the
// game, without starting WebGL or loading rooms. Run: node --test _verify_level2.mjs
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createLevel2Items, pickKaufmoScript, PHOTO_COUNT, PHOTO_THRESHOLD } from './src/state/level2Items.js';
import {
  getEscapeTotal, getLevelPoints, resetEscapeThreshold, setLevelPoints,
} from './src/state/escapeThreshold.js';

const PICTURES = Array.from({ length: PHOTO_COUNT }, (_, i) => `ca${i + 1}`);

test('attempt placement data survives deliveries without retaining mutable scene positions', () => {
  const items = createLevel2Items();
  const source = [{ id: 'ca1', position: { x: 1, y: 2, z: 3 }, rotationY: 0.5 }];
  const layout = items.getPhotoLayout(() => source);
  source[0].position.x = 999;
  assert.equal(layout[0].position.x, 1);
  assert.ok(Object.isFrozen(layout[0].position));
  items.collect('ca1'); items.presentHeld();
  assert.equal(items.getPhotoLayout(() => assert.fail('Unexpected reroll')), layout);
  items.reset();
  assert.notDeepEqual(items.getPhotoLayout(() => source), layout);
});

beforeEach(() => resetEscapeThreshold());

test('no pictures: repeated Kaufmo conversations stay at zero points', () => {
  const items = createLevel2Items();
  assert.equal(pickKaufmoScript(), 'level2Opening');
  for (let visit = 0; visit < 3; visit++) {
    assert.equal(pickKaufmoScript(items), 'level2Opening');
    assert.equal(items.presentHeld(), 0);
  }
  assert.equal(items.heldCount(), 0);
  assert.equal(items.totalPresented(), 0);
  assert.equal(items.totalFound(), 0);
  assert.equal(getEscapeTotal(), 0);
});

test('pickups count each picture once and earn no points before hand-in', () => {
  const hints = [];
  const items = createLevel2Items({ onCollect: count => hints.push(count) });
  setLevelPoints('level1', 4);
  for (const id of PICTURES) {
    items.collect(id);
    items.collect(id);
    assert.equal(items.hasCollected(id), true);
    assert.equal(getLevelPoints('level2'), 0);
    assert.equal(getEscapeTotal(), 4);
  }
  assert.equal(items.heldCount(), PHOTO_COUNT);
  assert.equal(items.totalPresented(), 0);
  assert.equal(items.totalFound(), PHOTO_COUNT);
  assert.deepEqual(hints, PICTURES.map((_, i) => i + 1));
});

// What the photos she brings back decide (see pickKaufmoScript).
const outcome = (count) => (count >= PHOTO_THRESHOLD ? 'level2Return' : 'level2Abstraction');

for (let count = 1; count <= PHOTO_COUNT; count++) {
  test(`returning with ${count} picture(s) hands them all in at once and plays ${outcome(count)}`, () => {
    const items = createLevel2Items();
    setLevelPoints('level1', 3);
    for (const id of PICTURES.slice(0, count)) items.collect(id);

    assert.equal(pickKaufmoScript(items), outcome(count));
    assert.equal(items.heldCount(), 0);
    assert.equal(items.totalPresented(), count);
    assert.equal(getLevelPoints('level2'), count);
    assert.equal(getEscapeTotal(), 3 + count);

    // Revisits add nothing; after a success it's his "working on it" line.
    for (let visit = 0; visit < 2; visit++) {
      assert.equal(pickKaufmoScript(items), count >= PHOTO_THRESHOLD ? 'level2Complete' : 'level2Idle');
      assert.equal(items.presentHeld(), count);
      assert.equal(getLevelPoints('level2'), count);
    }
  });
}

test('the threshold is 4 of 5: 3 is too few, 4 is enough', () => {
  assert.equal(PHOTO_THRESHOLD, 4);
  assert.equal(outcome(3), 'level2Abstraction');
  assert.equal(outcome(4), 'level2Return');
});

test('a handed-in picture cannot be collected or scored again', () => {
  const hints = [];
  const items = createLevel2Items({ onCollect: count => hints.push(count) });
  items.collect('ca1');
  assert.equal(pickKaufmoScript(items), 'level2Abstraction');
  items.collect('ca1');
  assert.equal(items.hasCollected('ca1'), true);
  assert.equal(items.heldCount(), 0);
  assert.equal(items.totalFound(), 1);
  assert.equal(getLevelPoints('level2'), 1);
  assert.deepEqual(hints, [1]);
});

test('reset after an abstraction starts the search clean', () => {
  const items = createLevel2Items();
  setLevelPoints('level1', 4);
  items.collect('ca1');
  items.collect('ca2');
  assert.equal(pickKaufmoScript(items), 'level2Abstraction');
  items.reset();
  assert.equal(items.heldCount(), 0);
  assert.equal(items.totalPresented(), 0);
  assert.equal(items.totalFound(), 0);
  for (const id of PICTURES) assert.equal(items.hasCollected(id), false);
  assert.equal(getLevelPoints('level2'), 0);
  assert.equal(getLevelPoints('level1'), 4);
  assert.equal(pickKaufmoScript(items), 'level2Opening');
  for (const id of PICTURES.slice(0, 4)) items.collect(id);
  assert.equal(pickKaufmoScript(items), 'level2Return');
  assert.equal(getEscapeTotal(), 8);
});

test('the success scene is consumed once per run', () => {
  const items = createLevel2Items();
  for (let run = 0; run < 2; run++) {
    for (const id of PICTURES) items.collect(id);
    assert.equal(pickKaufmoScript(items), 'level2Return');
    assert.equal(items.isDone(), false);
    items.markDone();
    assert.equal(items.isDone(), true);
    assert.equal(pickKaufmoScript(items), 'level2Complete');
    resetEscapeThreshold();
    items.reset();
    assert.equal(items.isDone(), false);
    assert.equal(items.totalFound(), 0);
  }
});

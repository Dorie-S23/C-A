// KAN-44: exercise the same collection and Kaufmo interaction code as the
// game, without starting WebGL or loading rooms. Run: node --test _verify_level2.mjs
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createLevel2Items, pickKaufmoScript, PHOTO_COUNT } from './src/state/level2Items.js';
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

for (let count = 1; count <= PHOTO_COUNT; count++) {
  test(`handing in ${count} picture(s) scores exactly ${count}; revisits add nothing`, () => {
    const items = createLevel2Items();
    setLevelPoints('level1', 3);
    for (const id of PICTURES.slice(0, count)) items.collect(id);

    // This is the room's actual E-interaction decision, including immediate
    // hand-in and choosing the response for the cumulative presented total.
    assert.equal(pickKaufmoScript(items), `level2HandIn${count}`);
    assert.equal(items.heldCount(), 0);
    assert.equal(items.totalPresented(), count);
    assert.equal(items.totalFound(), count);
    assert.equal(getLevelPoints('level2'), count);
    assert.equal(getEscapeTotal(), 3 + count);

    const revisits = count === PHOTO_COUNT
      ? ['level2Complete', 'level2Payoff', 'level2Payoff']
      : ['level2Idle', 'level2Idle', 'level2Idle'];
    for (const script of revisits) {
      assert.equal(pickKaufmoScript(items), script);
      assert.equal(items.presentHeld(), count);
      assert.equal(getLevelPoints('level2'), count);
      assert.equal(getEscapeTotal(), 3 + count);
    }
  });
}

test('a handed-in picture cannot be collected or scored again', () => {
  const hints = [];
  const items = createLevel2Items({ onCollect: count => hints.push(count) });
  items.collect('ca1');
  assert.equal(pickKaufmoScript(items), 'level2HandIn1');
  items.collect('ca1');
  assert.equal(items.hasCollected('ca1'), true);
  assert.equal(items.heldCount(), 0);
  assert.equal(items.totalFound(), 1);
  assert.equal(pickKaufmoScript(items), 'level2Idle');
  assert.equal(getLevelPoints('level2'), 1);
  assert.deepEqual(hints, [1]);

  items.collect('ca2');
  assert.equal(items.totalFound(), 2); // one held plus one already handed in
  assert.equal(getLevelPoints('level2'), 1);
  assert.equal(pickKaufmoScript(items), 'level2HandIn2');
  assert.equal(getLevelPoints('level2'), 2);
  assert.deepEqual(hints, [1, 2]);
});

test('all pickup orders and hand-in batch sizes score the cumulative total', () => {
  // Exhaustively enumerating every order (PHOTO_COUNT! of them) stopped
  // being practical once this went from 3 pictures to 5 — a representative
  // spread (forward, reversed, a couple of shuffles) exercises the same
  // property (order doesn't matter, only running count does) without a
  // combinatorial blow-up.
  const reversed = [...PICTURES].reverse();
  const shuffled = (seed) => {
    const arr = [...PICTURES];
    let s = seed;
    const rand = () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const orders = [PICTURES, reversed, shuffled(7), shuffled(99)];
  const batches = [
    [PHOTO_COUNT],
    [1, PHOTO_COUNT - 1],
    [PHOTO_COUNT - 1, 1],
    PICTURES.map(() => 1),
    [2, PHOTO_COUNT - 2],
  ];
  for (const order of orders) {
    for (const batchSizes of batches) {
      resetEscapeThreshold();
      setLevelPoints('level1', 2);
      const items = createLevel2Items();
      let presented = 0;
      for (const size of batchSizes) {
        const context = `${order.join(',')}; batches ${batchSizes.join('+')}; presented ${presented}`;
        for (const id of order.slice(presented, presented + size)) items.collect(id);
        assert.equal(getLevelPoints('level2'), presented, context);
        assert.equal(items.totalFound(), presented + size, context);
        presented += size;
        assert.equal(pickKaufmoScript(items), `level2HandIn${presented}`, context);
        assert.equal(items.totalPresented(), presented, context);
        assert.equal(items.heldCount(), 0, context);
        assert.equal(items.totalFound(), presented, context);
        assert.equal(getLevelPoints('level2'), presented, context);
        assert.equal(getLevelPoints('level1'), 2, context);
        assert.equal(getEscapeTotal(), 2 + presented, context);
      }
    }
  }
});

test('reset clears both held and handed-in pictures and allows collecting them again', () => {
  const items = createLevel2Items();
  setLevelPoints('level1', 4);
  items.collect('ca1');
  pickKaufmoScript(items);
  items.collect('ca2');

  items.reset();
  assert.equal(items.heldCount(), 0);
  assert.equal(items.totalPresented(), 0);
  assert.equal(items.totalFound(), 0);
  for (const id of PICTURES) assert.equal(items.hasCollected(id), false);
  assert.equal(getLevelPoints('level2'), 0);
  assert.equal(getLevelPoints('level1'), 4);
  assert.equal(pickKaufmoScript(items), 'level2Opening');

  // Match the title screen's fresh-run path, which also clears Level 1.
  resetEscapeThreshold();
  items.reset();
  assert.equal(getEscapeTotal(), 0);
  for (const id of ['ca1', 'ca2']) items.collect(id);
  assert.equal(items.totalFound(), 2);
  assert.equal(getLevelPoints('level2'), 0);
  assert.equal(pickKaufmoScript(items), 'level2HandIn2');
  assert.equal(getEscapeTotal(), 2);
});

test('a fresh run restores the completion-then-payoff dialogue sequence', () => {
  const items = createLevel2Items();
  for (let run = 0; run < 2; run++) {
    for (const id of PICTURES) items.collect(id);
    assert.equal(pickKaufmoScript(items), `level2HandIn${PHOTO_COUNT}`);
    assert.equal(pickKaufmoScript(items), 'level2Complete');
    assert.equal(pickKaufmoScript(items), 'level2Payoff');
    assert.equal(getLevelPoints('level2'), PHOTO_COUNT);
    resetEscapeThreshold();
    items.reset();
    assert.equal(items.totalFound(), 0);
    assert.equal(getEscapeTotal(), 0);
  }
});

test('the Level 2 completion card remains consumed on replay until a new run', () => {
  const items = createLevel2Items();
  assert.equal(items.isDone(), false);
  for (const id of PICTURES) items.collect(id);
  pickKaufmoScript(items); pickKaufmoScript(items);
  assert.equal(pickKaufmoScript(items), 'level2Payoff');
  assert.equal(items.isDone(), false);
  items.markDone();
  assert.equal(pickKaufmoScript(items), 'level2Payoff');
  assert.equal(items.isDone(), true);
  items.reset();
  assert.equal(items.isDone(), false);
});

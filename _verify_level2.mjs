// KAN-44: exercise the same collection and Kaufmo interaction code as the
// game, without starting WebGL or loading rooms. Run: node --test _verify_level2.mjs
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createLevel2Items, pickKaufmoScript } from './src/state/level2Items.js';
import {
  getEscapeTotal, getLevelPoints, resetEscapeThreshold, setLevelPoints,
} from './src/state/escapeThreshold.js';

const PICTURES = ['ca1', 'ca2', 'ca3'];

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
  assert.equal(items.heldCount(), 3);
  assert.equal(items.totalPresented(), 0);
  assert.equal(items.totalFound(), 3);
  assert.deepEqual(hints, [1, 2, 3]);
});

for (const count of [1, 2, 3]) {
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

    const revisits = count === 3
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
  const orders = [
    ['ca1', 'ca2', 'ca3'], ['ca1', 'ca3', 'ca2'],
    ['ca2', 'ca1', 'ca3'], ['ca2', 'ca3', 'ca1'],
    ['ca3', 'ca1', 'ca2'], ['ca3', 'ca2', 'ca1'],
  ];
  for (const order of orders) {
    for (const batches of [[3], [1, 2], [2, 1], [1, 1, 1]]) {
      resetEscapeThreshold();
      setLevelPoints('level1', 2);
      const items = createLevel2Items();
      let presented = 0;
      for (const size of batches) {
        const context = `${order.join(',')}; batches ${batches.join('+')}; presented ${presented}`;
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
    assert.equal(pickKaufmoScript(items), 'level2HandIn3');
    assert.equal(pickKaufmoScript(items), 'level2Complete');
    assert.equal(pickKaufmoScript(items), 'level2Payoff');
    assert.equal(getLevelPoints('level2'), 3);
    resetEscapeThreshold();
    items.reset();
    assert.equal(items.totalFound(), 0);
    assert.equal(getEscapeTotal(), 0);
  }
});

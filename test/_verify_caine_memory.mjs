import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCaineMemory, CAINE_HISTORY_KEY, CAINE_ENABLED_KEY } from '../src/state/caineMemory.js';
import { createSaveSlots } from '../src/game/saveGame.js';

function storageFixture() {
  const entries = new Map();
  return { entries, getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
}

test('only explicit new runs count; new runs retain retry history and vary captions', () => {
  const storage = storageFixture(), memory = createCaineMemory({ storage });
  assert.equal(memory.enabled, true);
  assert.equal(memory.snapshot().runs, 0);
  assert.equal(storage.entries.size, 0);
  memory.beginRun();
  assert.match(memory.updateCaption(0, { playable: true }), /brand-new adventure/);
  assert.equal(memory.snapshot().runs, 1);
  memory.beginRun();
  assert.match(memory.updateCaption(0, { playable: true }), /another opening act/);
  memory.recordRetry('maze', memory.revision);
  memory.beginRun();
  assert.match(memory.updateCaption(0, { playable: true }), /rehearsals from last time/);
  assert.deepEqual(memory.snapshot().retries, { level1: 0, level2: 0, maze: 1 });
  const reopened = createCaineMemory({ storage });
  assert.equal(reopened.snapshot().runs, 3, 'Opening a page or loading history is not a new run');
});

test('pause joke is consumed once per run, not rearmed by caption cancellation or clear', () => {
  const memory = createCaineMemory({ storage: null });
  assert.match(memory.takePauseJoke(), /Escape.*pause button/);
  assert.equal(memory.takePauseJoke(), null);
  memory.cancelCaption(); // Home/save-load session teardown only cancels captions.
  memory.clear();
  assert.equal(memory.takePauseJoke(), null);
  memory.beginRun();
  assert.ok(memory.takePauseJoke());
  assert.equal(memory.takePauseJoke(), null);
});

test('reloading a checkpoint session cannot repeat a stored once-per-run joke', () => {
  const storage = storageFixture(), memory = createCaineMemory({ storage });
  memory.beginRun();
  assert.ok(memory.takePauseJoke());
  const reopened = createCaineMemory({ storage });
  assert.equal(reopened.takePauseJoke(), null);
  assert.equal(reopened.snapshot().runs, 1);
  reopened.beginRun();
  assert.ok(reopened.takePauseJoke());
  assert.equal(createCaineMemory({ storage }).takePauseJoke(), null);
});

test('new-run captions wait for playable frames, freeze while blocked, and expire once', () => {
  const memory = createCaineMemory({ storage: null });
  memory.beginRun();
  assert.equal(memory.updateCaption(999), null);
  assert.ok(memory.updateCaption(999, { playable: true }), 'First visible frame does not charge loading');
  assert.ok(memory.updateCaption(5, { playable: true }));
  assert.equal(memory.updateCaption(999, { playable: false }), null);
  assert.ok(memory.updateCaption(999, { playable: true }), 'First resumed frame does not charge pause');
  assert.equal(memory.updateCaption(1, { playable: true }), null);
  assert.equal(memory.updateCaption(0, { playable: true }), null);
  memory.beginRun(); memory.cancelCaption();
  assert.equal(memory.updateCaption(0, { playable: true }), null);
});

test('retry captions use independent whitelisted scene counts; previews never count', () => {
  const memory = createCaineMemory({ storage: null });
  for (const [level, text] of [['level1', 'Ribbit'], ['level2', 'photo search'], ['maze', 'maze']]) {
    assert.ok(memory.retryCaption(level).includes(text));
    assert.match(memory.retryCaption(level), /rehearsal/);
    assert.equal(memory.snapshot().retries[level], 0);
    assert.equal(memory.recordRetry(level, memory.revision), true);
    assert.match(memory.retryCaption(level), /remember this encore/);
  }
  assert.equal(memory.retryCaption('escape'), null);
  assert.equal(memory.recordRetry('__proto__', memory.revision), false);
  assert.deepEqual(memory.snapshot().retries, { level1: 1, level2: 1, maze: 1 });
});

test('off suppresses all flavor and new history, preserving the preference and old history', () => {
  const storage = storageFixture(), memory = createCaineMemory({ storage });
  memory.beginRun(); memory.recordRetry('level2', memory.revision);
  const saved = memory.snapshot(), ticket = memory.revision;
  memory.setEnabled(false);
  assert.equal(memory.takePauseJoke(), null);
  assert.equal(memory.retryCaption('level2'), null);
  assert.equal(memory.updateCaption(0, { playable: true }), null);
  assert.equal(memory.recordRetry('maze', ticket), false);
  memory.beginRun();
  assert.deepEqual(memory.snapshot(), saved);
  assert.equal(createCaineMemory({ storage }).enabled, false);
  memory.setEnabled(true);
  assert.equal(memory.recordRetry('maze', ticket), false, 'Off/on invalidates pending pre-setting retries');
  assert.deepEqual(memory.snapshot(), saved);
});

test('clear removes only history, invalidates pending retries, and does not restore stale captions', () => {
  const storage = storageFixture(), memory = createCaineMemory({ storage });
  storage.setItem('tadc.save.1', 'campaign save');
  memory.beginRun(); memory.recordRetry('maze', memory.revision);
  const ticket = memory.revision;
  memory.setEnabled(false); memory.clear();
  assert.equal(storage.getItem(CAINE_HISTORY_KEY), null);
  assert.equal(storage.getItem(CAINE_ENABLED_KEY), '0');
  assert.equal(storage.getItem('tadc.save.1'), 'campaign save');
  memory.setEnabled(true);
  assert.equal(memory.recordRetry('maze', ticket), false);
  assert.equal(memory.updateCaption(0, { playable: true }), null);
  assert.deepEqual(memory.snapshot(), { version: 1, runs: 0, retries: { level1: 0, level2: 0, maze: 0 } });
  memory.beginRun();
  assert.match(memory.updateCaption(0, { playable: true }), /brand-new adventure/);
});

test('campaign save/load has no memory fields and cannot roll local memory back', () => {
  const storage = storageFixture(), memory = createCaineMemory({ storage });
  const slots = createSaveSlots(storage);
  memory.beginRun();
  const checkpoint = { room: 'dorm', from: 'pomni', objectives: { active: 'find-ribbit' },
    story: {}, items: { collected: [] }, escape: { level1: 0, level2: 0 }, morningDialoguePending: false };
  assert.equal(slots.write(1, checkpoint).version, 1);
  const serialized = storage.getItem('tadc.save.1');
  assert.ok(!serialized.includes('caineMemory'));
  memory.recordRetry('level1', memory.revision);
  const history = storage.getItem(CAINE_HISTORY_KEY);
  assert.ok(slots.read(1));
  assert.equal(storage.getItem(CAINE_HISTORY_KEY), history);
  memory.clear();
  assert.ok(slots.read(1));
  assert.equal(storage.getItem(CAINE_HISTORY_KEY), null);
  assert.equal(storage.getItem('tadc.save.1'), serialized);
});

test('malformed, future, oversized and unknown stored data is sanitized', () => {
  const storage = storageFixture();
  for (const bad of ['{', '{"version":2,"runs":9}', 'null', 'false']) {
    storage.setItem(CAINE_HISTORY_KEY, bad);
    assert.equal(createCaineMemory({ storage }).snapshot().runs, 0);
  }
  storage.setItem(CAINE_HISTORY_KEY, JSON.stringify({ version: 1, runs: -1,
    retries: { level1: '2', level2: 2.5, maze: 1e10 }, secret: 'not retained' }));
  assert.deepEqual(createCaineMemory({ storage }).snapshot(),
    { version: 1, runs: 0, retries: { level1: 0, level2: 0, maze: 0 } });
  storage.setItem(CAINE_HISTORY_KEY, JSON.stringify({ version: 1, runs: 9999, retries: { maze: 9999 } }));
  const memory = createCaineMemory({ storage });
  memory.beginRun(); memory.recordRetry('maze', memory.revision);
  assert.equal(memory.snapshot().runs, 9999);
  assert.equal(memory.snapshot().retries.maze, 9999);
  const snapshot = memory.snapshot(); snapshot.retries.maze = 0;
  assert.equal(memory.snapshot().retries.maze, 9999);
});

test('blocked storage uses session-only memory without breaking gameplay', () => {
  const blocked = new Proxy({}, { get() { throw Error('Storage unavailable'); } });
  const memory = createCaineMemory({ storage: blocked });
  assert.doesNotThrow(() => {
    memory.beginRun(); memory.recordRetry('maze', memory.revision);
    memory.setEnabled(false); memory.clear(); memory.setEnabled(true);
  });
  assert.equal(memory.snapshot().runs, 0);
});

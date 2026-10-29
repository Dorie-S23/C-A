import assert from 'node:assert/strict';
import { SCORES, TRACKS, ROOM_TRACKS, parseNote, parseChord, parseScore, arrangeTrack } from '../src/audio/musicScores.js';
import { INSTRUMENTS } from '../src/audio/music.js';

assert.equal(parseNote('A4'), 69);
assert.equal(parseNote('C#5'), 73);
assert.equal(parseNote('Bb4'), 70);
assert.equal(parseNote('H4'), null);
assert.deepEqual(parseChord('G7'), { root: 7, intervals: [0, 4, 7, 10] });
assert.deepEqual(parseChord('Ab'), { root: 8, intervals: [0, 4, 7] });
assert.equal(parseChord('Cx'), null);
console.log('PASS Notes and chord symbols parse');

for (const [key, score] of Object.entries(SCORES)) {
  const { problems } = parseScore(score);
  assert.deepEqual(problems, [], `score "${key}"`);
}
console.log('PASS Every bar of every score adds up to its time signature');

// The keys of ROOM_LOADERS in main.js.
for (const room of ['pomni', 'tadc', 'dorm', 'ribbit', 'maze', 'kaufmo']) {
  assert.ok(TRACKS[ROOM_TRACKS[room]], `room "${room}" has no music track`);
}
console.log('PASS Every room has a music track');

for (const key of Object.keys(TRACKS)) {
  const track = arrangeTrack(key);
  assert.deepEqual(track.problems, [], `track "${key}"`);
  for (const part of track.parts) assert.ok(INSTRUMENTS[part.instrument], `track "${key}": unknown instrument "${part.instrument}"`);
  assert.ok(track.notes.length > 0, `track "${key}" is empty`);
  for (const note of track.notes) {
    assert.ok(note.time >= 0 && note.time < track.loopSeconds, `track "${key}": note outside the loop`);
    assert.ok(note.duration > 0, `track "${key}": zero-length note`);
    assert.ok(note.midi >= 24 && note.midi <= 108, `track "${key}": note ${note.midi} out of range`);
  }
  // Long enough not to grate on repeat, short enough to stay small once rendered.
  assert.ok(track.loopSeconds >= 20 && track.loopSeconds <= 60, `track "${key}" loops every ${track.loopSeconds.toFixed(1)} s`);
}
console.log('PASS Every track arranges into in-range notes inside its loop');

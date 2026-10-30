// The ending's slides: every one on disk, each tied to a beat of its own
// variant's script, and in the order the script reaches them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ENDING_SLIDES } from '../src/data/endingSlides.js';
import {
  endingLobbySavedDialogue, endingLobbyAbstractedDialogue, exitDoorSavedDialogue, exitDoorAbstractedDialogue, exitDoorTrappedDialogue,
} from '../src/data/dialogues.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPTS = {
  saved: [...endingLobbySavedDialogue, ...exitDoorSavedDialogue],
  abstracted: [...endingLobbyAbstractedDialogue, ...exitDoorAbstractedDialogue],
  trapped: [...endingLobbyAbstractedDialogue, ...exitDoorTrappedDialogue],
};
// What each variant shows, start to finish.
const ORDER = {
  saved: ['saved-1', 'saved-2', 'saved-3', 'saved-4', 'saved-5', 'final-1', 'final-2', 'final-3', 'final-4'],
  abstracted: ['abstracted-1', 'abstracted-2', 'abstracted-3', 'abstracted-4', 'abstracted-5', 'final-1', 'final-2', 'final-3', 'final-4'],
  trapped: ['abstracted-1', 'abstracted-2', 'abstracted-3', 'abstracted-4', 'trapped-1', 'final-2', 'trapped-2'],
};

for (const variant of ['saved', 'abstracted', 'trapped']) {
  const slides = ENDING_SLIDES[variant];
  const actions = SCRIPTS[variant].map(node => node.action);

  test(`${variant}: each slide starts at a beat its script has`, () => {
    for (const action of Object.keys(slides)) assert.ok(actions.includes(action), `${variant} has no "${action}" beat`);
  });

  test(`${variant}: the script opens on a slide and reaches them all in order`, () => {
    assert.ok(slides[SCRIPTS[variant][0].action], 'the first node puts up the first slide');
    const shown = actions.filter(action => slides[action]).map(action => path.basename(slides[action], '.jpg'));
    assert.deepEqual(shown, ORDER[variant]);
  });

  test(`${variant}: the images are on disk and spelled out as the packager needs`, () => {
    for (const url of Object.values(slides)) {
      assert.match(url, /^\.\/models\/game%20screens\/ending\/[a-z]+-\d\.jpg$/);
      const file = path.join(ROOT, 'public', decodeURIComponent(url));
      assert.ok(fs.existsSync(file), `${file} exists`);
      assert.ok(fs.statSync(file).size < 400 * 1024, `${file} is a web-sized image`);
    }
  });
}

test('Jax is only in the slides of the ending he is in', () => {
  for (const variant of ['abstracted', 'trapped']) {
    assert.equal(Object.values(ENDING_SLIDES[variant]).some(url => url.includes('saved-')), false);
  }
  assert.equal(Object.values(ENDING_SLIDES.saved).some(url => url.includes('abstracted-')), false);
});

test('the trapped ending never shows the door open', () => {
  const urls = Object.values(ENDING_SLIDES.trapped).map(url => path.basename(url, '.jpg'));
  for (const open of ['abstracted-5', 'final-1', 'final-3', 'final-4']) assert.equal(urls.includes(open), false, open);
});

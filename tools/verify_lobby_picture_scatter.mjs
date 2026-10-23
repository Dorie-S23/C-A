// Regression check against the REAL Circus Lobby geometry, not a synthetic
// stand-in (see _verify_picture_scatter.mjs for that) — catches exactly the
// bug this was written for: scatterPictures()'s old single-origin sweep
// found a usable wall spot within a sensible mounting distance on only 2 of
// 16 rays from the Lobby's actual spawn (it's a large, mostly-open room),
// so across 30 trials it never once placed all 5 pictures, usually only 2.
// Run: node tools/verify_lobby_picture_scatter.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadTadcRoom } from '../src/rooms/tadcRoom.js';
import { createLevel2Items, PHOTO_COUNT } from '../src/state/level2Items.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};

const TRIALS = 15;
const counts = [];
for (let i = 0; i < TRIALS; i++) {
  const items = createLevel2Items();
  const room = await loadTadcRoom(null, { items });
  counts.push(room.group.children.filter((c) => c.name === 'OfficePicture').length);
}

assert.ok(counts.every((n) => n === PHOTO_COUNT),
  `expected all ${TRIALS} trials to place all ${PHOTO_COUNT} pictures, got counts: ${counts.join(',')}`);
console.log(`PASS All ${PHOTO_COUNT} pictures placed in every one of ${TRIALS} trials against the real Lobby model`);

// Confirms loadKaufmoTalk() actually finds the bones it relies on against
// the real model — kaufmoRunExtra.js never needed forearm bones (the run
// cycle only swings the upper arm), so their existence was never checked
// before kaufmoTalk.js's per-mood poses started using them.
// Run: node tools/verify_kaufmo_talk_bones.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadKaufmoTalk } from '../src/characters/kaufmoTalk.js';

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

const api = await loadKaufmoTalk();
assert.ok(api.kaufmo, 'model loaded');

// Drive a few frames through every pose and speaking on/off — this is a
// smoke test (nothing throws, update() runs clean), not a visual check.
for (const mood of ['neutral', 'happy', 'worried', 'shocked', 'sad', 'annoyed', 'not-a-real-mood']) {
  api.setPose(mood);
  for (let i = 0; i < 30; i++) api.update(1 / 60);
}
api.setSpeaking(true);
for (let i = 0; i < 30; i++) api.update(1 / 60);
api.faceTowards({ x: 5, z: -3 });
for (let i = 0; i < 30; i++) api.update(1 / 60);
console.log('PASS loadKaufmoTalk runs through every pose and speaking state without throwing');

// Report which bones were actually found, by checking which named bones
// in the loaded model match kaufmoTalk.js's own find patterns — if any of
// these come back missing, that mood/gesture detail just silently no-ops
// (bendBone is null-safe), so this is worth knowing, not a failure on its
// own.
const bones = [];
api.kaufmo.traverse((child) => { if (child.isBone) bones.push(child.name); });
const needles = ['spine', 'head', 'lupperarm', 'rupperarm', 'lforearm', 'rforearm'];
for (const needle of needles) {
  const match = bones.find((name) => name.toLowerCase().replace(/[^a-z]/g, '').includes(needle));
  console.log(match ? `FOUND  ${needle.padEnd(10)} -> ${match}` : `MISSING ${needle}`);
}

// Confirms loadJax()'s idle breathing/tremble and faceTowards actually
// run against the real model, and that the spine/head bones they rely on
// exist — same technique as verify_kaufmo_talk_bones.mjs.
// Run: node tools/verify_jax_idle_bones.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadJax } from '../src/characters/jax.js';

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

const api = await loadJax();
assert.ok(api.jax, 'model loaded');

// Idle: runs clean while stationary (the maze's normal state for him).
for (let i = 0; i < 60; i++) api.update(1 / 60);

// faceTowards should turn him toward the point over a few frames without
// throwing, and have no effect once cleared with null.
api.faceTowards(new THREE.Vector3(5, 0, -3));
for (let i = 0; i < 60; i++) api.update(1 / 60);
const turnedYaw = api.jax.rotation.y;
assert.ok(Math.abs(turnedYaw) > 0.01, 'faceTowards should have turned him from his default facing');
api.faceTowards(null);
for (let i = 0; i < 10; i++) api.update(1 / 60);

// playPassBy should still run clean on top of (and clear) any idle pose.
api.playPassBy(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5), 1.5);
for (let i = 0; i < 90; i++) api.update(1 / 60);
console.log('PASS loadJax runs idle, faceTowards and playPassBy without throwing');

const bones = [];
api.jax.traverse((child) => { if (child.isBone) bones.push(child.name); });
const needles = ['spine', 'head'];
for (const needle of needles) {
  const match = bones.find((name) => name.toLowerCase().replace(/[^a-z]/g, '').startsWith(needle));
  console.log(match ? `FOUND  ${needle.padEnd(10)} -> ${match}` : `MISSING ${needle}`);
}

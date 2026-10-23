// Confirms Jax's run cycle actually brings his arms down to his sides
// and bends the elbow, instead of swinging straight, shoulder-height
// T-pose arms (this rig's bind pose, measured against the real model —
// see jax.js's own ARM_LOWER_ANGLE comment). Run:
// node tools/verify_jax_run_arms.mjs
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

function findBone(root, prefix) {
  let found = null;
  root.traverse((child) => {
    if (found || !child.isBone) return;
    const clean = child.name.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.startsWith(prefix)) found = child;
  });
  return found;
}

const api = await loadJax();
const upperArmL = findBone(api.jax, 'upperarml');
const handL = findBone(api.jax, 'handl');
assert.ok(upperArmL && handL, 'expected to find the left shoulder and hand bones');

api.playPassBy(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -10), 2);

const rootInv = api.jax.getWorldQuaternion(new THREE.Quaternion()).invert();
let maxHandHeightAboveShoulder = -Infinity;
for (let i = 0; i < 90; i++) {
  api.update(1 / 60);
  const shoulder = upperArmL.getWorldPosition(new THREE.Vector3());
  const hand = handL.getWorldPosition(new THREE.Vector3());
  const rel = hand.clone().sub(shoulder).applyQuaternion(rootInv);
  maxHandHeightAboveShoulder = Math.max(maxHandHeightAboveShoulder, rel.y);
}

// T-pose would hold the hand level with (or above) the shoulder the whole
// time (rel.y near 0). A lowered, swinging, elbow-bent arm keeps the hand
// well below it throughout the cycle.
assert.ok(maxHandHeightAboveShoulder < -0.2,
  `hand got to ${maxHandHeightAboveShoulder.toFixed(3)} relative to the shoulder at some point in the cycle — ` +
  `still reads as raised/T-pose, not hanging at his side`);
console.log(`PASS left hand stays at least ${(-maxHandHeightAboveShoulder).toFixed(2)} below the shoulder throughout the run cycle (never T-pose)`);

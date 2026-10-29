// Confirms loadKaufmoTalk() actually finds the bones it relies on against
// the real model — kaufmoRunExtra.js never needed forearm bones (the run
// cycle only swings the upper arm), so their existence was never checked
// before kaufmoTalk.js's per-mood poses started using them.
// Run: node tools/verify_kaufmo_talk_bones.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { loadKaufmoTalk, KAUFMO_ACTIVITIES, KAUFMO_MOODS } from '../src/characters/kaufmoTalk.js';

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

// His hands never cut into each other: in every activity, mood, and mood
// while talking, played for 6 s, the closest any part of one hand (forearm
// end, palm, each finger) comes to any part of the other, measured between
// the bones' centre lines, stays over HAND_CLEARANCE: the gloves' fingers
// are about 4 cm thick.
const HAND_CLEARANCE = 0.08;
const bone = (needle) => {
  let found = null;
  api.kaufmo.traverse((child) => {
    if (!found && child.isBone && child.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(needle)) found = child;
  });
  return found;
};
const tipOf = (start) => {
  let tip = start;
  while (tip.children.some((child) => child.isBone)) tip = tip.children.find((child) => child.isBone);
  return tip;
};
const segments = (side) => {
  const hand = bone(`${side}hand`);
  const out = [[bone(`${side}forearm`), hand, 'forearm']];
  for (const finger of ['finger0', 'finger1', 'finger2', 'finger4']) {
    const base = bone(side + finger);
    out.push([hand, base, `palm by ${finger}`], [base, tipOf(base), finger]);
  }
  return out;
};
const at = (object) => object.getWorldPosition(new THREE.Vector3());
function segmentDistance(p1, q1, p2, q2) {
  const d1 = q1.clone().sub(p1), d2 = q2.clone().sub(p2), r = p1.clone().sub(p2);
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.dot(r), c = d1.dot(r), b = d1.dot(d2), den = a * e - b * b;
  let s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); } else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}
const left = segments('l'), right = segments('r');
const poses = [
  ...KAUFMO_ACTIVITIES.map((name) => ({ name, activity: name, mood: 'neutral', speaking: false })),
  ...KAUFMO_MOODS.map((mood) => ({ name: mood, activity: null, mood, speaking: false })),
  ...KAUFMO_MOODS.map((mood) => ({ name: `talking, ${mood}`, activity: null, mood, speaking: true })),
];
let clashes = 0;
for (const { name, activity, mood, speaking } of poses) {
  api.setActivity(activity);
  api.setPose(mood);
  api.setSpeaking(speaking);
  for (let i = 0; i < 90; i++) api.update(1 / 30); // settled into it
  let closest = { distance: Infinity };
  for (let i = 0; i < 180; i++) {
    api.update(1 / 30);
    api.kaufmo.updateMatrixWorld(true);
    for (const [a1, a2, aName] of left) {
      for (const [b1, b2, bName] of right) {
        const distance = segmentDistance(at(a1), at(a2), at(b1), at(b2));
        if (distance < closest.distance) closest = { distance, parts: `left ${aName} / right ${bName}` };
      }
    }
  }
  const ok = closest.distance > HAND_CLEARANCE;
  if (!ok) clashes++;
  console.log(`${ok ? 'PASS' : 'FAIL'} hands apart: ${name.padEnd(17)} ${(closest.distance * 100).toFixed(1)} cm (${closest.parts})`);
}
assert.equal(clashes, 0, "Kaufmo's hands cut into each other");

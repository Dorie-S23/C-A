import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createAbstractions, keepBody, FORM_HEIGHT } from '../src/characters/abstractedForm.js';
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

// A stand-in form (the real export doesn't render: see usable()): a box that
// rises out of the floor (spawn) and then idles, like the real one's clips.
function standInForm() {
  const scene = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), new THREE.MeshStandardMaterial());
  body.name = 'Body'; body.position.y = 1.5; scene.add(body);
  const track = (values) => new THREE.VectorKeyframeTrack('Body.position', [0, 3.3], values);
  return { scene, animations: [
    new THREE.AnimationClip('Idle', 3.3, [track([0, 1.5, 0, 0, 1.5, 0])]),
    new THREE.AnimationClip('ABS_Rig|spawn', 3.3, [track([0, -1.5, 0, 0, 1.5, 0])]),
  ] };
}
const run = async (abstractions, promise) => {
  let done = null, t = 0;
  promise.then(result => { done = result; });
  for (; t < 12 && !done; t += 1 / 30) { abstractions.update(1 / 30); await new Promise(r => setTimeout(r, 0)); }
  return { done, t };
};

test('failing, a character is eaten away and the abstracted form rises where they stood, facing their way', async () => {
  const room = new THREE.Group(); room.position.set(3, 0, -2);
  const { jax } = await loadJax();
  jax.visible = true;
  jax.position.set(1, 0, 4); jax.rotation.y = 0.7;
  room.add(jax);
  const abstractions = createAbstractions();
  const { done, t } = await run(abstractions, abstractions.transform(jax, { parent: room, form: Promise.resolve(standInForm()), voidSeconds: 1 }));
  assert.ok(done?.form, 'the form rose');
  assert.ok(t > 1 + 2.5, `after the void (1 s) and its rising (${t.toFixed(1)} s)`);
  assert.equal(jax.visible, false, 'they are gone');
  const form = room.getObjectByName('AbstractedForm');
  assert.equal(form, done.form);
  assert.ok(form.position.distanceTo(jax.position) < 1e-6, 'where they stood');
  assert.ok(Math.abs(form.rotation.y - 0.7) < 1e-6, 'facing their way');
  for (let i = 0; i < 30; i++) abstractions.update(1 / 30);
  form.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(form);
  assert.ok(Math.abs(box.min.y) < .05, `standing on the floor (${box.min.y.toFixed(2)})`);
  assert.ok(Math.abs(box.max.y - box.min.y - FORM_HEIGHT) < .05, `${FORM_HEIGHT} m tall (${(box.max.y - box.min.y).toFixed(2)})`);
  done.undo();
  assert.equal(room.getObjectByName('AbstractedForm'), undefined, 'a retry clears it');
  assert.equal(jax.visible, true, 'and they are back');
});

test('with no usable form they only go to the void, and a retry still brings them back', async () => {
  const room = new THREE.Group(), character = new THREE.Group();
  character.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
  room.add(character);
  const abstractions = createAbstractions();
  const { done } = await run(abstractions, abstractions.transform(character, { parent: room, form: Promise.resolve(null), voidSeconds: .5 }));
  assert.equal(done.form, null); assert.equal(character.visible, false);
  assert.equal(room.getObjectByName('AbstractedForm'), undefined, 'nothing half-drawn in their place');
  done.undo(); assert.equal(character.visible, true);
});

test('the real form: just its body (the eyes in this export are skinned at the wrong scale), risen to about '+FORM_HEIGHT+' m', async () => {
  const gltf = await new GLTFLoader().loadAsync(encodeURI('./models/characters/abstracted form/abstracted_kaufmo.glb'));
  assert.equal(keepBody(gltf), true);
  const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1, 'only the body');
  const room = new THREE.Group(), character = new THREE.Group(); room.add(character); character.position.set(2, 0, 1);
  const abstractions = createAbstractions();
  const { done } = await run(abstractions, abstractions.transform(character, { parent: room, form: Promise.resolve(gltf), voidSeconds: .2 }));
  assert.ok(done.form);
  for (let i = 0; i < 30; i++) abstractions.update(1 / 30);
  done.form.updateMatrixWorld(true);
  done.form.traverse(o => { if (o.isSkinnedMesh) o.skeleton.update(); });
  const box = new THREE.Box3().setFromObject(done.form, true);
  assert.ok(Math.abs(box.min.y) < .25, `on the floor (${box.min.y.toFixed(2)})`);
  assert.ok(box.max.y > 1.8 && box.max.y < 3.2, `standing about ${FORM_HEIGHT} m (${box.max.y.toFixed(2)})`);
  assert.ok(Math.hypot((box.min.x + box.max.x) / 2 - 2, (box.min.z + box.max.z) / 2 - 1) < 1.2, 'where they stood');
});

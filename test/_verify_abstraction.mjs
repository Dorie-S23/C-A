// The shared abstraction effect (src/effects/abstraction.js) on a small
// stand-in character: how its shells attach, how distress and progress
// move, and that it comes off cleanly. No WebGL here; whether the shader
// compiles and draws is tools/verify_abstraction_browser.mjs.
// Run: node --test _verify_abstraction.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createAbstractionEffect, distressFromDialogue } from '../src/effects/abstraction.js';

/**
 * Laid out like a loaded character: a root group, a scaled model in it
 * (Kaufmo's loader scales his), a rigged body 2m tall once scaled, a hat
 * riding a bone up to 2.6m, and a hidden leftover mesh. Stood away from
 * the origin and turned, so nothing depends on where it is.
 */
function makeCharacter() {
  const character = new THREE.Group();
  character.position.set(5, 0, -3);
  character.rotation.y = 1;
  const model = new THREE.Group();
  model.scale.setScalar(2);
  character.add(model);

  const geometry = new THREE.BoxGeometry(0.4, 1, 0.3).translate(0, 0.5, 0);
  const count = geometry.attributes.position.count;
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0), 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [1, 0, 0, 0]).flat(), 4));
  const body = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  body.name = 'Body';
  const bone = new THREE.Bone();
  body.add(bone);
  model.add(body);
  character.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton([bone]));

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3), new THREE.MeshStandardMaterial());
  hat.name = 'Hat';
  hat.position.y = 1.15;
  bone.add(hat);

  const junk = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  junk.name = 'Cube';
  junk.visible = false;
  model.add(junk);
  return { character, body, hat, junk };
}

const shellsIn = (root) => {
  const shells = [];
  root.traverse((child) => { if (child.userData.abstractionShell) shells.push(child); });
  return shells;
};

test('a shell covers each visible mesh, posed by the same skeleton, hidden until needed', () => {
  const { character, body, hat, junk } = makeCharacter();
  const bodyMaterial = body.material;
  const effect = createAbstractionEffect(character);

  assert.equal(effect.shells.length, 2);
  const [bodyShell, hatShell] = effect.shells;
  assert.equal(bodyShell.parent, body);
  assert.equal(hatShell.parent, hat);
  assert.equal(shellsIn(junk).length, 0, 'the hidden leftover gets no shell');

  assert.ok(bodyShell.isSkinnedMesh);
  assert.equal(bodyShell.skeleton, body.skeleton);
  assert.ok(bodyShell.bindMatrix.equals(body.bindMatrix));
  assert.ok(!hatShell.isSkinnedMesh);
  assert.equal(bodyShell.geometry, body.geometry);
  assert.equal(body.material, bodyMaterial, "the character's own material is untouched");

  for (const shell of effect.shells) {
    assert.equal(shell.visible, false);
    assert.equal(shell.castShadow, false);
  }
});

test('body space is metres up from the feet, wherever the character stands', () => {
  const { character } = makeCharacter();
  const [bodyShell] = createAbstractionEffect(character).shells;
  const { uFloor, uHeight, uRestToBody } = bodyShell.material.uniforms;
  assert.ok(Math.abs(uFloor.value) < 1e-6);
  assert.ok(Math.abs(uHeight.value - 2.6) < 1e-6, `height ${uHeight.value}, expected 2.6 (body 2m, hat to 2.6m)`);
  // The body's top corner, unposed, lands 2m up and within its own half-width.
  const top = new THREE.Vector3(0.2, 1, 0.15).applyMatrix4(uRestToBody.value);
  assert.ok(Math.abs(top.y - 2) < 1e-6);
  assert.ok(Math.abs(top.x - 0.4) < 1e-6 && Math.abs(top.z - 0.3) < 1e-6);
});

test("raycasts pass through the shells: they're never something to click or bump into", () => {
  const { character } = makeCharacter();
  const effect = createAbstractionEffect(character);
  effect.setDistress(1, { immediate: true });
  const centre = new THREE.Vector3(0, 1, 0).applyMatrix4(character.matrixWorld);
  const from = centre.clone().add(new THREE.Vector3(10, 0, 0));
  const hits = new THREE.Raycaster(from, centre.clone().sub(from).normalize()).intersectObject(character, true);
  assert.ok(hits.length > 0, 'the body itself is still hit');
  assert.ok(hits.every((hit) => !hit.object.userData.abstractionShell));
});

test('distress follows the dialogue, easing in rather than snapping', () => {
  assert.equal(distressFromDialogue(0), 0);
  assert.equal(distressFromDialogue(undefined), 0);
  assert.equal(distressFromDialogue(2), 2 / 3);
  assert.equal(distressFromDialogue(3), 1);
  assert.equal(distressFromDialogue(5), 1);

  const { character } = makeCharacter();
  const effect = createAbstractionEffect(character);
  effect.setDistress(distressFromDialogue(3));
  assert.equal(effect.distress, 0, 'nothing moves until update()');
  effect.update(0.1);
  assert.ok(effect.distress > 0 && effect.distress < 0.5, `distress ${effect.distress} after 0.1s`);
  assert.ok(effect.shells.every((shell) => shell.visible));
  for (let i = 0; i < 300; i++) effect.update(1 / 60);
  assert.ok(effect.distress > 0.99);
  assert.ok(effect.shells[0].material.uniforms.uTime.value > 4.9);

  effect.setDistress(0);
  for (let i = 0; i < 300; i++) effect.update(1 / 60);
  assert.equal(effect.distress, 0, 'settles exactly at 0');
  assert.ok(effect.shells.every((shell) => !shell.visible), 'and hides the shells again');

  effect.setDistress(0.5, { immediate: true });
  assert.equal(effect.distress, 0.5);
  assert.equal(effect.shells[0].material.uniforms.uDistress.value, 0.5);
});

test('abstract() plays the front down and resolves true once they are gone', async () => {
  const { character } = makeCharacter();
  const effect = createAbstractionEffect(character);
  let settled = false;
  const done = effect.abstract(2);
  done.then(() => { settled = true; });
  effect.update(1);
  await Promise.resolve();
  assert.equal(effect.progress, 0.5);
  assert.ok(effect.distress > 0.9, 'abstracting is at full distress');
  assert.equal(settled, false);
  effect.update(1);
  assert.equal(await done, true);
  assert.equal(effect.progress, 1);
  assert.equal(effect.shells[0].material.uniforms.uProgress.value, 1);
});

test('cutting it short resolves false; reset() puts them back at once', async () => {
  const { character } = makeCharacter();
  const effect = createAbstractionEffect(character);
  const first = effect.abstract();
  effect.update(0.5);
  effect.reset();
  assert.equal(await first, false);
  assert.equal(effect.progress, 0);
  assert.equal(effect.distress, 0);
  assert.ok(effect.shells.every((shell) => !shell.visible));
  assert.equal(effect.shells[0].material.uniforms.uTime.value, 0);

  const replaced = effect.abstract();
  const jumped = effect.abstract();
  assert.equal(await replaced, false);
  effect.setProgress(0.3);
  assert.equal(await jumped, false);
  assert.equal(effect.progress, 0.3);
  assert.ok(effect.shells.every((shell) => shell.visible));
});

test('once completely gone, only the void draws; anything less brings them back', async () => {
  const { character, body, hat } = makeCharacter();
  hat.layers.enable(3); // a mesh on more than the default layer gets all of them back
  const hatLayers = hat.layers.mask;
  const camera = new THREE.PerspectiveCamera();
  const drawn = (object) => object.layers.test(camera.layers);
  const effect = createAbstractionEffect(character);

  effect.setDistress(1, { immediate: true });
  effect.setProgress(0.99);
  assert.ok(drawn(body) && drawn(hat), 'still partly themselves');
  const done = effect.abstract(1);
  effect.update(1);
  assert.equal(await done, true);
  assert.ok(!drawn(body) && !drawn(hat), 'their own meshes are off every layer');
  assert.ok(effect.shells.every((shell) => shell.visible && drawn(shell)), 'the shells, their children, still draw');
  // A raycast skips them too, now that nothing of them is left to hit.
  const hits = new THREE.Raycaster(new THREE.Vector3(5, 0.5, 5), new THREE.Vector3(0, 0, -1)).intersectObject(character, true);
  assert.ok(!hits.some(({ object }) => object === body || object === hat));

  effect.setProgress(0.5);
  assert.ok(drawn(body));
  assert.equal(hat.layers.mask, hatLayers);
  effect.setProgress(1);
  effect.dispose();
  assert.ok(drawn(body), 'dispose() puts them back');
  assert.equal(hat.layers.mask, hatLayers);
});

test('dispose() takes every shell off and leaves the character as it was', () => {
  const { character, body } = makeCharacter();
  let geometryDisposed = false;
  body.geometry.addEventListener('dispose', () => { geometryDisposed = true; });
  const before = createAbstractionEffect(character);
  // A second effect on the same character shells the body, not the first effect's shells.
  const again = createAbstractionEffect(character);
  assert.equal(again.shells.length, 2);
  again.dispose();

  let materialDisposed = false;
  const material = before.shells[0].material;
  material.addEventListener('dispose', () => { materialDisposed = true; });
  before.dispose();
  assert.equal(shellsIn(character).length, 0);
  assert.equal(before.shells.length, 0);
  assert.ok(materialDisposed);
  assert.equal(geometryDisposed, false, "the geometry is the character's own");
  before.update(1); // harmless after dispose
});

test('the two shader stages agree, and every uniform they declare gets a value', () => {
  const { character } = makeCharacter();
  const { material } = createAbstractionEffect(character).shells[0];
  const declared = (source, kind) => new Map(
    [...source.matchAll(new RegExp(`^\\s*${kind}\\s+(\\w+)\\s+(\\w+);`, 'gm'))].map(([, type, name]) => [name, type]),
  );
  const vertexVaryings = declared(material.vertexShader, 'varying');
  for (const [name, type] of declared(material.fragmentShader, 'varying')) {
    assert.equal(vertexVaryings.get(name), type, `varying ${name} is written by the vertex stage`);
  }
  const vertexUniforms = declared(material.vertexShader, 'uniform');
  const fragmentUniforms = declared(material.fragmentShader, 'uniform');
  for (const [name, type] of fragmentUniforms) {
    if (vertexUniforms.has(name)) assert.equal(vertexUniforms.get(name), type, `uniform ${name} has one type`);
  }
  for (const name of [...vertexUniforms.keys(), ...fragmentUniforms.keys()]) {
    assert.ok(name in material.uniforms, `uniform ${name} is set from JS`);
  }
});

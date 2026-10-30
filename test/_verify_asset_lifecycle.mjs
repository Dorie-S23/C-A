import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoadingManager, Group, Mesh, BoxGeometry, MeshStandardMaterial, Texture } from 'three';
import { installGltfBlobCleanup, releaseTextures, disposeObjectResources } from '../src/rooms/assetLifecycle.js';

test('decoded embedded images revoke their resolved blob URL while preserving load progress', () => {
  const progress = [], revoked = [];
  const manager = new LoadingManager(undefined, (...args) => progress.push(args));
  installGltfBlobCleanup(manager, url => revoked.push(url));
  installGltfBlobCleanup(manager, () => assert.fail('cleanup installed twice'));
  for (const url of ['models/room.glb', 'blob:http://localhost/embedded-image', 'models/icon.webp']) {
    manager.itemStart(url); manager.itemEnd(url);
  }
  assert.deepEqual(revoked, ['blob:http://localhost/embedded-image']);
  assert.equal(progress.length, 3);
  assert.equal(progress[1][0], revoked[0]);
});

test('room disposal closes shared bitmap sources once and disposes every unique texture', () => {
  let closed = 0, disposed = 0;
  const bitmap = { close() { closed++; } };
  const textures = new Set([
    { source: { data: bitmap }, dispose() { disposed++; } },
    { source: { data: bitmap }, dispose() { disposed++; } },
    { source: { data: [bitmap, { close() { closed++; } }] }, dispose() { disposed++; } },
    { source: { data: { tagName: 'IMG' } }, dispose() { disposed++; } },
  ]);
  releaseTextures(textures);
  assert.equal(closed, 2);
  assert.equal(disposed, 4);
});

test('character teardown releases unique resources, skeletons, and attached temporary props once', () => {
  const root = new Group();
  const geometry = new BoxGeometry(0.4, 0.3, 0.15);
  const texture = new Texture();
  const material = new MeshStandardMaterial({ map: texture });
  const body = new Mesh(geometry, material);
  const pillow = new Mesh(geometry, material);
  pillow.name = 'TemporaryClutchedProp';
  body.add(pillow);
  root.add(body);
  let skeletonDisposals = 0;
  body.skeleton = { dispose() { skeletonDisposals++; } };
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener('dispose', () => { counts.geometry++; });
  material.addEventListener('dispose', () => { counts.material++; });
  texture.addEventListener('dispose', () => { counts.texture++; });
  disposeObjectResources(root);
  assert.deepEqual(counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(skeletonDisposals, 1);
});

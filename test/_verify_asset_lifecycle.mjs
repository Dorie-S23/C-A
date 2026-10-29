import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LoadingManager } from 'three';
import { installGltfBlobCleanup, releaseTextures } from '../src/rooms/assetLifecycle.js';

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

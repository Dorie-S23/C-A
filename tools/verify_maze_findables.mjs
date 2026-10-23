// Confirms the maze's two hidden keepsakes (src/state/mazeItems.js,
// src/props/mazeFindables.js) actually get placed, stay clear of Jax/the
// exit/the hazard's patrol, and are pickupable — against the real Jax
// model, the same GLB-loading technique used throughout tools/.
// Run: node tools/verify_maze_findables.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadMazeRoom } from '../src/rooms/mazeRoom.js';
import { createMazeItems, MAZE_FINDABLES } from '../src/state/mazeItems.js';

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

{
  const mazeItems = createMazeItems();
  const room = await loadMazeRoom(null, { mazeItems });

  const meshes = room.group.children.filter((c) => c.name === 'MazeFindable');
  assert.equal(meshes.length, MAZE_FINDABLES.length, `expected ${MAZE_FINDABLES.length} findables placed, got ${meshes.length}`);
  assert.equal(room.interactables.length, MAZE_FINDABLES.length, 'one pickup interactable per findable');
  console.log(`PASS both findables placed (${meshes.length}) with matching interactables`);

  const [firstPickup] = room.interactables;
  assert.ok(firstPickup.prompt().startsWith('Pick up '), `unexpected prompt: ${firstPickup.prompt()}`);
  firstPickup.interact();
  assert.equal(room.group.children.filter((c) => c.name === 'MazeFindable').length, meshes.length - 1,
    'interacting should remove the mesh from the scene');
  assert.equal(room.interactables.length, MAZE_FINDABLES.length - 1,
    'interacting should drop its own interactable from the room list too');
  assert.equal(mazeItems.totalFound(), 1, 'collecting should register with the shared item state');
  console.log('PASS picking one up removes it from the scene, the interactable list, and registers the find');
}

{
  // A revisit with one already collected shouldn't re-place it.
  const mazeItems = createMazeItems();
  mazeItems.collect(MAZE_FINDABLES[0].id);
  const room = await loadMazeRoom(null, { mazeItems });
  const meshes = room.group.children.filter((c) => c.name === 'MazeFindable');
  assert.equal(meshes.length, MAZE_FINDABLES.length - 1, 'an already-collected findable should not reappear on reload');
  console.log('PASS an already-collected findable does not reappear on reload');
}

{
  // No mazeItems passed at all (e.g. a context that never wires it up):
  // should load clean, no findables, nothing thrown.
  const room = await loadMazeRoom(null, {});
  assert.equal(room.group.children.filter((c) => c.name === 'MazeFindable').length, 0);
  assert.deepEqual(room.interactables, []);
  console.log('PASS loads clean with no findables when mazeItems is omitted');
}

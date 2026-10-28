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

// Ignore per-load UUIDs/material IDs: compare actual rendered layout and poses.
function layout(room) {
  return {
    seed: room.mazeSeed,
    walls: room.colliders.map(box => [box.min.toArray(), box.max.toArray()]),
    spawn: room.spawn.toArray(), spawnFacing: room.spawnFacing,
    jax: room.group.getObjectByName('Jax').position.toArray(),
    jaxFacing: room.group.getObjectByName('Jax').rotation.y,
    exit: [room.triggers.exit.min.toArray(), room.triggers.exit.max.toArray()],
    patrol: room.movers.map(mover => mover.waypoints.map(point => point.toArray())),
    items: room.group.children.filter(child => child.name === 'MazeFindable')
      .map(item => ({ position: item.position.toArray(), rotation: item.rotation.y })),
    prompts: room.interactables.map(item => item.prompt()),
  };
}

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

{
  for (const seed of [0, 12345, 0xffffffff]) {
    const first = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const second = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    assert.equal(first.mazeSeed, seed);
    assert.deepEqual(layout(second), layout(first), `seed ${seed} must reproduce walls, actors and props`);
  }
  console.log('PASS explicit seeds, including zero and the maximum, reproduce the entire fresh room layout');
}

{
  const first = await loadMazeRoom(null, { mazeItems: createMazeItems() });
  assert.ok(Number.isInteger(first.mazeSeed) && first.mazeSeed >= 0 && first.mazeSeed <= 0xffffffff);
  const replay = await loadMazeRoom(null, { seed: first.mazeSeed, mazeItems: createMazeItems() });
  assert.deepEqual(layout(replay), layout(first), 'a randomly chosen seed must recreate the reported room');
  console.log('PASS an unseeded load records a seed that reproduces its walls and item placements');
}

{
  const first = await loadMazeRoom(null, { seed: 1, mazeItems: createMazeItems() });
  const second = await loadMazeRoom(null, { seed: 2, mazeItems: createMazeItems() });
  assert.notDeepEqual(layout(first).walls, layout(second).walls);
  assert.notDeepEqual(layout(first).items, layout(second).items);

  const items = createMazeItems();
  const room = await loadMazeRoom(null, { seed: 1, mazeItems: items });
  room.interactables[0].interact();
  const revisited = await loadMazeRoom(null, { seed: 1, mazeItems: items });
  assert.equal(revisited.interactables.length, 1);
  assert.deepEqual(layout(revisited).walls, layout(first).walls);
  assert.deepEqual(layout(revisited).items[0], layout(first).items[1]);
  console.log('PASS different seeds vary the room, and collected items stay absent on a seeded revisit');
}

{
  await assert.rejects(loadMazeRoom(null, { seed: -1 }), /Maze seed must be an integer/);
  await assert.rejects(loadMazeRoom(null, { seed: '12345' }), /Maze seed must be an integer/);
  console.log('PASS invalid room seeds reject with an actionable error');
}

{
  for (let seed = 0; seed < 32; seed++) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    const { maze, mazePlacement } = room;
    const key = cell => `${cell.r},${cell.c}`;
    const origin = mazePlacement.cellAt(room.spawn);
    assert.equal(origin, maze.start);
    const reached = mazePlacement.reachableFrom(origin);
    assert.equal(reached.length, maze.rows * maze.cols);
    const distances = new Map(reached.map(({ cell, distance }) => [key(cell), distance]));
    const reserved = [maze.start, maze.exit, maze.jax, maze.jaxNeighbor,
      ...room.movers.flatMap(mover => mover.waypoints.map(point => mazePlacement.cellAt(point)))];
    const excluded = new Set(reserved.map(key));
    const props = room.group.children.filter(child => child.name === 'MazeFindable');
    assert.equal(props.length, 2);
    for (const prop of props) {
      const cell = mazePlacement.cellAt(prop.position);
      assert.ok(cell && distances.has(key(cell)), `seed ${seed}: item is unreachable`);
      assert.ok(!excluded.has(key(cell)), `seed ${seed}: item overlaps a reserved cell`);
      excluded.add(key(cell)); // also disallow the two items sharing a cell
      assert.ok(room.colliders.every(wall => !wall.containsPoint(prop.position)), `seed ${seed}: item is inside a wall`);
    }
    const jax = room.group.getObjectByName('Jax');
    assert.equal(room.jaxEncounter.anchor, jax);
    assert.equal(room.jaxEncounter.radius, 2.5);
    assert.ok(room.jaxEncounter.objects.length > 0);
    assert.ok(room.jaxEncounter.objects.every(object => object.isMesh));
    const oldApproach = room.triggers.jax.getCenter(jax.position.clone()).sub(jax.position).multiplyScalar(2);
    assert.ok(Math.hypot(oldApproach.x, oldApproach.z) > room.jaxEncounter.radius,
      `seed ${seed}: the old approach cell must not count as a close Jax arrival`);
    assert.equal(mazePlacement.cellAt(jax.position), maze.jax);
    assert.ok(distances.has(key(maze.jax)));
    assert.ok(room.colliders.every(wall => !wall.containsPoint(jax.position)));

    const from = maze.cells[seed % maze.rows][seed * 7 % maze.cols];
    const queryDistances = new Map(mazePlacement.reachableFrom(from).map(({ cell, distance }) => [key(cell), distance]));
    const target = mazePlacement.selectCell(from, {
      minDistance: 2, maxDistance: 8, excludedCells: [{ r: from.r, c: from.c }],
    });
    assert.ok(target, `seed ${seed}: no safe Jax destination`);
    assert.ok(target.distance >= 2 && target.distance <= 8);
    assert.equal(target.distance, queryDistances.get(key(target.cell)));
    assert.equal(mazePlacement.cellAt(target.position), target.cell);
    assert.ok(!excluded.has(key(target.cell)), `seed ${seed}: destination overlaps a reserved cell or item`);
    assert.ok(room.colliders.every(wall => !wall.containsPoint(target.position)));
    assert.equal(mazePlacement.selectCell(from, { minDistance: maze.rows * maze.cols }), null);
    assert.equal(mazePlacement.selectCell(from, { excludedCells: maze.cells.flat() }), null);

    assert.equal(mazePlacement.cellAt({ x: room.bounds.max.x, z: 0 }), null);
    assert.equal(mazePlacement.cellAt({ x: room.bounds.min.x - 1, z: 0 }), null);
    assert.equal(mazePlacement.cellAt({ x: NaN, z: 0 }), null);
    room.interactables[0].interact();
    assert.equal(room.group.children.filter(child => child.name === 'MazeFindable').length, 1);
    assert.equal(room.interactables.length, 1);
  }
  console.log('PASS 32 real-model maze seeds keep items and Jax reachable, honour exclusions, and handle impossible destinations');
}

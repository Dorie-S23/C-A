import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGloinks, GLOINK_CONFIGS } from '../src/characters/gloink.js';
import { loadMazeRoom, MAZE } from '../src/rooms/mazeRoom.js';
import { createMazeItems } from '../src/state/mazeItems.js';

// Setup node GLTF loader hook for headless testing
globalThis.ProgressEvent ??= class {};
const originalLoad = GLTFLoader.prototype.load;
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

test('loadGloinks provides createInstance for configured types with centered bounds and floor anchor', async () => {
  const gloinkApi = await loadGloinks();
  assert.ok(gloinkApi && typeof gloinkApi.createInstance === 'function');

  for (const type of ['pin', 'star', 'cube']) {
    const gloink = gloinkApi.createInstance(type);
    assert.ok(gloink.group, `Gloink ${type} missing group`);
    assert.equal(gloink.group.name, `Gloink_${type}`);
    assert.equal(gloink.group.userData.isGloink, true);
    assert.equal(gloink.group.userData.isHazard, true);

    const box = new THREE.Box3().setFromObject(gloink.group);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Normalized height
    const expectedHeight = GLOINK_CONFIGS[type].height;
    assert.ok(Math.abs(size.y - expectedHeight) < 0.05, `Height mismatch for ${type}: ${size.y} vs ${expectedHeight}`);
    // Horizontally centered
    assert.ok(Math.abs(center.x) < 0.05, `Center X offset for ${type}: ${center.x}`);
    assert.ok(Math.abs(center.z) < 0.05, `Center Z offset for ${type}: ${center.z}`);
    // Bottom sits at y = 0
    assert.ok(Math.abs(box.min.y) < 0.05, `Bottom Y offset for ${type}: ${box.min.y}`);
  }
});

test('gloink procedural waddle and directional facing update properly over time', async () => {
  const gloinkApi = await loadGloinks();
  const gloink = gloinkApi.createInstance('pin');

  gloink.group.position.set(0, 0, 0);
  gloink.setFacing(new THREE.Vector3(0, 0, 5));
  assert.ok(Math.abs(gloink.group.rotation.y) < 0.01, 'Should face +Z');

  // Stationary update: shouldn't waddle wildly when not walking
  for (let i = 0; i < 10; i++) gloink.update(0.016);
  assert.ok(Math.abs(gloink.modelWrapper.rotation.z) < 0.05, 'Should not roll when idle');
  assert.ok(Math.abs(gloink.modelWrapper.position.x) < 0.05, 'Should not sway when idle');

  // Move forward repeatedly and step update: should waddle when walking
  let maxRoll = 0;
  let maxSway = 0;
  for (let i = 0; i < 25; i++) {
    gloink.group.position.x += 1.4 * 0.016;
    gloink.update(0.016);
    maxRoll = Math.max(maxRoll, Math.abs(gloink.modelWrapper.rotation.z));
    maxSway = Math.max(maxSway, Math.abs(gloink.modelWrapper.position.x));
  }

  assert.ok(maxRoll > 0.1, `Expected noticeable waddle roll while walking, got ${maxRoll}`);
  assert.ok(maxSway > 0.05, `Expected noticeable lateral sway while walking, got ${maxSway}`);
  assert.ok(gloink.modelWrapper.position.y >= 0, 'Hop height should be non-negative');
  assert.ok(gloink.group.rotation.y > 0, 'Should turn towards movement direction (+X)');
});

test('maze room spawns 4 distinct gloink enemies as chasing hazards', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });

  // They chase rather than slide along main.js's generic movers.
  assert.equal(room.movers.length, 0, 'Gloinks are no longer generic movers');
  assert.equal(room.gloinkChases.length, 4, 'Expected 4 chasing gloinks in the maze');
  assert.equal(room.hazards.length, 4, 'Expected 4 hazards in the maze');
  assert.deepEqual(room.hazards.map((hazard) => hazard.mesh.name),
    ['Gloink_pin', 'Gloink_star', 'Gloink_cube', 'Gloink_circle']);
  assert.ok(room.hazards[0].radius >= 1, 'catch radius sized to the bigger gloinks');

  // Per frame update animates both gloinks without errors
  room.update(0.016, room.spawn);
});

/** The floor point at a maze cell's centre (same layout as mazeRoom.js). */
function centre(cell) {
  const { cols, rows, cellSize } = MAZE;
  return { x: -cols * cellSize / 2 + cellSize / 2 + cell.c * cellSize, z: -rows * cellSize / 2 + cellSize / 2 + cell.r * cellSize };
}

/** A gloink's maze cell, and the open neighbours a step may move it to. */
function cellOf(room, position) {
  return room.mazePlacement.cellAt(position);
}
function openBetween(a, b) {
  if (a === b) return true;
  const dr = b.r - a.r, dc = b.c - a.c;
  if (Math.abs(dr) + Math.abs(dc) !== 1) return false;
  const wall = dr === -1 ? 'top' : dr === 1 ? 'bottom' : dc === -1 ? 'left' : 'right';
  return !a.walls[wall];
}

/** A cell along the gloink's line of sight: up to `cells` straight ahead through open sides. */
function cellAhead(room, gloink, cells) {
  const yaw = gloink.rotation.y;
  const step = Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw))
    ? { dr: 0, dc: Math.sign(Math.sin(yaw)), wall: Math.sin(yaw) > 0 ? 'right' : 'left' }
    : { dr: Math.sign(Math.cos(yaw)), dc: 0, wall: Math.cos(yaw) > 0 ? 'bottom' : 'top' };
  let cell = cellOf(room, gloink.position);
  for (let i = 0; i < cells; i++) {
    if (cell.walls[step.wall]) break;
    cell = room.maze.cells[cell.r + step.dr][cell.c + step.dc];
  }
  return cell;
}

test('a gloink that sees Pomni follows her through open corridors, never a wall', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const chase = room.gloinkChases[0];
  const gloink = room.hazards[0].mesh;
  const her = centre(cellAhead(room, gloink, 2));

  const start = gloink.position.clone();
  let cell = cellOf(room, gloink.position);
  for (let i = 0; i < 60; i++) {
    room.update(1 / 30, her);
    const now = cellOf(room, gloink.position);
    assert.ok(openBetween(cell, now), `moved from (${cell.r},${cell.c}) to (${now.r},${now.c}) through a wall`);
    cell = now;
  }
  assert.equal(chase.state, 'chase', 'she is right ahead of it with no wall between');
  assert.ok(gloink.position.distanceTo(new THREE.Vector3(her.x, 0, her.z)) < start.distanceTo(new THREE.Vector3(her.x, 0, her.z)),
    'it closed in on her');
});

test('losing sight of her sends it to where she was, then back to its patrol', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const chase = room.gloinkChases[0];
  const gloink = room.hazards[0].mesh;
  const seenAt = centre(cellAhead(room, gloink, 2));
  room.update(1 / 30, seenAt);
  assert.equal(chase.state, 'chase');

  // She's gone: the far corner of the maze, many walls away.
  const gone = centre(room.maze.cells[room.maze.rows - 1][room.maze.cols - 1]);
  const states = new Set();
  let cell = cellOf(room, gloink.position);
  for (let i = 0; i < 30 * 40 && chase.state !== 'patrol'; i++) {
    room.update(1 / 30, gone);
    states.add(chase.state);
    const now = cellOf(room, gloink.position);
    assert.ok(openBetween(cell, now), 'never through a wall while searching or returning');
    cell = now;
  }
  assert.ok(states.has('search') && states.has('return'), `went searching then returned: ${[...states]}`);
  assert.equal(chase.state, 'patrol', 'back on its patrol');
});

test('a gloink ignores her while she is not in play (menus, dialogue)', async () => {
  const room = await loadMazeRoom(null, { seed: 42, mazeItems: createMazeItems() });
  const gloink = room.hazards[0].mesh;
  const her = centre(cellAhead(room, gloink, 1));
  for (let i = 0; i < 30; i++) room.update(1 / 30, her, { playerActive: false });
  assert.equal(room.gloinkChases[0].state, 'patrol');
});

test('the two roaming gloinks guard side branches, clear of the start, keepsakes and each other', async () => {
  for (let seed = 1; seed <= 60; seed++) {
    const room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
    assert.equal(room.hazards.length, 4, `seed ${seed}: all four gloinks placed`);
    const onRoute = new Set(room.maze.path.map(({ r, c }) => room.maze.cells[r][c]));
    const fromStart = new Map(room.mazePlacement.reachableFrom(room.maze.start).map(({ cell, distance }) => [cell, distance]));
    const [cube, circle] = room.hazards.slice(2).map(({ mesh }) => room.mazePlacement.cellAt(mesh.position));
    for (const cell of [cube, circle]) {
      assert.ok(!onRoute.has(cell), `seed ${seed}: roamer starts off the start->exit route`);
      assert.ok(fromStart.get(cell) >= 5, `seed ${seed}: roamer starts at least 5 steps from the start`);
    }
    assert.notEqual(cube, circle, `seed ${seed}: roamers start in different cells`);
  }
});

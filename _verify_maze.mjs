// Exercises generateMaze()'s connectivity and the new loop-adding pass.
// Run: node --test _verify_maze.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateMaze } from './src/maze/generateMaze.js';
import { createSeededRandom as makeRng } from './src/maze/seededRandom.js';
import { getReachableCells, selectMazeCell } from './src/maze/mazePlacements.js';
import { createMazeItems, createMazeSearch, MAZE_FINDABLES, MAZE_SEARCH_SECONDS } from './src/state/mazeItems.js';

test('maze item counts and pickup callbacks advance once per unique keepsake', () => {
  const pickups = [];
  const items = createMazeItems({ onCollect: (...args) => pickups.push(args) });
  assert.equal(items.totalFound(), 0);
  for (const [index, { id }] of MAZE_FINDABLES.entries()) {
    items.collect(id);
    items.collect(id);
    assert.equal(items.totalFound(), index + 1);
    assert.equal(items.hasCollected(id), true);
  }
  assert.deepEqual(pickups, MAZE_FINDABLES.map(({ id }, index) => [id, index + 1, 2]));
});

test('maze item reset starts a fresh attempt without changing another run', () => {
  const items = createMazeItems(), otherRun = createMazeItems();
  for (const { id } of MAZE_FINDABLES) items.collect(id);
  otherRun.collect(MAZE_FINDABLES[0].id);
  items.reset();
  assert.equal(items.totalFound(), 0);
  assert.equal(otherRun.totalFound(), 1);
  for (const { id } of MAZE_FINDABLES) assert.equal(items.hasCollected(id), false);
  items.collect(MAZE_FINDABLES[0].id);
  assert.equal(items.totalFound(), 1);
});

test('a maze search starts with 300 seconds and an idle clock never advances', () => {
  const search = createMazeSearch();
  assert.equal(search.status, 'idle');
  assert.equal(search.timeLeft, null);
  assert.equal(search.tick(999, { playable: true }), null);
  search.start();
  assert.equal(MAZE_SEARCH_SECONDS, 300);
  assert.equal(search.timeLeft, 300);
  assert.equal(search.status, 'searching');
});

test('the maze clock freezes when gameplay is blocked, including at Jax', () => {
  const search = createMazeSearch(); search.start();
  search.tick(10, { playable: true });
  for (let i = 0; i < 5; i++) {
    assert.equal(search.tick(999, { playable: false, allItems: true, atJax: true }), null);
    assert.equal(search.timeLeft, 290);
    assert.equal(search.status, 'searching');
  }
});

test('maze expiry is clamped to zero and emitted only once', () => {
  const search = createMazeSearch(); search.start();
  assert.equal(search.tick(299, { playable: true }), null);
  assert.equal(search.timeLeft, 1);
  assert.equal(search.tick(1, { playable: true }), 'expired');
  assert.equal(search.timeLeft, 0);
  assert.equal(search.status, 'expired');
  assert.equal(search.tick(999, { playable: true }), null);
  assert.equal(search.tick(0, { playable: true, allItems: true, atJax: true }), null);
  assert.equal(search.status, 'expired');
});

test('maze search needs both all items and a current Jax arrival', () => {
  const search = createMazeSearch(); search.start();
  assert.equal(search.tick(1, { playable: true, atJax: true }), null);
  assert.equal(search.tick(1, { playable: true, allItems: true }), null);
  assert.equal(search.timeLeft, 298);
  assert.equal(search.status, 'searching');
  assert.equal(search.tick(0, { playable: true, allItems: true, atJax: true }), 'reached');
  assert.equal(search.status, 'reached');
  assert.equal(search.tick(999, { playable: true }), null);
  assert.equal(search.timeLeft, 298);
});

test('reaching Jax with all items at the deadline wins before expiry', () => {
  const search = createMazeSearch(); search.start(); search.tick(299, { playable: true });
  assert.equal(search.tick(1, { playable: true, allItems: true, atJax: true }), 'reached');
  assert.equal(search.timeLeft, 1);
});

test('clearing and restarting a maze attempt removes expired or reached state', () => {
  const search = createMazeSearch();
  for (const result of ['expired', 'reached']) {
    search.start();
    search.tick(300, { playable: true, allItems: result === 'reached', atJax: result === 'reached' });
    assert.equal(search.status, result);
    search.clear();
    assert.equal(search.timeLeft, null); assert.equal(search.status, 'idle');
    search.start();
    assert.equal(search.timeLeft, 300); assert.equal(search.status, 'searching');
  }
});

test('invalid elapsed values cannot corrupt a running maze clock', () => {
  const search = createMazeSearch(); search.start();
  for (const delta of [-1, NaN, Infinity]) assert.throws(() => search.tick(delta, { playable: true }), /finite and nonnegative/);
  assert.equal(search.timeLeft, 300);
});

test('maze random streams are repeatable, independent and stay in [0, 1)', () => {
  for (const seed of [0, 1, 12345, 0xffffffff]) {
    const first = makeRng(seed), second = makeRng(seed), unrelated = makeRng(seed + 1 >>> 0);
    for (let i = 0; i < 1000; i++) {
      unrelated();
      const value = first();
      assert.equal(value, second());
      assert.ok(value >= 0 && value < 1);
    }
  }
});

test('unsupported seeds are rejected rather than silently changed', () => {
  for (const seed of [undefined, null, '123', true, -1, 0.5, 0x100000000, NaN, Infinity]) {
    assert.throws(() => makeRng(seed), /Maze seed must be an integer/);
  }
});

test('the same seed reproduces every maze wall and the Jax, exit and patrol locations', () => {
  for (const seed of [0, 1, 12345, 0xffffffff]) {
    assert.deepEqual(generateMaze(13, 13, makeRng(seed)), generateMaze(13, 13, makeRng(seed)));
  }
});

test('different seeds produce varied maze layouts', () => {
  const layouts = new Set();
  for (let seed = 0; seed < 20; seed++) {
    layouts.add(JSON.stringify(generateMaze(13, 13, makeRng(seed)).cells));
  }
  assert.equal(layouts.size, 20);
});

function countOpenWalls(cells) {
  // Each interior wall is shared by two cells; count right/bottom once each
  // (same scheme generateMaze's own loop pass uses) so it isn't double-counted.
  let open = 0;
  for (const row of cells) {
    for (const cell of row) {
      if (!cell.walls.right) open++;
      if (!cell.walls.bottom) open++;
    }
  }
  return open;
}

/** Every cell reachable from the start by actually walking through open walls. */
function reachableCount(maze) {
  const { cells, start, rows, cols } = maze;
  const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? cells[r][c] : null);
  const DIRS = [['top', -1, 0], ['right', 0, 1], ['bottom', 1, 0], ['left', 0, -1]];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const [dir, dr, dc] of DIRS) {
      if (cur.walls[dir]) continue;
      const next = at(cur.r + dr, cur.c + dc);
      if (next && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen.size;
}

test('loopDensity 0 produces a perfect maze: exactly one route between any two cells', () => {
  const maze = generateMaze(9, 9, makeRng(1), 0);
  assert.equal(reachableCount(maze), 81, 'every cell reachable');
  // A spanning tree over N cells has exactly N-1 edges; a perfect maze is
  // exactly that, no more.
  assert.equal(countOpenWalls(maze.cells), 80);
});

test('loops add extra connections without breaking connectivity', () => {
  const base = generateMaze(9, 9, makeRng(42), 0);
  const looped = generateMaze(9, 9, makeRng(42), 0.25);
  assert.equal(reachableCount(looped), 81, 'still fully connected');
  assert.ok(countOpenWalls(looped.cells) > countOpenWalls(base.cells),
    `expected more open walls than the base maze (${countOpenWalls(base.cells)}), got ${countOpenWalls(looped.cells)}`);
});

test('higher loop density never removes a passage, only adds them', () => {
  for (let seed = 0; seed < 10; seed++) {
    const sparse = generateMaze(9, 9, makeRng(seed), 0.1);
    const dense = generateMaze(9, 9, makeRng(seed), 0.6);
    assert.ok(countOpenWalls(dense.cells) >= countOpenWalls(sparse.cells), `seed ${seed}`);
  }
});

test('Jax and the exit are never touched by the loop pass, even at full density', () => {
  for (let seed = 0; seed < 10; seed++) {
    const base = generateMaze(9, 9, makeRng(seed), 0);
    const maxed = generateMaze(9, 9, makeRng(seed), 1);
    // Same seed -> same carve -> same BFS -> same exit/Jax cells in both runs.
    assert.deepEqual(maxed.jax.walls, base.jax.walls, `seed ${seed} Jax`);
    assert.deepEqual(maxed.exit.walls, base.exit.walls, `seed ${seed} exit`);
  }
});

test('the start->exit path is still walkable after loops are added', () => {
  const maze = generateMaze(9, 9, makeRng(7), 0.3);
  for (let i = 0; i < maze.path.length - 1; i++) {
    const a = maze.path[i], b = maze.path[i + 1];
    const dr = b.r - a.r, dc = b.c - a.c;
    const dir = dr === -1 ? 'top' : dr === 1 ? 'bottom' : dc === 1 ? 'right' : 'left';
    assert.equal(a.walls[dir], false, `step ${i} of the hazard route is blocked`);
  }
});

test('a bigger grid (13x13) still generates a fully connected maze', () => {
  const maze = generateMaze(13, 13, makeRng(3), 0.12);
  assert.equal(reachableCount(maze), 169);
  assert.notEqual(maze.exit, maze.start);
  assert.notEqual(maze.jax, maze.exit);
});

// The two adjacent top-left cells are separated by a wall. Reaching the
// second requires five passages around a U; the bottom row is disconnected.
function corridorFixture() {
  const cells = Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, c) => ({
    r, c, walls: { top: true, right: true, bottom: true, left: true },
  })));
  for (const [r, c, wall, nr, nc, opposite] of [
    [0, 0, 'bottom', 1, 0, 'top'],
    [1, 0, 'right', 1, 1, 'left'],
    [1, 1, 'right', 1, 2, 'left'],
    [1, 2, 'top', 0, 2, 'bottom'],
    [0, 2, 'left', 0, 1, 'right'],
  ]) {
    cells[r][c].walls[wall] = false;
    cells[nr][nc].walls[opposite] = false;
  }
  return { rows: 3, cols: 3, cells };
}

test('reachable cells measure shortest corridor distances from any player cell without mutation', () => {
  const maze = corridorFixture();
  const before = JSON.stringify(maze);
  assert.deepEqual(getReachableCells(maze, { r: 0, c: 0 }).map(({ cell, distance }) => [cell.r, cell.c, distance]), [
    [0, 0, 0], [1, 0, 1], [1, 1, 2], [1, 2, 3], [0, 2, 4], [0, 1, 5],
  ]);
  const reversed = getReachableCells(maze, { r: 0, c: 1 });
  assert.equal(reversed.find(({ cell }) => cell === maze.cells[0][0]).distance, 5);
  assert.equal(getReachableCells(maze, { r: 2, c: 0 }).length, 1);
  assert.equal(JSON.stringify(maze), before);
});

test('distance queries use current loop shortcuts and never traverse a closed wall', () => {
  const maze = corridorFixture();
  maze.cells[0][0].walls.right = false;
  // An opening on just one side is not a walkable passage.
  assert.equal(getReachableCells(maze, { r: 0, c: 0 }).find(({ cell }) => cell === maze.cells[0][1]).distance, 5);
  maze.cells[0][1].walls.left = false;
  assert.equal(getReachableCells(maze, { r: 0, c: 0 }).find(({ cell }) => cell === maze.cells[0][1]).distance, 1);
});

test('placement limits are inclusive corridor distances and exclusions compare coordinates', () => {
  const maze = corridorFixture(), from = { r: 0, c: 0 };
  const nearby = selectMazeCell(maze, from, { minDistance: 1, maxDistance: 1, rng: () => 0 });
  assert.equal(nearby.cell, maze.cells[1][0]);
  const far = selectMazeCell(maze, from, {
    minDistance: 5, maxDistance: 5,
    // Excluded spawn cells remain usable as intermediate walking passages.
    excludedCells: new Set([{ r: 1, c: 0 }]), rng: () => 0,
  });
  assert.equal(far.cell, maze.cells[0][1]);
  assert.equal(far.distance, 5);
  assert.equal(selectMazeCell(maze, from, {
    minDistance: 5, maxDistance: 5, excludedCells: [{ r: 0, c: 1 }],
  }), null);
  assert.equal(selectMazeCell(maze, from, { maxDistance: 0 }).cell, maze.cells[0][0]);
});

test('impossible placements return null without consuming randomness or falling back to the player', () => {
  const maze = corridorFixture(), from = { r: 0, c: 0 };
  const rng = () => assert.fail('an impossible selection consumed randomness');
  assert.equal(selectMazeCell(maze, from, { minDistance: 6, rng }), null);
  assert.equal(selectMazeCell(maze, from, { excludedCells: maze.cells.flat(), rng }), null);
  assert.equal(selectMazeCell(maze, { r: 2, c: 0 }, { minDistance: 1, rng }), null);
});

test('invalid player cells, distance limits, exclusions and random values fail explicitly', () => {
  const maze = corridorFixture(), from = { r: 0, c: 0 };
  for (const point of [null, { r: -1, c: 0 }, { r: 3, c: 0 }, { r: 0.5, c: 0 }]) {
    assert.throws(() => getReachableCells(maze, point), /inside the grid/);
    assert.throws(() => selectMazeCell(maze, point), /inside the grid/);
  }
  for (const options of [
    { minDistance: -1 }, { minDistance: NaN }, { maxDistance: -1 },
    { minDistance: 4, maxDistance: 3 }, { maxDistance: 1.5 },
  ]) assert.throws(() => selectMazeCell(maze, from, options), /Maze distances/);
  assert.throws(() => selectMazeCell(maze, from, { excludedCells: [{ r: 0, c: 3 }] }), /inside the grid/);
  for (const value of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => selectMazeCell(maze, from, { rng: () => value }), /Maze random values/);
  }
});

test('100 seeded final mazes retain reachability, honour placement limits and use loop distances', () => {
  let shortcutsSeen = 0;
  for (let seed = 0; seed < 100; seed++) {
    const base = generateMaze(13, 13, makeRng(seed), 0);
    const maze = generateMaze(13, 13, makeRng(seed), 0.3);
    const from = { r: seed % 13, c: seed * 7 % 13 };
    const baseDistances = new Map(getReachableCells(base, from).map(({ cell, distance }) => [`${cell.r},${cell.c}`, distance]));
    const reached = getReachableCells(maze, from);
    assert.equal(reached.length, 169, `seed ${seed}`);
    for (const { cell, distance } of reached) {
      const before = baseDistances.get(`${cell.r},${cell.c}`);
      assert.ok(distance <= before, `seed ${seed}: a loop increased distance`);
      if (distance < before) shortcutsSeen++;
    }
    const excludedCells = [maze.start, maze.exit, maze.jax, from];
    const selected = selectMazeCell(maze, from, {
      minDistance: 2, maxDistance: 8, excludedCells, rng: makeRng(seed),
    });
    assert.ok(selected, `seed ${seed}: no candidate`);
    assert.ok(selected.distance >= 2 && selected.distance <= 8);
    assert.ok(!excludedCells.includes(selected.cell));
    assert.notDeepEqual(selected.cell, from);
    assert.deepEqual(selected, selectMazeCell(maze, from, {
      minDistance: 2, maxDistance: 8, excludedCells, rng: makeRng(seed),
    }));
  }
  assert.ok(shortcutsSeen > 0, 'loop shortcuts must actually be reflected in measured distances');
});


// Exercise the actual room's layout pass, independently of the legacy generator.
test('funhouse layouts preserve circulation, pockets, hazard path and a remote Jax chamber across 100 seeds', async () => {
  const { shapeMazeEnvironment } = await import('./src/maze/mazeEnvironmentLayout.js');
  for (const seed of [123, 0xffffffff, ...Array.from({ length: 100 }, (_, i) => i)]) {
    const maze = generateMaze(13, 13, makeRng(seed), 0);
    const path = maze.path.map(cell => [cell.r, cell.c]);
    const exit = maze.exit;
    const layout = shapeMazeEnvironment(maze);
    const replay = generateMaze(13, 13, makeRng(seed), 0);
    assert.deepEqual(shapeMazeEnvironment(replay), layout, `seed ${seed}: layout metadata`);
    assert.deepEqual(replay, maze, `seed ${seed}: walls and anchors`);
    assert.equal(maze.start, maze.cells[0][0]);
    assert.equal(maze.exit, exit);
    assert.deepEqual(maze.path.map(cell => [cell.r, cell.c]), path);
    const reached = getReachableCells(maze, maze.start);
    assert.equal(reached.length, 169);
    assert.ok(reached.find(entry => entry.cell === maze.jax).distance >= layout.minimumJaxDistance);
    assert.equal(layout.entrance.length, 4);
    assert.equal(layout.chamber.length, 4);
    assert.ok(layout.chamber.includes(maze.jax) && layout.chamber.includes(maze.jaxNeighbor));
    assert.equal(Math.abs(maze.jax.r - maze.jaxNeighbor.r) + Math.abs(maze.jax.c - maze.jaxNeighbor.c), 1);
    assert.ok(layout.loops.length >= 2, `seed ${seed}: at least two intentional circuits`);
    assert.ok(layout.alcoves.length >= 2);
    const openBetween = (a, b) => {
      const wall = a.r < b.r ? 'bottom' : a.r > b.r ? 'top' : a.c < b.c ? 'right' : 'left';
      assert.equal(a.walls[wall], false);
    };
    for (const loop of layout.loops) {
      assert.equal(new Set(loop).size, 8);
      loop.forEach((cell, i) => openBetween(cell, loop[(i + 1) % loop.length]));
    }
    maze.path.slice(1).forEach((cell, i) => openBetween(maze.path[i], cell));
    for (const cell of layout.alcoves) {
      assert.equal(Object.values(cell.walls).filter(wall => !wall).length, 1);
      assert.ok(!layout.patrolCells.includes(cell) && !layout.chamber.includes(cell) && !layout.entrance.includes(cell));
    }
    for (const row of maze.cells) for (const cell of row) {
      if (cell.r === 0) assert.equal(cell.walls.top, true);
      if (cell.c === 0) assert.equal(cell.walls.left, true);
      if (cell.r === 12) assert.equal(cell.walls.bottom, true);
      if (cell.c === 12) assert.equal(cell.walls.right, true);
      if (cell.c < 12) assert.equal(cell.walls.right, maze.cells[cell.r][cell.c + 1].walls.left);
      if (cell.r < 12) assert.equal(cell.walls.bottom, maze.cells[cell.r + 1][cell.c].walls.top);
    }
    for (const region of [layout.entrance, layout.chamber]) for (const cell of region) for (const other of region) {
      if (Math.abs(cell.r - other.r) + Math.abs(cell.c - other.c) === 1) openBetween(cell, other);
    }
  }
});

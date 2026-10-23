// Exercises generateMaze()'s connectivity and the new loop-adding pass.
// Run: node --test _verify_maze.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateMaze } from './src/maze/generateMaze.js';

/** Deterministic PRNG so a test can compare two runs built from the same
 * base maze (one with loops, one without) rather than two unrelated ones. */
function makeRng(seed) {
  let s = seed;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32; };
}

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

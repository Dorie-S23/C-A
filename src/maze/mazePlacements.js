const DIRECTIONS = [
  { wall: 'top', opposite: 'bottom', dr: -1, dc: 0 },
  { wall: 'right', opposite: 'left', dr: 0, dc: 1 },
  { wall: 'bottom', opposite: 'top', dr: 1, dc: 0 },
  { wall: 'left', opposite: 'right', dr: 0, dc: -1 },
];

function cellAt(maze, point) {
  if (!Number.isInteger(point?.r) || !Number.isInteger(point?.c)
    || point.r < 0 || point.r >= maze.rows || point.c < 0 || point.c >= maze.cols) {
    throw new RangeError('Maze cell must have integer r and c coordinates inside the grid.');
  }
  return maze.cells[point.r][point.c];
}

/**
 * Reachable cells and shortest corridor distances from any {r, c} cell.
 * Distance counts passages (the origin is zero). Read the current walls on
 * every call, including loops added after the original start/exit path.
 * Returned cells belong to maze.cells; querying never changes the maze.
 */
export function getReachableCells(maze, from) {
  const origin = cellAt(maze, from);
  const seen = new Set([origin]);
  const reached = [{ cell: origin, distance: 0 }];
  for (let i = 0; i < reached.length; i++) {
    const { cell, distance } = reached[i];
    for (const { wall, opposite, dr, dc } of DIRECTIONS) {
      if (cell.walls[wall]) continue;
      const neighbor = maze.cells[cell.r + dr]?.[cell.c + dc];
      if (!neighbor || neighbor.walls[opposite] || seen.has(neighbor)) continue;
      seen.add(neighbor);
      reached.push({ cell: neighbor, distance: distance + 1 });
    }
  }
  return reached;
}

/**
 * Pick a reachable cell within inclusive corridor-distance limits.
 * excludedCells accepts an iterable of {r, c} coordinates, not object identity.
 * Return {cell, distance}, or null if no cell meets the constraints. A failed
 * selection does not consume randomness. Invalid cells, distance limits and
 * random values throw a range error.
 */
export function selectMazeCell(maze, from, {
  minDistance = 0, maxDistance = Infinity, excludedCells = [], rng = Math.random,
} = {}) {
  if (!Number.isInteger(minDistance) || minDistance < 0
    || (maxDistance !== Infinity && (!Number.isInteger(maxDistance) || maxDistance < minDistance))) {
    throw new RangeError('Maze distances must be non-negative integers with maxDistance >= minDistance (or Infinity).');
  }
  const excluded = new Set();
  for (const point of excludedCells) excluded.add(cellAt(maze, point));
  const candidates = getReachableCells(maze, from).filter(({ cell, distance }) =>
    distance >= minDistance && distance <= maxDistance && !excluded.has(cell));
  if (!candidates.length) return null;
  const random = rng();
  if (!Number.isFinite(random) || random < 0 || random >= 1) {
    throw new RangeError('Maze random values must be in [0, 1).');
  }
  return candidates[Math.floor(random * candidates.length)];
}

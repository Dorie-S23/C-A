/**
 * Grid-based maze generator using an iterative recursive-backtracker, plus a
 * BFS pass to pick meaningful spots for the level's two objectives:
 *  - `exit`: the cell farthest (by path distance) from the start, so the
 *    player has to traverse most of the maze to finish.
 *  - `jax`: the farthest dead-end that isn't the exit, so the two objectives
 *    sit in different branches instead of overlapping.
 *
 * Cells are addressed [row][col]; each cell tracks which of its four sides
 * still has a wall. Carving a passage between two cells clears the matching
 * wall on both sides, so the wall list built from this grid never has
 * duplicate/mismatched segments.
 */
export function generateMaze(cols, rows, rng = Math.random) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push({
        r,
        c,
        walls: { top: true, right: true, bottom: true, left: true },
        visited: false,
      });
    }
    cells.push(row);
  }

  const at = (r, c) => (r >= 0 && r < rows && c >= 0 && c < cols ? cells[r][c] : null);
  const DIRECTIONS = [
    { dir: 'top', opp: 'bottom', dr: -1, dc: 0 },
    { dir: 'right', opp: 'left', dr: 0, dc: 1 },
    { dir: 'bottom', opp: 'top', dr: 1, dc: 0 },
    { dir: 'left', opp: 'right', dr: 0, dc: -1 },
  ];

  const start = cells[0][0];
  start.visited = true;
  const stack = [start];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const options = DIRECTIONS
      .map(({ dir, opp, dr, dc }) => ({ dir, opp, cell: at(current.r + dr, current.c + dc) }))
      .filter(({ cell }) => cell && !cell.visited);

    if (options.length === 0) {
      stack.pop();
      continue;
    }

    const { dir, opp, cell: next } = options[Math.floor(rng() * options.length)];
    current.walls[dir] = false;
    next.walls[opp] = false;
    next.visited = true;
    stack.push(next);
  }

  // BFS from the start to find path distances (used to place the exit and
  // Jax) and parent links (used to reconstruct the start->exit route, which
  // the patrolling hazard walks a stretch of).
  const dist = cells.map((row) => row.map(() => -1));
  const parent = cells.map((row) => row.map(() => null));
  dist[0][0] = 0;
  const queue = [start];
  let farthest = start;

  while (queue.length > 0) {
    const cur = queue.shift();
    if (dist[cur.r][cur.c] > dist[farthest.r][farthest.c]) farthest = cur;

    for (const { dir, dr, dc } of DIRECTIONS) {
      if (cur.walls[dir]) continue;
      const next = at(cur.r + dr, cur.c + dc);
      if (next && dist[next.r][next.c] === -1) {
        dist[next.r][next.c] = dist[cur.r][cur.c] + 1;
        parent[next.r][next.c] = cur;
        queue.push(next);
      }
    }
  }

  const exit = farthest;

  const path = [exit];
  let step = exit;
  while (parent[step.r][step.c]) {
    step = parent[step.r][step.c];
    path.push(step);
  }
  path.reverse(); // now start -> exit

  const isDeadEnd = (cell) => Object.values(cell.walls).filter((wall) => !wall).length === 1;
  const deadEnds = cells.flat().filter((cell) => cell !== exit && isDeadEnd(cell));
  const jax = deadEnds.length > 0
    ? deadEnds.reduce((best, cell) => (dist[cell.r][cell.c] > dist[best.r][best.c] ? cell : best))
    : cells.flat()
      .filter((cell) => cell !== exit && cell !== start)
      .reduce((best, cell) => (dist[cell.r][cell.c] > dist[best.r][best.c] ? cell : best), start);

  // Jax's dead end has exactly one open side; its patrol is a short walk
  // between its own cell and that single neighbor.
  const jaxOpenDir = DIRECTIONS.find(({ dir }) => !jax.walls[dir]);
  const jaxNeighbor = jaxOpenDir ? at(jax.r + jaxOpenDir.dr, jax.c + jaxOpenDir.dc) : jax;

  return { cols, rows, cells, start, exit, jax, jaxNeighbor, path };
}

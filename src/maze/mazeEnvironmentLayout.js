import { getReachableCells } from './mazePlacements.js';

const DIRECTIONS = [
  ['top', 'bottom', -1, 0], ['right', 'left', 0, 1],
  ['bottom', 'top', 1, 0], ['left', 'right', 0, -1],
];
const degree = cell => Object.values(cell.walls).filter(wall => !wall).length;

/** Layout only: open passages before meshes/colliders/props are built.
 * Keeps the generator's exit and original hazard path. No RNG calls: the
 * seed's generation and collectible streams remain independent of dressing.
 */
export function shapeMazeEnvironment(maze) {
  const { cells, start, jax, jaxNeighbor, exit, path, rows, cols } = maze;
  const at = (r, c) => cells[r]?.[c];
  const distances = () => new Map(getReachableCells(maze, start).map(entry => [entry.cell, entry.distance]));
  let minimumJaxDistance;
  const mid = Math.floor(path.length / 2);
  const patrolCells = path.slice(Math.max(0, mid - 1), Math.min(path.length, mid + 2));
  const protectedCells = new Set([start, jax, jaxNeighbor, exit, ...patrolCells]);

  function edgesWithin(region, perimeterOnly = false) {
    const members = new Set(region);
    const edges = [];
    for (const cell of region) for (const [wall, opposite, dr, dc] of DIRECTIONS.slice(1, 3)) {
      const next = at(cell.r + dr, cell.c + dc);
      if (!members.has(next)) continue;
      if (perimeterOnly) {
        const rs = region.map(c => c.r), cs = region.map(c => c.c);
        const onBorder = c => c.r === Math.min(...rs) || c.r === Math.max(...rs)
          || c.c === Math.min(...cs) || c.c === Math.max(...cs);
        if (!onBorder(cell) || !onBorder(next)) continue;
      }
      edges.push([cell, wall, next, opposite]);
    }
    return edges;
  }
  function openSafely(edges, apply = true) {
    const changed = edges.filter(([cell, wall]) => cell.walls[wall]);
    changed.forEach(([a, wall, b, opposite]) => { a.walls[wall] = b.walls[opposite] = false; });
    const distance = distances().get(maze.jax);
    if (distance < minimumJaxDistance || !apply) {
      changed.forEach(([a, wall, b, opposite]) => { a.walls[wall] = b.walls[opposite] = true; });
    }
    return { valid: distance >= minimumJaxDistance, distance, changed: changed.length };
  }
  const rectangle = (r, c, size) => Array.from({ length: size * size }, (_, i) => at(r + Math.floor(i / size), c + i % size));

  // A consistent vestibule, with no furniture or collision in the arch space.
  const entrance = rectangle(0, 0, 2);
  edgesWithin(entrance).forEach(([a, wall, b, opposite]) => {
    a.walls[wall] = b.walls[opposite] = false;
  });

  // Choose a remote 2x2 destination on the final graph, rather than forcing
  // a room around a random dead end whose adjacent cells may be near spawn.
  // Only add openings: the exit and original hazard route remain intact.
  const chambers = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const region = rectangle(r, c, 2);
    if (region.some(cell => entrance.includes(cell) || cell === exit || patrolCells.includes(cell))) continue;
    const edges = edgesWithin(region);
    const changed = edges.filter(([a, wall]) => a.walls[wall]);
    changed.forEach(([a, wall, b, opposite]) => { a.walls[wall] = b.walls[opposite] = false; });
    const measured = distances();
    const destination = [...region].sort((a, b) => measured.get(b) - measured.get(a))[0];
    chambers.push({ region, destination, distance: measured.get(destination) });
    changed.forEach(([a, wall, b, opposite]) => { a.walls[wall] = b.walls[opposite] = true; });
  }
  chambers.sort((a, b) => b.distance - a.distance);
  const best = chambers[0];
  if (!best) throw new Error('Maze has no room for the funhouse destination.');
  const chamber = best.region;
  edgesWithin(chamber).forEach(([a, wall, b, opposite]) => { a.walls[wall] = b.walls[opposite] = false; });
  maze.jax = best.destination;
  const measured = distances();
  maze.jaxNeighbor = chamber.filter(cell => Math.abs(cell.r - maze.jax.r) + Math.abs(cell.c - maze.jax.c) === 1)
    .sort((a, b) => measured.get(a) - measured.get(b))[0];
  minimumJaxDistance = Math.max(18, Math.ceil(best.distance * 0.7));
  chamber.forEach(cell => protectedCells.add(cell));
  entrance.forEach(cell => protectedCells.add(cell));

  const alcoves = getReachableCells(maze, start)
    .filter(({ cell, distance }) => !protectedCells.has(cell) && degree(cell) === 1 && distance >= 6)
    .sort((a, b) => b.distance - a.distance || a.cell.r - b.cell.r || a.cell.c - b.cell.c)
    .slice(0, 6).map(entry => entry.cell);
  alcoves.forEach(cell => protectedCells.add(cell));

  // Planned 3x3 perimeter circuits, spread across the maze. Unlike random
  // wall removal these provide complete, broad-cornered future patrol loops.
  const candidates = [];
  for (let r = 1; r < rows - 2; r++) for (let c = 1; c < cols - 2; c++) {
    const region = rectangle(r, c, 3);
    if (region.some(cell => protectedCells.has(cell))) continue;
    const perimeter = region.filter(cell => cell.r !== r + 1 || cell.c !== c + 1);
    const edges = edgesWithin(region, true);
    const result = openSafely(edges, false);
    if (result.valid) candidates.push({ perimeter, edges, r, c });
  }
  const loops = [];
  const used = new Set();
  while (loops.length < 3) {
    const candidate = candidates.filter(item => !item.perimeter.some(cell => used.has(cell)))
      .sort((a, b) => {
        const spread = item => loops.length ? Math.min(...loops.map(loop =>
          Math.abs(item.r - loop[0].r) + Math.abs(item.c - loop[0].c))) : -(Math.abs(item.r - 5) + Math.abs(item.c - 5));
        return spread(b) - spread(a) || a.r - b.r || a.c - b.c;
      }).find(item => openSafely(item.edges, false).valid);
    if (!candidate) break;
    openSafely(candidate.edges);
    // Ordered clockwise so this can later be used as a closed patrol circuit.
    const { r, c } = candidate;
    const loop = [[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0],[1,0]].map(([dr, dc]) => at(r + dr, c + dc));
    loops.push(loop);
    candidate.perimeter.forEach(cell => used.add(cell));
  }
  return { entrance, chamber, alcoves, loops, patrolCells, minimumJaxDistance };
}

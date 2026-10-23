# Level 3 maze seeds and reachable placements

Each maze load chooses an unsigned 32-bit seed. One private random stream drives
the maze walls and loops, initial Jax/exit locations, item placement and prop
rotations. Loading without a seed still chooses a fresh random seed each time.

## Reproduce a layout in development

1. Run `npm run dev` (`npm.cmd run dev` in Windows PowerShell if needed).
2. Open `http://localhost:5173/?dev=1&mazeSeed=12345`.
3. Select **Maze (raw, no intro)** to inspect it directly, or play **Level 3**
   to reach it through the existing intro.

The `mazeSeed` URL override works only on the development server. It accepts
decimal integers from `0` through `4294967295`, including zero. Invalid values
produce a console warning and fall back to a fresh random seed. Remove the
parameter to return to varied layouts.

To record the seed of a loaded maze, run this in the browser developer console:

```js
const { getOpeningDiagnostics } = await import('/src/main.js');
getOpeningDiagnostics().mazeSeed;
```

This read-only diagnostic returns the current seed while a maze is loaded, and
`null` in other rooms. Use that number in the URL to recreate a reported maze.
There is no seed display in the player's HUD.

## Loader API

`loadMazeRoom(onProgress, { mazeItems, seed })` accepts an optional numeric seed
and returns it as `room.mazeSeed`. Unsupported seeds reject the load with a
range error. Callers that omit the option keep the existing random-load flow.

Reproduction assumes the same game version and maze settings. Use a fresh
`mazeItems` state to reproduce both collectibles; previously collected items
remain absent when revisiting with the same state.

## Corridor-distance helpers

`src/maze/mazePlacements.js` exposes two helpers that do not depend on Three.js:

- `getReachableCells(maze, from)` returns an array of `{ cell, distance }`.
  `from` is any valid `{ r, c }` coordinate, including the player's current cell.
  The origin has distance zero; unreachable cells are omitted.
- `selectMazeCell(maze, from, options)` picks a reachable `{ cell, distance }`,
  or returns `null` if no candidate satisfies the constraints.

Both read the current walls, including the generator's final loop passages.
Distances count the shortest number of open passages between cell centres,
rather than straight-line separation. Multiply by `MAZE.cellSize` for the
corresponding centre-to-centre corridor length in world units. A wall must be
open on both sides for a passage to count.

Selection options are:

| Option | Default | Meaning |
| --- | --- | --- |
| `minDistance` | `0` | Inclusive minimum number of passages |
| `maxDistance` | `Infinity` | Inclusive maximum number of passages |
| `excludedCells` | `[]` | Iterable of `{ r, c }` cells where spawning is forbidden |
| `rng` | `Math.random` | Random function returning values in `[0, 1)` |

Exclusions compare coordinates, so coordinate copies and Sets work. They
prevent spawning on a cell without blocking traversal through that cell.
Distance bounds must be non-negative integers (or `Infinity` for the maximum),
with maximum at least minimum. Invalid bounds/cells/random values throw a
`RangeError`. A valid request with no suitable cell returns `null` and consumes
no randomness; it never falls back to the player's cell or a forbidden cell.

## Using the helpers from a loaded room

The loader returns `room.maze` (the final grid) and `room.mazePlacement`:

- `cellAt(position)` converts room-local `{ x, z }` into a grid cell. It returns
  `null` outside the maze or for non-finite coordinates. The current untransformed
  maze uses the same coordinates as the player.
- `reachableFrom(from)` queries the final corridor distances.
- `selectCell(from, options)` accepts the distance limits and extra exclusions
  above, uses the room's private seeded stream, and returns
  `{ cell, distance, position }` or `null`. `position` is a new vector at the cell's
  floor centre.

The room selector always excludes the start, exit, initial Jax cell and approach,
hazard patrol cells, both collectible slots, and the supplied player cell.
Caller exclusions are added to these protections. It does not reserve the result
or move an actor; pass earlier results as extra exclusions when selecting several
destinations. Repeated successful selections advance the room's seeded stream.

For example, a future search controller could request a destination 3–10 passages
away (example limits, not fixed story rules):

```js
const from = room.mazePlacement.cellAt(player.position);
const destination = from && room.mazePlacement.selectCell(from, {
  minDistance: 3,
  maxDistance: 10,
  excludedCells: previousDestinations,
});
if (destination) {
  // A future controller can stage an actor at destination.position.
} else {
  // Handle the absence of a valid destination explicitly.
}
```

Initial collectibles now use the same selector, without imposing additional
story distance limits. Each item slot is reserved once; a collected item's slot
and rotation draw are retained on seeded revisits, keeping the remaining item's
position and rotation stable. Spawn selection guarantees corridor reachability;
it does not test visibility, move actors, start timers, or resolve story phases.

## Verification

```sh
node --test _verify_maze.mjs
node tools/verify_maze_findables.mjs
npm test
npm run build
```

The maze tests cover known corridor distances, disconnected cells, current loop
shortcuts, impossible/invalid requests, and constrained selections across 100
seeds. The real-model findables check compares repeated room loads and checks
actual item/Jax reachability, wall clearance, exclusions and pickups across 32
seeds, as well as replaying a recorded random seed and seeded revisits.

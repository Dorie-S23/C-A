# Reproducing a Level 3 maze

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

## Verification

```sh
node --test _verify_maze.mjs
node tools/verify_maze_findables.mjs
npm test
npm run build
```

The real-model findables check compares repeated room loads, including walls,
Jax, exit, hazard waypoints, collectible positions and rotations. It also checks
replaying a randomly recorded seed and retaining pickups on a seeded revisit.

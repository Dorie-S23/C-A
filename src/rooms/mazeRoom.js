import {createJaxStageBoundary} from './jaxStageBoundary.js';
import * as THREE from 'three';
import { createMazeOverhead } from './mazeOverhead.js';
import { createMazeLoopMarkings } from './mazeLoopMarkings.js';
import { ownMazeShadowPass } from './mazeShadowDepth.js';
import { createMazeShaderEffects } from './mazeShaders.js';
import { createMazeLighting } from './mazeLighting.js';
import { createMazeEnvironment } from './mazeEnvironment.js';
import { generateMaze } from '../maze/generateMaze.js';
import { shapeMazeEnvironment } from '../maze/mazeEnvironmentLayout.js';
import { createSeededRandom } from '../maze/seededRandom.js';
import { findMazePath, getReachableCells, selectMazeCell } from '../maze/mazePlacements.js';
import { loadJax } from '../characters/jax.js';
import { loadGloinks } from '../characters/gloink.js';
import { createGloinkChase } from '../characters/gloinkChase.js';
import { createBowlingBall, createHotChocolateMug, placeMazeFindable, pulseGlow } from '../props/mazeFindables.js';
import { applyJaxGlitch } from '../shaders/jaxGlitch.js';

// How far in front of his nook's back wall he paces.
const JAX_FROM_WALL = 1.1;

// Exported so main.js can size the player's outer bounds without duplicating
// numbers, the same way room.js exposes ROOM.
// Up from 9x9 — more room for the search objects to actually hide in, and
// more separation between the spawn, Jax, the exit and the hazard's route.
// Traversal time hasn't been played live at this size yet; if it drags,
// cols/rows is the one number to pull back down.
export const MAZE = {
  cols: 13,
  rows: 13,
  cellSize: 4.5, // clear corridor width = cellSize - wallThickness (~4.3 units)
  wallHeight: 3,
  wallThickness: 0.2,
};


function createCheckerTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#17182d';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#eae6e2';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  ctx.strokeStyle = '#45485f'; ctx.lineWidth = 1.4;
  for (const x of [0,size/2]) for (const y of [0,size/2]) ctx.strokeRect(x,y,size/2,size/2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MAZE.cols * 2, MAZE.rows * 2);
  return texture;
}

/**
 * Builds the level-3 maze. Loads the real Jax model (the same rig/run-cycle
 * the Pre-Level-1 hallway cutscene uses) before building, replacing what
 * used to be a placeholder cylinder marking his spot.
 *
 * @param {Function} [onProgress]
 * @param {{ mazeItems?: object, seed?: number }} [options] Omit seed for a fresh
 *   random maze; pass the returned mazeSeed to reproduce it on a fresh run.
 * @returns {Promise<{ mazeSeed: number, maze: object, mazePlacement: object,
 *   group: THREE.Group, bounds: THREE.Box3, spawn: THREE.Vector3,
 *   spawnFacing: number, colliders: THREE.Box3[],
 *   triggers: { jax: THREE.Box3, exit: THREE.Box3 },
 *   movers: Array<{ mesh: THREE.Object3D, waypoints: THREE.Vector3[], speed: number,
 *     targetIndex: number, direction: number, spin?: boolean }>,
 *   hazards: Array<{ mesh: THREE.Object3D, radius: number }>,
 *   interactables: Array,
 *   update: (deltaSeconds: number, playerPosition: THREE.Vector3) => void }>}
 */
export async function loadMazeRoom(onProgress, {
  mazeItems, seed = Math.floor(Math.random() * 0x100000000),
} = {}) {
  // Resolve the seed before loading assets. All layout/prop randomness uses
  // this private stream, independent of other rooms and Three.js internals.
  const rng = createSeededRandom(seed);
  const [jaxApi, gloinkApi] = await Promise.all([
    loadJax(),
    loadGloinks(),
  ]);
  onProgress?.(1);
  return buildMaze(jaxApi, gloinkApi, mazeItems, seed, rng);
}

function buildMaze(jaxApi, gloinkApi, mazeItems, seed, rng) {
  const { cols, rows, cellSize, wallHeight, wallThickness } = MAZE;
  // Preserve the original carved path; the environment pass adds deliberate
  // circulation before any wall geometry, collision or placements exist.
  const maze = generateMaze(cols, rows, rng, 0);
  const environmentLayout = shapeMazeEnvironment(maze);

  const group = new THREE.Group();
  group.name = 'MazeRoom';

  const width = cols * cellSize;
  const depth = rows * cellSize;
  const originX = -width / 2 + cellSize / 2;
  const originZ = -depth / 2 + cellSize / 2;
  const cellCenter = (r, c) => new THREE.Vector3(originX + c * cellSize, 0, originZ + r * cellSize);

  // Each visit owns its materials/textures so room disposal never invalidates
  // resources held by a later visit.
  const wallMaterialA = new THREE.MeshStandardMaterial({ color: 0xac244b, roughness: 0.75 });
  const wallMaterialB = new THREE.MeshStandardMaterial({ color: 0x252b59, roughness: 0.75 });
  const floorMaterial = new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.65, metalness: 0.04, emissive: 0x17182d, emissiveIntensity: 0.018 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Floor';
  group.add(floor);

  // Every wall mesh doubles as a collider: its Box3 is what main.js checks
  // the player against each frame, so geometry and collision can never
  // drift out of sync the way a hand-modeled mesh + separate collider would.
  const colliders = [];
  // Each wall runs between two grid corners, stopping short of them, and a
  // post fills every corner a wall meets. Walls used to run a thickness
  // past each corner instead, so neighbours overlapped: collinear walls'
  // faces shared a strip, and a wall's end sat flush on the side of the one
  // it met. Coplanar faces of different colours flicker (z-fight) as the
  // camera moves; this way no two surfaces ever share a plane.
  const horizontalWallGeo = new THREE.BoxGeometry(cellSize - wallThickness, wallHeight, wallThickness);
  const verticalWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, cellSize - wallThickness);
  const postGeo = new THREE.BoxGeometry(wallThickness, wallHeight, wallThickness);
  const posts = new Map(); // "x,z" -> corner position
  let wallCount = 0;

  function addBox(geometry, material, position) {
    const box = new THREE.Mesh(geometry, material);
    box.position.set(position.x, wallHeight / 2, position.z);
    box.castShadow = true;
    box.receiveShadow = true;
    group.add(box);
    colliders.push(new THREE.Box3().setFromObject(box));
  }

  function addWall(geometry, position) {
    addBox(geometry, wallCount % 2 === 0 ? wallMaterialA : wallMaterialB, position);
    wallCount++;
    // Its two ends' corners.
    const along = geometry === horizontalWallGeo ? { x: cellSize / 2, z: 0 } : { x: 0, z: cellSize / 2 };
    for (const sign of [-1, 1]) {
      const corner = { x: position.x + sign * along.x, z: position.z + sign * along.z };
      posts.set(`${corner.x.toFixed(3)},${corner.z.toFixed(3)}`, corner);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = maze.cells[r][c];
      const center = cellCenter(r, c);

      if (cell.walls.top) {
        addWall(horizontalWallGeo, { x: center.x, z: center.z - cellSize / 2 });
      }
      if (cell.walls.left) {
        addWall(verticalWallGeo, { x: center.x - cellSize / 2, z: center.z });
      }
      // Only the far edges need their trailing side walled explicitly —
      // every interior wall was already added as the "top"/"left" of its
      // other neighbor.
      if (r === rows - 1 && cell.walls.bottom) {
        addWall(horizontalWallGeo, { x: center.x, z: center.z + cellSize / 2 });
      }
      if (c === cols - 1 && cell.walls.right) {
        addWall(verticalWallGeo, { x: center.x + cellSize / 2, z: center.z });
      }
    }
  }

  for (const corner of posts.values()) addBox(postGeo, wallMaterialB, corner);

  group.add(createMazeEnvironment({ maze, layout: environmentLayout, cellCenter, cellSize }));
  group.add(createMazeOverhead({ maze, layout: environmentLayout, cellCenter }));
  group.add(createMazeLoopMarkings({ loops: environmentLayout.loops, cellCenter, cellSize }));

  group.add(createMazeLighting({ maze, layout: environmentLayout, cellCenter }));

  const spawnCenter = cellCenter(maze.start.r, maze.start.c);
  const spawn = new THREE.Vector3(spawnCenter.x, 0, spawnCenter.z);

  // Face the player down whichever side of the start cell is actually open,
  // instead of a fixed world direction — a maze start cell often has a wall
  // on its "default forward" (-Z) side, which previously left new players
  // staring at a flat, close-up wall with no sense that movement was doing
  // anything.
  const START_FACING_DIRECTIONS = [
    { wall: 'top', dx: 0, dz: -1 },
    { wall: 'right', dx: 1, dz: 0 },
    { wall: 'bottom', dx: 0, dz: 1 },
    { wall: 'left', dx: -1, dz: 0 },
  ];
  const openDir = START_FACING_DIRECTIONS.find(({ wall }) => !maze.start.walls[wall])
    ?? START_FACING_DIRECTIONS[0];
  // Derived from PointLockControls' convention that yaw 0 faces -Z: rotating
  // yaw by theta sends that forward vector to (-sin theta, -cos theta) in
  // (x, z), so solving for the desired (dx, dz) gives this atan2.
  const spawnFacing = Math.atan2(-openDir.dx, -openDir.dz);

  // Each of his hiding places is a dead end. He stands near its back wall
  // facing it, his back to the way in. The last (maze.jax, see
  // shapeMazeEnvironment) is his nook, with its scenery; he runs there
  // from two others first (hideouts, chosen once the Gloinks are placed).
  const hideoutAt = (cell) => {
    const open = [[-1, 0, 'top'], [0, 1, 'right'], [1, 0, 'bottom'], [0, -1, 'left']].find(([, , wall]) => !cell.walls[wall]);
    const centre = cellCenter(cell.r, cell.c);
    const wayIn = open ? new THREE.Vector3(open[1], 0, open[0]) : new THREE.Vector3(0, 0, 1);
    return { cell, wayIn, spot: centre.clone().addScaledVector(wayIn, -(cellSize / 2 - JAX_FROM_WALL)),
      facing: Math.atan2(-wayIn.x, -wayIn.z) };
  };
  const jaxSpot = hideoutAt(maze.jax).spot;
  const { jax } = jaxApi;
  group.add(jax);
  ownMazeShadowPass(jax);
  jaxApi.setGlitching(true);
  const jaxGlitch = applyJaxGlitch(jax);
  jaxApi.onStutter = () => jaxGlitch.burst();
  // He's in his first hideout from the moment she arrives (spawnJax below,
  // once the hideouts are chosen). Hidden only while he's out of sight
  // between hideouts (levels/mazeJaxChase.js).
  let jaxSpawned = false;
  jax.visible = false;
  function spawnJax() {
    if (jaxSpawned) return;
    jaxSpawned = true; jax.visible = true;
  }
  let hideouts = [hideoutAt(maze.jax)], jaxStop = 0;
  /** Puts him at hiding place `index`, pacing at its wall. */
  function placeJax(index) {
    jaxStop = Math.min(index, hideouts.length - 1);
    const { spot, facing } = hideouts[jaxStop];
    jax.position.set(spot.x, 0, spot.z);
    jax.rotation.y = facing;
    jaxApi.setRestless(true, facing);
  }
  const atNook = () => jaxStop === hideouts.length - 1;
  // His personal space at the nook, while he's there (she talks to him
  // from outside it).
  const jaxBoundary=createJaxStageBoundary({position:jaxSpot,colliders,
    isUnlocked:()=>!jaxSpawned||!atNook()});
  group.add(jaxBoundary.group);

  const exitCenter = cellCenter(maze.exit.r, maze.exit.c);

  // His found-trigger still covers both his own cell and the approach
  // neighbor's — generous on purpose, same cushion the old patrol-covering
  // zone gave, even though he's standing still here rather than pacing
  // between them (a real walk-cycle patrol needs its own per-frame driver;
  // the generic mover system below just slides a mesh's position, which
  // reads fine for a marker shape but not for a rigged character with legs
  // that never move — left for a later pass).
  const jaxWaypoints = [
    new THREE.Vector3(jaxSpot.x, 0.8, jaxSpot.z),
    new THREE.Vector3(...cellCenter(maze.jaxNeighbor.r, maze.jaxNeighbor.c).setY(0.8).toArray()),
  ];

  // Gloinks keep to the maze's common areas rather than its corridors:
  // one circling each planned loop (environmentLayout.loops: 3x3 rings
  // where several routes cross, signposted overhead), and one pacing the
  // last stretch of the way to Jax's hideout (stopping short of it), so
  // reaching him means dodging it. The main route and side branches are
  // otherwise clear. Placed before the keepsakes so those stay off every
  // Gloink's cells.
  const FINAL_STRETCH_CELLS = 3, SHORT_OF_JAX = 2;
  const toJax = findMazePath(maze, maze.start, maze.jax) ?? [];
  const stretchEnd = toJax.length - 1 - SHORT_OF_JAX;
  const finalStretch = stretchEnd > 1
    ? toJax.slice(Math.max(1, stretchEnd - FINAL_STRETCH_CELLS), stretchEnd)
    : [];
  // No Gloink patrols within this many steps of the start, where she'd be
  // spotted the moment she arrives. A loop that close (or a maze with too
  // few loops) gets a busy junction instead: a cell with three or four ways
  // out, at least JUNCTION_MIN_DISTANCE away and clear of the other
  // patrols, which its Gloink paces straight across.
  const LOOP_MIN_DISTANCE = 5;
  const JUNCTION_MIN_DISTANCE = 8;
  const fromStart = new Map(getReachableCells(maze, maze.start).map(({ cell, distance }) => [cell, distance]));
  const loopRoutes = environmentLayout.loops
    .filter((loop) => loop.every((cell) => fromStart.get(cell) >= LOOP_MIN_DISTANCE));
  const crowded = new Set([
    ...finalStretch, ...loopRoutes.flat(), ...environmentLayout.chamber, ...environmentLayout.entrance,
    ...environmentLayout.alcoves, maze.exit,
  ]);
  const near = (cell) => getReachableCells(maze, cell).filter(({ distance }) => distance <= 2).map(({ cell: other }) => other);
  const ways = (cell) => Object.values(cell.walls).filter((wall) => !wall).length;
  const openNeighbours = (cell) => [[-1, 0, 'top'], [0, 1, 'right'], [1, 0, 'bottom'], [0, -1, 'left']]
    .filter(([, , wall]) => !cell.walls[wall]).map(([dr, dc]) => maze.cells[cell.r + dr][cell.c + dc]);
  const junctionRoutes = [];
  const junctions = [...fromStart]
    .filter(([cell, distance]) => ways(cell) >= 3 && distance >= JUNCTION_MIN_DISTANCE)
    .sort(([a, da], [b, db]) => ways(b) - ways(a) || db - da || a.r - b.r || a.c - b.c);
  for (const [cell] of junctions) {
    if (loopRoutes.length + junctionRoutes.length >= 3) break;
    if (near(cell).some((other) => crowded.has(other))) continue;
    // In one side, through the junction, out another (opposite sides when it can).
    const [a, ...others] = openNeighbours(cell);
    const out = others.find((other) => other.r === 2 * cell.r - a.r && other.c === 2 * cell.c - a.c) ?? others[0];
    const route = [a, cell, out];
    junctionRoutes.push(route);
    route.forEach((other) => crowded.add(other));
    near(cell).forEach((other) => crowded.add(other));
  }
  const commonAreas = [
    ...loopRoutes.map((cells) => ({ cells, circuit: true })),
    ...junctionRoutes.map((cells) => ({ cells, circuit: false })),
  ];
  const gloinkPlans = [
    { type: 'pin', cells: finalStretch, circuit: false, speed: 1.4, chaseSpeed: 3.0 },
    ...[['star', 1.6, 3.3], ['cube', 1.3, 3.0], ['circle', 1.5, 3.2]]
      .map(([type, speed, chaseSpeed], i) => ({ type, ...(commonAreas[i] ?? { cells: [] }), speed, chaseSpeed })),
  ].filter(({ cells }) => cells.length >= 2);
  const gloinkPatrolCells = gloinkPlans.flatMap(({ cells }) => cells);

  hideouts = [...chooseJaxStops(maze, environmentLayout, gloinkPatrolCells).map(hideoutAt), hideouts[0]];
  placeJax(mazeItems?.jaxComplete ? hideouts.length - 1 : 0);
  spawnJax(); // at his first hideout, or in his nook if they've already talked

  const shaderEffects = createMazeShaderEffects({
    patrolCells: gloinkPatrolCells, cellCenter, cellSize, jaxPosition: jaxSpot,
    backdrop: group.getObjectByName('JaxTheatreBackdrop'),
  });
  group.add(shaderEffects.group);

  // The two hidden keepsakes (see src/state/mazeItems.js) go in random
  // cells away from the start, Jax's own spot and approach, the exit, and
  // the gloinks' patrols — so finding them never means walking
  // into immediate danger or them sitting right where the player already
  // has to go anyway.
  const reservedCells = [
    ...environmentLayout.entrance, ...environmentLayout.chamber,
    maze.start, maze.jax, maze.jaxNeighbor, maze.exit,
    ...gloinkPatrolCells, ...hideouts.map(({ cell }) => cell),
  ];
  const itemCells = [];
  // Bound to this room's final corridor graph and seeded stream. Future search
  // phases can select a safe cell from the player's current cell and get its
  // floor position without duplicating world/grid conversion or exclusions.
  const mazePlacement = {
    cellAt(position) {
      if (!Number.isFinite(position?.x) || !Number.isFinite(position?.z)) return null;
      const r = Math.floor((position.z + depth / 2) / cellSize);
      const c = Math.floor((position.x + width / 2) / cellSize);
      return maze.cells[r]?.[c] ?? null;
    },
    reachableFrom: from => getReachableCells(maze, from),
    selectCell(from, { excludedCells = [], ...limits } = {}) {
      const selected = selectMazeCell(maze, from, {
        ...limits, rng,
        excludedCells: [...reservedCells, ...itemCells, from, ...excludedCells],
      });
      return selected ? {
        ...selected, position: cellCenter(selected.cell.r, selected.cell.c),
      } : null;
    },
  };

  const findableRoom = { group, interactables: [], colliders };
  const placedFindables = [];
  const keepsakes = []; // { id, object }: the ones still to find, for their sounds
  if (mazeItems) {
    const findables = [
      { id: 'bowling-ball', label: 'bowling ball', createMesh: createBowlingBall },
      { id: 'hot-chocolate-mug', label: 'mug of hot chocolate', createMesh: createHotChocolateMug },
    ];
    findables.forEach(({ id, label, createMesh }) => {
      // Reserve an actual side pocket for each keepsake, while retaining the
      // same floor position and pickup code. The fallback handles layouts with fewer pockets.
      const pocket = environmentLayout.alcoves[itemCells.length];
      const selected = pocket
        ? { cell: pocket, position: cellCenter(pocket.r, pocket.c) }
        : mazePlacement.selectCell(maze.start);
      if (!selected) throw new Error(`No reachable maze cell is available for ${id}.`);
      // Reserve both item slots even when an item was already picked up, so
      // revisits keep the remaining item at the same cell for this seed.
      itemCells.push(selected.cell);
      // Consume a rotation for every slot, including collected items.
      const rotationRandom = rng();
      const mesh = placeMazeFindable(findableRoom, mazeItems, id, label, createMesh, selected.position, () => rotationRandom);
      if (mesh) { placedFindables.push(mesh); keepsakes.push({ id, object: mesh }); }
    });
  }

  // Maze-only distress keeps a lowered head and fixed waiting orientation.
  // The encounter controller may request a slow turn without clearing it.
  let findableElapsed = 0;
  /**
   * @param {{ playerActive?: boolean }} [state] playerActive: she's actually
   *   in play (not in a menu or a conversation); only then can a Gloink see her
   */
  function update(deltaSeconds, playerPosition, { playerActive = true } = {}) {
    jaxBoundary.sync();
    shaderEffects.update(deltaSeconds, playerPosition);
    // (Seen before he's turned up only as a glitch fragment's flicker.)
    if (jaxSpawned || jax.visible) {
      jaxApi.update(deltaSeconds);
      jaxGlitch.update(deltaSeconds);
    }
    room.storyUpdate?.(deltaSeconds, playerPosition);
    const seen = playerActive ? playerPosition : null;
    for (const chase of gloinkChases) chase.update(deltaSeconds, seen);
    for (const gloink of gloinks) gloink.update(deltaSeconds);
    findableElapsed += deltaSeconds;
    pulseGlow(placedFindables, findableElapsed);
    if (!playerPosition) return;
    // Distressed waiting pose deliberately does not track the player.
  }

  const triggerRadius = cellSize * 0.4;
  const makeTrigger = (center) => new THREE.Box3(
    new THREE.Vector3(center.x - triggerRadius, -1, center.z - triggerRadius),
    new THREE.Vector3(center.x + triggerRadius, wallHeight, center.z + triggerRadius),
  );
  // Retain this broad legacy box for layout diagnostics, not encounter
  // completion. Final dialogue uses short-range line-of-sight checks.
  const jaxTrigger = new THREE.Box3().setFromPoints(jaxWaypoints).expandByScalar(triggerRadius);
  const triggers = {
    jax: jaxTrigger,
    // Nothing marks it or acts on it any more (she leaves the maze once
    // she's talked to Jax); kept for the dev verification tools' layout checks.
    exit: makeTrigger(exitCenter),
  };

  // Each Gloink patrols (gloinkPlans above) until it sees her, then
  // follows her through the corridors for as long as it can see her
  // (gloinkChase.js), so they aren't on main.js's generic movers. Chasing,
  // they're still slower than her walk: breaking line of sight loses them.
  const movers = [];
  const hazards = [];
  const gloinkChases = [];
  const gloinkPatrols = [];
  const GLOINK_CATCH_RADIUS = 1.0; // sized to the scaled-up Gloinks (gloink.js)
  const gloinks = [];
  if (gloinkApi) {
    for (const { type, cells, circuit, speed, chaseSpeed } of gloinkPlans) {
      const patrol = cells.map(({ r, c }) => cellCenter(r, c));
      const gloink = gloinkApi.createInstance(type);
      gloink.group.position.copy(patrol[0]);
      gloink.setFacing(patrol[1]);
      group.add(gloink.group);
      gloinks.push(gloink);
      gloinkChases.push(createGloinkChase({
        mesh: gloink.group, patrol, circuit, speed, chaseSpeed,
        maze, cellCenter, cellOf: (position) => mazePlacement.cellAt(position), walls: colliders,
      }));
      gloinkPatrols.push({ type, cells, circuit });
      hazards.push({ mesh: gloink.group, radius: GLOINK_CATCH_RADIUS });
    }
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, wallHeight, depth / 2),
  );

  const jaxObjects = [];
  jax.traverse(object => { if (object.isMesh) jaxObjects.push(object); });
  // Reaching him, for the countdown: at his nook (the ones before, he runs from).
  const jaxEncounter = { anchor: jax, objects: jaxObjects, radius: 2.5, enabled: () => jaxSpawned && atNook(),
    seeThrough: jaxBoundary.colliders }; // his own (invisible) personal space doesn't hide him

  const room = {
    mazeSeed: seed, maze, mazePlacement, jaxEncounter, environmentLayout, shaderEffects,
    jaxBoundary, jaxApi, jaxGlitch, spawnJax, placeJax, hideouts, keepsakes,
    /** Where he is now (he moves between hiding places). */
    get jaxAnchor() { return jax.position; },
    get jaxSpawned() { return jaxSpawned; },
    get jaxStop() { return jaxStop; },
    get jaxAtNook() { return atNook(); },
    /**
     * The way through the corridors, cell to neighbouring cell, from
     * `position` to where Jax is standing (null if there's no way).
     */
    routeToJax(position) {
      const from = mazePlacement.cellAt(position), to = mazePlacement.cellAt(jax.position);
      const path = from && to ? findMazePath(maze, from, to) : null;
      if (!path) return null;
      return [position.clone().setY(0), ...path.slice(1, -1).map(({ r, c }) => cellCenter(r, c)), jax.position.clone().setY(0)];
    },
    /** The way (cell centres) from hiding place `from` to the next one. */
    routeOn(from) {
      const path = findMazePath(maze, hideouts[from].cell, hideouts[Math.min(from + 1, hideouts.length - 1)].cell) ?? [];
      return path.map(({ r, c }) => cellCenter(r, c));
    },
    group, bounds, spawn, spawnFacing, colliders, triggers, movers, hazards, update, gloinkChases, gloinkPatrols,
    interactables: findableRoom.interactables,
  };
  return room;
}

/**
 * The two dead ends Jax runs from before his nook (maze.jax): well away
 * from the start, off every Gloink's beat and the keepsakes' pockets, and
 * as far from the nook and each other (by the corridors) as they can be.
 */
function chooseJaxStops(maze, layout, patrolCells) {
  const distancesFrom = cell => new Map(getReachableCells(maze, cell).map(({ cell: other, distance }) => [other, distance]));
  const fromStart = distancesFrom(maze.start), fromNook = distancesFrom(maze.jax);
  const farthest = Math.max(...fromStart.values());
  const taken = new Set([...layout.chamber, ...layout.entrance, maze.start, maze.exit, maze.jax, maze.jaxNeighbor,
    ...patrolCells, ...layout.alcoves.slice(0, 2)]);
  const deadEnd = cell => Object.values(cell.walls).filter(wall => !wall).length === 1;
  // Off the dressed pockets if there are enough, otherwise any of them.
  let pool = [...fromStart].filter(([cell, distance]) => deadEnd(cell) && !taken.has(cell) && distance >= farthest * 0.4)
    .map(([cell]) => cell);
  const undressed = pool.filter(cell => !layout.alcoves.includes(cell));
  if (undressed.length >= 2) pool = undressed;
  const stops = [];
  for (let i = 0; i < 2; i++) {
    if (i && !stops.length) break;
    const away = i ? [fromNook, distancesFrom(stops[0])] : [fromNook];
    const best = pool.filter(cell => !stops.includes(cell))
      .sort((a, b) => Math.min(...away.map(m => m.get(b))) - Math.min(...away.map(m => m.get(a))) || a.r - b.r || a.c - b.c)[0];
    if (best) stops.push(best);
  }
  return stops;
}

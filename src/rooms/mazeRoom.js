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
import { getReachableCells, selectMazeCell } from '../maze/mazePlacements.js';
import { loadJax } from '../characters/jax.js';
import { createBowlingBall, createHotChocolateMug, placeMazeFindable, pulseGlow } from '../props/mazeFindables.js';

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
  ctx.fillStyle = '#242034';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#f3dfb8';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  ctx.strokeStyle = '#504250'; ctx.lineWidth = 1.4;
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
  const jaxApi = await loadJax();
  onProgress?.(1);
  return buildMaze(jaxApi, mazeItems, seed, rng);
}

function buildMaze(jaxApi, mazeItems, seed, rng) {
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
  const wallMaterialA = new THREE.MeshStandardMaterial({ color: 0xd6323a, roughness: 0.75 });
  const wallMaterialB = new THREE.MeshStandardMaterial({ color: 0xf4c93b, roughness: 0.75 });
  const floorMaterial = new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.65, metalness: 0.04, emissive: 0x322738, emissiveIntensity: 0.035 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Floor';
  group.add(floor);

  // Every wall mesh doubles as a collider: its Box3 is what main.js checks
  // the player against each frame, so geometry and collision can never
  // drift out of sync the way a hand-modeled mesh + separate collider would.
  const colliders = [];
  const horizontalWallGeo = new THREE.BoxGeometry(cellSize + wallThickness, wallHeight, wallThickness);
  const verticalWallGeo = new THREE.BoxGeometry(wallThickness, wallHeight, cellSize + wallThickness);
  let wallCount = 0;

  function addWall(geometry, position) {
    const wall = new THREE.Mesh(geometry, wallCount % 2 === 0 ? wallMaterialA : wallMaterialB);
    wallCount++;
    wall.position.set(position.x, wallHeight / 2, position.z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
    colliders.push(new THREE.Box3().setFromObject(wall));
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

  // The exit still gets a placeholder marker — real dressing (a doorway,
  // light, etc.) is still for the team to add — but Jax himself is the
  // real model now, not a stand-in.
  const jaxCenter = cellCenter(maze.jax.r, maze.jax.c);
  const jaxNeighborCenter = cellCenter(maze.jaxNeighbor.r, maze.jaxNeighbor.c);
  const { jax } = jaxApi;
  jax.position.set(jaxCenter.x, 0, jaxCenter.z);
  // Face the selected chamber approach rather than an arbitrary direction.
  jax.rotation.y = Math.atan2(jaxNeighborCenter.x - jaxCenter.x, jaxNeighborCenter.z - jaxCenter.z);
  jax.visible = true;
  group.add(jax);
  ownMazeShadowPass(jax);

  const exitCenter = cellCenter(maze.exit.r, maze.exit.c);
  const exitMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(cellSize * 0.35, cellSize * 0.35, 0.05, 24),
    new THREE.MeshStandardMaterial({ color: 0x35d46a, emissive: 0x0f4d22, emissiveIntensity: 0.6 }),
  );
  exitMarker.position.set(exitCenter.x, 0.03, exitCenter.z);
  exitMarker.name = 'ExitMarker';
  group.add(exitMarker);

  // His found-trigger still covers both his own cell and the approach
  // neighbor's — generous on purpose, same cushion the old patrol-covering
  // zone gave, even though he's standing still here rather than pacing
  // between them (a real walk-cycle patrol needs its own per-frame driver;
  // the generic mover system below just slides a mesh's position, which
  // reads fine for a marker shape but not for a rigged character with legs
  // that never move — left for a later pass).
  const jaxWaypoints = [
    new THREE.Vector3(jaxCenter.x, 0.8, jaxCenter.z),
    new THREE.Vector3(jaxNeighborCenter.x, 0.8, jaxNeighborCenter.z),
  ];

  // A patrolling hazard walks a stretch of the actual start->exit route, so
  // reaching the exit means timing a pass around it rather than just
  // walking there — the "avoid abstracted monsters" half of the level.
  const midIndex = Math.floor(maze.path.length / 2);
  const patrolCells = maze.path.slice(
    Math.max(0, midIndex - 1),
    Math.min(maze.path.length, midIndex + 2),
  );
  const hazardWaypoints = patrolCells.map((cell) => {
    const c = cellCenter(cell.r, cell.c);
    return new THREE.Vector3(c.x, 0.9, c.z);
  });

  let hazardMarker = null;
  if (hazardWaypoints.length >= 2) {
    hazardMarker = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({
        color: 0x1a0000,
        emissive: 0xff2b2b,
        emissiveIntensity: 1.1,
        flatShading: true,
      }),
    );
    hazardMarker.position.copy(hazardWaypoints[0]);
    hazardMarker.name = 'HazardMarker';
    group.add(hazardMarker);
  }

  const shaderEffects = createMazeShaderEffects({
    patrolCells, cellCenter, cellSize, jaxPosition: jaxCenter,
    backdrop: group.getObjectByName('JaxTheatreBackdrop'),
  });
  group.add(shaderEffects.group);

  // The two hidden keepsakes (see src/state/mazeItems.js) go in random
  // cells away from the start, Jax's own spot and approach, the exit, and
  // the hazard's patrol segment — so finding them never means walking
  // into immediate danger or them sitting right where the player already
  // has to go anyway.
  const reservedCells = [...environmentLayout.entrance, ...environmentLayout.chamber, maze.exit, ...patrolCells];
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

  const findableRoom = { group, interactables: [] };
  const placedFindables = [];
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
      if (mesh) placedFindables.push(mesh);
    });
  }

  // Jax breathes/trembles in place all the time (see jax.js's idle
  // branch) and turns to actually look at Pomni once she's close — a
  // little earlier than his found-trigger itself fires, so he's already
  // turning by the time the hint shows rather than snapping to face her.
  const FACE_RADIUS = cellSize * 1.4;
  let findableElapsed = 0;
  function update(deltaSeconds, playerPosition) {
    shaderEffects.update(deltaSeconds, playerPosition);
    jaxApi.update(deltaSeconds);
    findableElapsed += deltaSeconds;
    pulseGlow(placedFindables, findableElapsed);
    if (!playerPosition) return;
    const dx = playerPosition.x - jaxCenter.x;
    const dz = playerPosition.z - jaxCenter.z;
    jaxApi.faceTowards(Math.hypot(dx, dz) < FACE_RADIUS ? playerPosition : null);
  }

  const triggerRadius = cellSize * 0.4;
  const makeTrigger = (center) => new THREE.Box3(
    new THREE.Vector3(center.x - triggerRadius, -1, center.z - triggerRadius),
    new THREE.Vector3(center.x + triggerRadius, wallHeight, center.z + triggerRadius),
  );
  // The Jax trigger covers his whole patrol segment (both waypoints) since
  // he can be anywhere along it; the exit stays a fixed spot.
  const jaxTrigger = new THREE.Box3().setFromPoints(jaxWaypoints).expandByScalar(triggerRadius);
  const triggers = {
    jax: jaxTrigger,
    exit: makeTrigger(exitCenter),
  };

  const movers = [];
  const hazards = [];
  if (hazardMarker) {
    movers.push({ mesh: hazardMarker, waypoints: hazardWaypoints, speed: 1.4, targetIndex: 1, direction: 1, spin: true });
    hazards.push({ mesh: hazardMarker, radius: 0.9 });
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, wallHeight, depth / 2),
  );

  return {
    mazeSeed: seed, maze, mazePlacement, environmentLayout, shaderEffects,
    group, bounds, spawn, spawnFacing, colliders, triggers, movers, hazards, update,
    interactables: findableRoom.interactables,
  };
}

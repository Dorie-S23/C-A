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
  jaxApi.setDistressed(true);
  const jaxBoundary=createJaxStageBoundary({position:jaxCenter,colliders,isUnlocked:()=>Boolean(mazeItems?.hasAllRequired())});
  group.add(jaxBoundary.group);

  const exitCenter = cellCenter(maze.exit.r, maze.exit.c);
  const exitMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(cellSize * 0.35, cellSize * 0.35, 0.05, 24),
    new THREE.MeshStandardMaterial({ color: 0xd8a14a, emissive: 0x4d3211, emissiveIntensity: 0.3 }),
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

  // Two patrolling Gloink enemies walk stretches of the start->exit route,
  // replacing the previous placeholder floating sphere hazard.
  // Gloink 1 (bowling pin shape) patrols earlier (~30% of the path),
  // Gloink 2 (star shape) patrols deeper (~65% of the path), so reaching
  // the exit means timing a pass around them.
  const pathLen = maze.path.length;
  const idx1 = Math.floor(pathLen * 0.3);
  const idx2 = Math.floor(pathLen * 0.65);

  const patrolCells1 = pathLen >= 4
    ? maze.path.slice(Math.max(1, idx1 - 1), Math.min(pathLen - 1, idx1 + 2))
    : [];
  const minIdx2 = patrolCells1.length ? Math.max(idx1 + 3, idx2) : idx2;
  const patrolCells2 = pathLen >= 6
    ? maze.path.slice(Math.max(1, Math.min(pathLen - 3, minIdx2 - 1)), Math.min(pathLen - 1, Math.max(minIdx2 + 2, minIdx2 + 1)))
    : [];

  const gloinkWaypoints1 = patrolCells1.map((cell) => {
    const c = cellCenter(cell.r, cell.c);
    return new THREE.Vector3(c.x, 0, c.z);
  });
  const gloinkWaypoints2 = patrolCells2.map((cell) => {
    const c = cellCenter(cell.r, cell.c);
    return new THREE.Vector3(c.x, 0, c.z);
  });

  const gloink1 = (gloinkWaypoints1.length >= 2 && gloinkApi)
    ? gloinkApi.createInstance('pin')
    : null;
  const gloink2 = (gloinkWaypoints2.length >= 2 && gloinkApi)
    ? gloinkApi.createInstance('star')
    : null;

  if (gloink1) {
    gloink1.group.position.copy(gloinkWaypoints1[0]);
    if (gloinkWaypoints1.length >= 2) gloink1.setFacing(gloinkWaypoints1[1]);
    group.add(gloink1.group);
  }
  if (gloink2) {
    gloink2.group.position.copy(gloinkWaypoints2[0]);
    if (gloinkWaypoints2.length >= 2) gloink2.setFacing(gloinkWaypoints2[1]);
    group.add(gloink2.group);
  }

  const shaderEffects = createMazeShaderEffects({
    patrolCells: [...patrolCells1, ...patrolCells2], cellCenter, cellSize, jaxPosition: jaxCenter,
    backdrop: group.getObjectByName('JaxTheatreBackdrop'),
  });
  group.add(shaderEffects.group);

  // The two hidden keepsakes (see src/state/mazeItems.js) go in random
  // cells away from the start, Jax's own spot and approach, the exit, and
  // the gloinks' patrol segments — so finding them never means walking
  // into immediate danger or them sitting right where the player already
  // has to go anyway.
  const reservedCells = [
    ...environmentLayout.entrance, ...environmentLayout.chamber,
    maze.start, maze.jax, maze.jaxNeighbor, maze.exit,
    ...patrolCells1, ...patrolCells2,
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

  // Two more Gloinks roam side branches off the start->exit route, which
  // the first two already guard. Each walks a short stretch (two cells
  // either way) at least ROAMER_MIN_DISTANCE corridor steps from the start,
  // a cell clear of Jax, the exit, the keepsakes and every other Gloink's
  // stretch. Placed after the keepsakes so a seed's keepsake cells don't
  // move. A seed with no room for one simply goes without it.
  const ROAMER_MIN_DISTANCE = 5;
  const roamers = [];
  if (gloinkApi) {
    const withNeighbours = (cells) => cells.flatMap((cell) =>
      getReachableCells(maze, cell).filter(({ distance }) => distance <= 1).map(({ cell: near }) => near));
    const taken = [...reservedCells, ...itemCells];
    for (const [type, speed, chaseSpeed] of [['cube', 1.3, 3.0], ['circle', 1.5, 3.2]]) {
      const excluded = new Set([...withNeighbours(taken), ...maze.path.map(({ r, c }) => maze.cells[r][c])]);
      // Only cells with somewhere free to walk to, so a pick never comes up empty.
      const candidates = getReachableCells(maze, maze.start)
        .filter(({ cell, distance }) => distance >= ROAMER_MIN_DISTANCE && !excluded.has(cell))
        .map(({ cell }) => ({
          cell,
          end: getReachableCells(maze, cell)
            .filter(({ cell: other, distance }) => distance >= 1 && distance <= 2 && !excluded.has(other))
            .sort((a, b) => b.distance - a.distance)[0]?.cell,
        }))
        .filter(({ end }) => end);
      if (!candidates.length) continue;
      const pick = candidates[Math.floor(rng() * candidates.length)];
      const patrolCells = findMazePath(maze, pick.cell, pick.end);
      taken.push(...patrolCells);
      const patrol = patrolCells.map(({ r, c }) => cellCenter(r, c));
      const gloink = gloinkApi.createInstance(type);
      gloink.group.position.copy(patrol[0]);
      gloink.setFacing(patrol[1]);
      group.add(gloink.group);
      roamers.push({ gloink, patrol, speed, chaseSpeed });
    }
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
    jaxApi.update(deltaSeconds);
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
    exit: makeTrigger(exitCenter),
  };

  // Each Gloink patrols its stretch until it sees her, then follows her
  // through the corridors for as long as it can see her (gloinkChase.js),
  // so they aren't on main.js's generic movers. Chasing, they're still
  // slower than her walk (4.2 m/s): breaking line of sight loses them.
  const movers = [];
  const hazards = [];
  const gloinkChases = [];
  const GLOINK_CATCH_RADIUS = 1.0; // sized to the scaled-up Gloinks (gloink.js)
  const gloinks = [];
  for (const { gloink, patrol, speed, chaseSpeed } of [
    { gloink: gloink1, patrol: gloinkWaypoints1, speed: 1.4, chaseSpeed: 3.0 },
    { gloink: gloink2, patrol: gloinkWaypoints2, speed: 1.6, chaseSpeed: 3.3 },
    ...roamers,
  ]) {
    if (!gloink || patrol.length < 2) continue;
    gloinks.push(gloink);
    gloinkChases.push(createGloinkChase({
      mesh: gloink.group, patrol, speed, chaseSpeed,
      maze, cellCenter, cellOf: (position) => mazePlacement.cellAt(position), walls: colliders,
    }));
    hazards.push({ mesh: gloink.group, radius: GLOINK_CATCH_RADIUS });
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, wallHeight, depth / 2),
  );

  const jaxObjects = [];
  jax.traverse(object => { if (object.isMesh) jaxObjects.push(object); });
  const jaxEncounter = { anchor: jax, objects: jaxObjects, radius: 2.5 };

  return {
    mazeSeed: seed, maze, mazePlacement, jaxEncounter, environmentLayout, shaderEffects,
    jaxBoundary, jaxAnchor:jaxCenter, jaxApi,
    group, bounds, spawn, spawnFacing, colliders, triggers, movers, hazards, update, gloinkChases,
    interactables: findableRoom.interactables,
  };
}

import * as THREE from 'three';
import { generateMaze } from '../maze/generateMaze.js';

// Exported so main.js can size the player's outer bounds without duplicating
// numbers, the same way room.js exposes ROOM.
export const MAZE = {
  cols: 9,
  rows: 9,
  cellSize: 4.5, // clear corridor width = cellSize - wallThickness (~4.3 units)
  wallHeight: 3,
  wallThickness: 0.2,
};

const wallMaterialA = new THREE.MeshStandardMaterial({ color: 0xd6323a, roughness: 0.8 });
const wallMaterialB = new THREE.MeshStandardMaterial({ color: 0xf4c93b, roughness: 0.8 });
const floorMaterial = new THREE.MeshStandardMaterial({ map: createCheckerTexture(), roughness: 0.9 });

function createCheckerTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#eeeeee';
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(MAZE.cols, MAZE.rows);
  return texture;
}

/**
 * Builds the level-3 maze. Kept async (like the GLB room loaders) so
 * main.js can treat every room the same way, even though this one has no
 * network fetch to await.
 *
 * @returns {Promise<{ group: THREE.Group, bounds: THREE.Box3, spawn: THREE.Vector3,
 *   spawnFacing: number, colliders: THREE.Box3[],
 *   triggers: { jax: THREE.Box3, exit: THREE.Box3 },
 *   movers: Array<{ mesh: THREE.Object3D, waypoints: THREE.Vector3[], speed: number,
 *     targetIndex: number, direction: number, spin?: boolean }>,
 *   hazards: Array<{ mesh: THREE.Object3D, radius: number }> }>}
 */
export function loadMazeRoom(onProgress) {
  onProgress?.(1);
  return Promise.resolve(buildMaze());
}

function buildMaze() {
  const { cols, rows, cellSize, wallHeight, wallThickness } = MAZE;
  const maze = generateMaze(cols, rows);

  const group = new THREE.Group();
  group.name = 'MazeRoom';

  const width = cols * cellSize;
  const depth = rows * cellSize;
  const originX = -width / 2 + cellSize / 2;
  const originZ = -depth / 2 + cellSize / 2;
  const cellCenter = (r, c) => new THREE.Vector3(originX + c * cellSize, 0, originZ + r * cellSize);

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

  // Dark, moody atmosphere overall — enough skylight that walls and
  // corridors are always readable, even far from any point light — with
  // one bright, warm pool over the maze's center that fades out with
  // distance (inverse-square falloff) rather than reaching the corners.
  // The center light's shadows are what carve out that pool: walls a cell
  // or two away block it and go back to just the ambient fill.
  //
  // An earlier, dimmer version of this fill (0.16) left the spawn corner —
  // which can be many cells from center — reading as near-solid black with
  // no readable detail at all (measured ~49/7/9 average RGB), indistinguishable
  // from the game being frozen. This level keeps the same moody character
  // while staying clearly readable at the point farthest from any light.
  const fill = new THREE.HemisphereLight(0x3d3d52, 0x16161e, 0.32);
  group.add(fill);

  const centerLight = new THREE.PointLight(0xfff2c2, 10, cellSize * 6, 2);
  centerLight.position.set(0, wallHeight * 0.85, 0);
  centerLight.castShadow = true;
  centerLight.shadow.mapSize.set(1024, 1024);
  centerLight.shadow.camera.near = 0.1;
  centerLight.shadow.camera.far = cellSize * 6;
  group.add(centerLight);

  const spawnCenter = cellCenter(maze.start.r, maze.start.c);
  const spawn = new THREE.Vector3(spawnCenter.x, 0, spawnCenter.z);

  // A small, dim lantern right at the entrance — distinct from the big
  // center pool — so the spawn cell itself has some directional light to
  // read shapes by, not just the flat hemisphere fill.
  const spawnLight = new THREE.PointLight(0xffe2b0, 2.5, cellSize * 2.2, 2);
  spawnLight.position.set(spawnCenter.x, wallHeight * 0.75, spawnCenter.z);
  group.add(spawnLight);

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

  // Placeholder markers stand in for the real Jax model / exit dressing
  // until the team has those assets — swap the meshes, keep the triggers.
  const jaxCenter = cellCenter(maze.jax.r, maze.jax.c);
  const jaxNeighborCenter = cellCenter(maze.jaxNeighbor.r, maze.jaxNeighbor.c);
  const jaxMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.4, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x8a7bd6, emissive: 0x241f4d, emissiveIntensity: 0.4 }),
  );
  jaxMarker.position.set(jaxCenter.x, 0.8, jaxCenter.z);
  jaxMarker.name = 'JaxMarker';
  group.add(jaxMarker);

  const exitCenter = cellCenter(maze.exit.r, maze.exit.c);
  const exitMarker = new THREE.Mesh(
    new THREE.CylinderGeometry(cellSize * 0.35, cellSize * 0.35, 0.05, 24),
    new THREE.MeshStandardMaterial({ color: 0x35d46a, emissive: 0x0f4d22, emissiveIntensity: 0.6 }),
  );
  exitMarker.position.set(exitCenter.x, 0.03, exitCenter.z);
  exitMarker.name = 'ExitMarker';
  group.add(exitMarker);

  // Jax wanders a short back-and-forth patrol between his dead end and its
  // one open neighbor, rather than standing still — a stand-in for the
  // plan's "pathfinding/wandering AI (simple waypoint system)" task.
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

  const movers = [
    { mesh: jaxMarker, waypoints: jaxWaypoints, speed: 0.6, targetIndex: 1, direction: 1 },
  ];
  const hazards = [];
  if (hazardMarker) {
    movers.push({ mesh: hazardMarker, waypoints: hazardWaypoints, speed: 1.4, targetIndex: 1, direction: 1, spin: true });
    hazards.push({ mesh: hazardMarker, radius: 0.9 });
  }

  const bounds = new THREE.Box3(
    new THREE.Vector3(-width / 2, 0, -depth / 2),
    new THREE.Vector3(width / 2, wallHeight, depth / 2),
  );

  return { group, bounds, spawn, spawnFacing, colliders, triggers, movers, hazards };
}

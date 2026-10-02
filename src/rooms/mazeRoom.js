import * as THREE from 'three';
import { generateMaze } from '../maze/generateMaze.js';

// Exported so main.js can size the player's outer bounds without duplicating
// numbers, the same way room.js exposes ROOM.
export const MAZE = {
  cols: 9,
  rows: 9,
  cellSize: 3,
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
 *   colliders: THREE.Box3[], triggers: { jax: THREE.Box3, exit: THREE.Box3 },
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

  const fill = new THREE.HemisphereLight(0xfff4e0, 0x3a3226, 0.7);
  group.add(fill);
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(width * 0.3, wallHeight * 5, depth * 0.3);
  group.add(sun);

  const spawnCenter = cellCenter(maze.start.r, maze.start.c);
  const spawn = new THREE.Vector3(spawnCenter.x, 0, spawnCenter.z);

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

  return { group, bounds, spawn, colliders, triggers, movers, hazards };
}

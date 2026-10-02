import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { loadPomniRoom } from './rooms/pomniRoom.js';
import { loadTadcRoom } from './rooms/tadcRoom.js';
import { loadMazeRoom } from './rooms/mazeRoom.js';

const ROOM_LOADERS = {
  pomni: loadPomniRoom,
  tadc: loadTadcRoom,
  maze: loadMazeRoom,
};

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const WALK_SPEED = 3.0;
const SPRINT_MULTIPLIER = 1.8;
const WALL_MARGIN = 0.4; // keep the camera this far from any wall
const STEP_HEIGHT = 0.4; // ledges up to this tall are stepped onto; taller ones block
const PROBE_HEIGHT = STEP_HEIGHT + 0.05; // height of the wall-probe ray above the feet
// The wall probe must lead a full PLAYER_RADIUS of clearance *along its own
// ray*; for an oblique approach that lead is PLAYER_RADIUS / |dir·normal|,
// so this reach keeps everything down to about 70° off a wall's normal
// stopping cleanly (grazing steps change clearance only in millimetres).
const PROBE_LEAD = PLAYER_RADIUS / 0.35;
const GROUND_RAY_FAR = 24; // how far below the player a floor still counts as "under" them
const WALKABLE_NORMAL_Y = 0.6; // faces tilted further than this are ramps, not walls

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1d);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  500,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.15);
scene.add(ambient);

// --- Pointer-lock first-person controls ---
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const roomPicker = document.getElementById('room-picker');
const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');

let currentRoom = null;
let readyToPlay = false;
let hintTimeout = null;

function showHint(text, durationMs = 3000) {
  hint.textContent = text;
  hint.classList.add('visible');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => hint.classList.remove('visible'), durationMs);
}

overlay.addEventListener('click', () => {
  if (!readyToPlay) return;
  controls.lock();
});
controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  crosshair.hidden = false;
});
controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  crosshair.hidden = true;
});

roomPicker.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the overlay's lock-on-click
    selectRoom(button.dataset.room);
  });
});

function selectRoom(roomKey) {
  const loadRoom = ROOM_LOADERS[roomKey];
  if (!loadRoom) return;

  if (currentRoom) {
    scene.remove(currentRoom);
    disposeObject3D(currentRoom);
    currentRoom = null;
    bounds = null;
  }

  readyToPlay = false;
  colliders = [];
  collisionMeshes = [];
  triggers = null;
  movers = [];
  hazards = [];
  foundJax = false;
  reachedExit = false;
  caught = false;
  roomPicker.hidden = true;
  overlay.classList.add('loading');
  overlayTitle.textContent = 'Loading…';
  overlaySubtitle.textContent = 'Fetching room model (0%)';

  loadRoom((ratio) => {
    overlaySubtitle.textContent = `Fetching room model (${Math.round(ratio * 100)}%)`;
  })
    .then(({
      group,
      bounds: box,
      spawn,
      colliders: roomColliders,
      collisionMeshes: roomCollisionMeshes,
      triggers: roomTriggers,
      movers: roomMovers,
      hazards: roomHazards,
    }) => {
      currentRoom = group;
      scene.add(group);

      floorY = spawn.y;
      bounds = {
        minX: box.min.x + WALL_MARGIN,
        maxX: box.max.x - WALL_MARGIN,
        minZ: box.min.z + WALL_MARGIN,
        maxZ: box.max.z - WALL_MARGIN,
      };
      colliders = roomColliders ?? [];
      // GLB rooms' meshes: the wall probes and floor raycast only test the
      // few entries whose boxes the query overlaps, padded by the player
      // radius so a mesh the player is touching is never skipped.
      collisionMeshes = (roomCollisionMeshes ?? []).map((entry) => ({
        mesh: entry.mesh,
        box: entry.box,
        paddedBox: entry.box.clone().expandByScalar(PLAYER_RADIUS),
      }));
      triggers = roomTriggers ?? null;
      movers = roomMovers ?? [];
      hazards = roomHazards ?? [];

      controls.object.position.set(spawn.x, floorY + PLAYER_HEIGHT, spawn.z);
      controls.object.rotation.set(0, 0, 0);

      readyToPlay = true;
      overlay.classList.remove('loading');
      overlayTitle.textContent = 'Click to Play';
      overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint — Esc to release the mouse';
    })
    .catch((err) => {
      console.error('Failed to load room model', err);
      overlayTitle.textContent = 'Failed to load room';
      overlaySubtitle.textContent = 'Check the browser console for details.';
      roomPicker.hidden = false;
      overlay.classList.remove('loading');
    });
}

function disposeObject3D(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        if (material[key]?.isTexture) material[key].dispose();
      }
      material.dispose();
    }
  });
}

// --- Credits panel ---
const creditsPanel = document.getElementById('credits');
document.getElementById('credits-btn').addEventListener('click', () => {
  creditsPanel.classList.remove('hidden');
});
document.getElementById('credits-close').addEventListener('click', () => {
  creditsPanel.classList.add('hidden');
});

// --- Keyboard movement ---
const move = { forward: false, back: false, left: false, right: false, sprint: false };

window.addEventListener('keydown', (e) => setMove(e.code, true));
window.addEventListener('keyup', (e) => setMove(e.code, false));

function setMove(code, value) {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      move.forward = value;
      break;
    case 'KeyS':
    case 'ArrowDown':
      move.back = value;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      move.left = value;
      break;
    case 'KeyD':
    case 'ArrowRight':
      move.right = value;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      move.sprint = value;
      break;
  }
}

const velocity = new THREE.Vector3();
const triggerProbe = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveForward = new THREE.Vector3();
const moveDelta = new THREE.Vector3();
const probeOrigin = new THREE.Vector3();
const slideDelta = new THREE.Vector3();
const faceNormal = new THREE.Vector3();
const hitNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wallRaycaster = new THREE.Raycaster();
const groundRaycaster = new THREE.Raycaster();
// A small ring of floor probes around the player position tolerates seams
// between separate floor meshes; each entry is an XZ offset.
const GROUND_PROBES = [[0, 0], [0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]];

// Populated once a room model has loaded and its real bounding box is known.
let bounds = null;
let floorY = 0;

// Two collision systems, picked by what the loaded room supplies:
//  - colliders: exact wall Box3s (the maze), resolved circle-vs-box below.
//  - collisionMeshes: the GLB rooms' render meshes with their world boxes.
//    Wall probes and the floor raycast test only the few meshes whose boxes
//    the query touches and collide against the rendered triangles — so
//    doors, corridors and irregular walls block exactly where they look
//    like they should, unlike per-mesh boxes, which would seal off whole
//    chunks of these rooms (the ceiling box alone spans the spawn area).
// Rooms with objective callouts (find Jax / reach the exit) also fill
// triggers/movers/hazards; rooms without leave those empty/null.
let colliders = [];
let collisionMeshes = [];
let triggers = null;
let movers = [];
let hazards = [];
let foundJax = false;
let reachedExit = false;
let caught = false;

/**
 * Steps every patrolling NPC/hazard along its waypoint loop, ping-ponging
 * between the first and last waypoint. Runs every frame regardless of
 * pointer lock so patrols stay alive while the player is looking at a menu.
 */
function updateMovers(deltaSeconds) {
  for (const mover of movers) {
    const target = mover.waypoints[mover.targetIndex];
    const dx = target.x - mover.mesh.position.x;
    const dz = target.z - mover.mesh.position.z;
    const dist = Math.hypot(dx, dz);
    const step = mover.speed * deltaSeconds;

    if (dist <= step || dist < 1e-6) {
      mover.mesh.position.x = target.x;
      mover.mesh.position.z = target.z;
      mover.targetIndex += mover.direction;
      if (mover.targetIndex >= mover.waypoints.length) {
        mover.targetIndex = mover.waypoints.length - 2;
        mover.direction = -1;
      } else if (mover.targetIndex < 0) {
        mover.targetIndex = 1;
        mover.direction = 1;
      }
    } else {
      mover.mesh.position.x += (dx / dist) * step;
      mover.mesh.position.z += (dz / dist) * step;
    }

    if (mover.spin) {
      mover.mesh.rotation.x += deltaSeconds * 1.5;
      mover.mesh.rotation.y += deltaSeconds * 2.1;
    }
  }
}

/**
 * Pushes the player's XZ position out of any wall box it has walked into.
 * Treated as a circle (radius PLAYER_RADIUS) vs. axis-aligned box test since
 * every maze wall is axis-aligned — cheap and exact for this case, unlike
 * the outer bounding-box clamp which can't express interior geometry.
 */
function resolveWallCollisions(position) {
  const feetY = position.y - PLAYER_HEIGHT;
  for (const box of colliders) {
    // Walls only block over the player's body height: boxes entirely below
    // a steppable ledge or entirely above the head are not walls.
    if (box.max.y <= feetY + STEP_HEIGHT || box.min.y >= position.y) continue;

    const closestX = THREE.MathUtils.clamp(position.x, box.min.x, box.max.x);
    const closestZ = THREE.MathUtils.clamp(position.z, box.min.z, box.max.z);
    const dx = position.x - closestX;
    const dz = position.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= PLAYER_RADIUS * PLAYER_RADIUS || distSq < 1e-9) continue;

    const dist = Math.sqrt(distSq);
    const overlap = PLAYER_RADIUS - dist;
    position.x += (dx / dist) * overlap;
    position.z += (dz / dist) * overlap;
  }
}

/**
 * Casts a short horizontal ray from the player and returns the first hit
 * that is genuinely wall-like, or null. Faces tilted mostly up/down are
 * ramps and ledges — the floor follow already handles those, so they must
 * not stop the player here, hence the walkable-slope check.
 */
function firstWallHit(origin, direction, distance) {
  wallRaycaster.set(origin, direction);
  wallRaycaster.far = distance;

  const candidates = [];
  for (const entry of collisionMeshes) {
    if (wallRaycaster.ray.intersectsBox(entry.paddedBox)) candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return null;

  for (const hit of wallRaycaster.intersectObjects(candidates, false)) {
    normalMatrix.getNormalMatrix(hit.object.matrixWorld);
    faceNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
    // three reports the raw geometric normal even on back-face hits (the
    // player walking into the far side of a double-sided wall), which
    // would point along the movement and push the player *through* the
    // wall — reorient it to face the probe before doing any math.
    if (faceNormal.dot(direction) > 0) faceNormal.negate();
    if (Math.abs(faceNormal.y) > WALKABLE_NORMAL_Y) continue;
    hitNormal.set(faceNormal.x, 0, faceNormal.z).normalize();
    return { distance: hit.distance, normal: hitNormal };
  }
  return null;
}

/**
 * Moves the player `distance` along `direction` without passing through a
 * wall: the step is clipped at the first hit (stopping PLAYER_RADIUS short
 * of it) and the leftover distance is redirected along the wall face, so
 * the player slides instead of sticking. A hit closer than PLAYER_RADIUS
 * means the player is somehow inside the wall — then the step just backs
 * them out.
 */
function moveWithCollisions(player, direction, distance) {
  probeOrigin.set(
    player.position.x,
    player.position.y - PLAYER_HEIGHT + PROBE_HEIGHT,
    player.position.z,
  );

  const hit = firstWallHit(probeOrigin, direction, distance + PROBE_LEAD);
  if (!hit) {
    player.position.addScaledVector(direction, distance);
    return;
  }

  const approach = -(direction.x * hit.normal.x + direction.z * hit.normal.z);
  if (approach < 1e-4) {
    // The face runs parallel to the step, yet the probe caught it within
    // reach: the step is already inside this wall — push straight out.
    player.position.addScaledVector(hit.normal, PLAYER_RADIUS);
    return;
  }

  // Perpendicular distance from the player to the wall face. The probe
  // measures along `direction`, which only equals the true clearance on a
  // head-on approach, hence the approach factor.
  const clearance = hit.distance * approach;
  if (clearance < PLAYER_RADIUS) {
    // Already within a radius of the face: back straight out along its
    // normal (exactly to the radius) and leave sliding to the next frame.
    player.position.addScaledVector(hit.normal, PLAYER_RADIUS - clearance);
    return;
  }

  const allowed = Math.min(distance, (clearance - PLAYER_RADIUS) / approach);
  player.position.addScaledVector(direction, allowed);

  const leftover = distance - allowed;
  if (leftover < 1e-4) return;

  // Retry the leftover along the wall face.
  slideDelta.set(direction.x * leftover, 0, direction.z * leftover);
  slideDelta.addScaledVector(hit.normal, -slideDelta.dot(hit.normal));
  const slideLength = slideDelta.length();
  if (slideLength < 1e-4) return;
  slideDelta.divideScalar(slideLength);

  probeOrigin.set(
    player.position.x,
    player.position.y - PLAYER_HEIGHT + PROBE_HEIGHT,
    player.position.z,
  );
  const slideHit = firstWallHit(probeOrigin, slideDelta, slideLength + PROBE_LEAD);
  let slideAllowed = slideLength;
  if (slideHit) {
    const slideApproach = -(slideDelta.x * slideHit.normal.x + slideDelta.z * slideHit.normal.z);
    slideAllowed = slideApproach < 1e-4
      ? 0
      : Math.max(0, Math.min(slideLength, (slideHit.distance * slideApproach - PLAYER_RADIUS) / slideApproach));
  }
  player.position.addScaledVector(slideDelta, slideAllowed);
}

/**
 * The highest surface under (x, z) that can be stood on: the nearest hit
 * at or below a step above the feet. Hits above that belong to geometry
 * the body probe should have blocked, so the search skips past them.
 * Returns null when no floor exists under the point.
 */
function findGroundY(x, z, originY, feetY) {
  groundRaycaster.set(probeOrigin.set(x, originY, z), DOWN);
  groundRaycaster.far = GROUND_RAY_FAR;

  const candidates = [];
  for (const entry of collisionMeshes) {
    const { box } = entry;
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (box.min.y > originY || box.max.y < originY - GROUND_RAY_FAR) continue;
    candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return null;

  for (const hit of groundRaycaster.intersectObjects(candidates, false)) {
    if (hit.point.y <= feetY + STEP_HEIGHT) return hit.point.y;
  }
  return null;
}

/**
 * Pins the player to the floor directly under them. Returns false when no
 * probe finds any floor at all — the caller then rejects the frame's move,
 * which is exactly what bounds the player to the walkable surface instead
 * of letting them walk off its edge into the void.
 */
function settleOnGround(player) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const originY = player.position.y + 0.2;
  for (const [dx, dz] of GROUND_PROBES) {
    const groundY = findGroundY(player.position.x + dx, player.position.z + dz, originY, feetY);
    if (groundY !== null) {
      player.position.y = groundY + PLAYER_HEIGHT;
      return true;
    }
  }
  return false;
}

function endLevel(title, subtitle) {
  readyToPlay = false;
  controls.unlock();
  overlayTitle.textContent = title;
  overlaySubtitle.textContent = subtitle;
  roomPicker.hidden = false;
}

function checkTriggers(player) {
  if (reachedExit || caught) return;

  for (const hazard of hazards) {
    const dx = player.position.x - hazard.mesh.position.x;
    const dz = player.position.z - hazard.mesh.position.z;
    if (Math.hypot(dx, dz) < hazard.radius + PLAYER_RADIUS) {
      caught = true;
      endLevel('Abstracted!', 'A patrolling hazard caught you — try again.');
      return;
    }
  }

  if (!triggers) return;
  triggerProbe.set(player.position.x, floorY + 0.5, player.position.z);

  if (!foundJax && triggers.jax.containsPoint(triggerProbe)) {
    foundJax = true;
    showHint('You found Jax. (Dialogue goes here.)');
  }

  if (triggers.exit.containsPoint(triggerProbe)) {
    reachedExit = true;
    endLevel(
      'Maze Complete!',
      foundJax ? 'You found Jax and the exit.' : 'You reached the exit — but never found Jax.',
    );
  }
}

function updateMovement(deltaSeconds) {
  const speed = WALK_SPEED * (move.sprint ? SPRINT_MULTIPLIER : 1);

  velocity.x = Number(move.right) - Number(move.left);
  velocity.z = Number(move.back) - Number(move.forward);
  if (velocity.lengthSq() > 0) velocity.normalize();
  velocity.multiplyScalar(speed * deltaSeconds);

  const player = controls.object;

  if (collisionMeshes.length > 0) {
    // GLB rooms: build the frame's displacement in world space exactly the
    // way controls.moveRight/moveForward would, but pass it through the
    // wall probes and the floor follow before it is applied.
    moveRight.setFromMatrixColumn(camera.matrix, 0);
    moveRight.y = 0;
    moveRight.normalize();
    moveForward.crossVectors(camera.up, moveRight).normalize();

    moveDelta
      .set(0, 0, 0)
      .addScaledVector(moveRight, velocity.x)
      .addScaledVector(moveForward, -velocity.z);

    const distance = moveDelta.length();
    if (distance > 1e-6) {
      moveDelta.divideScalar(distance);
      const prevX = player.position.x;
      const prevZ = player.position.z;

      moveWithCollisions(player, moveDelta, distance);

      if (bounds) {
        player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
        player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
      }

      if (!settleOnGround(player)) {
        // No floor anywhere under the new position — undo the step so the
        // walkable surface itself keeps the player in bounds.
        player.position.x = prevX;
        player.position.z = prevZ;
      }
    }
  } else {
    controls.moveRight(velocity.x);
    controls.moveForward(-velocity.z);

    resolveWallCollisions(player.position);

    if (bounds) {
      player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
      player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
      player.position.y = floorY + PLAYER_HEIGHT;
    }
  }

  checkTriggers(player);
}

// --- Resize ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Main loop ---
const clock = new THREE.Clock();

function animate() {
  const delta = clock.getDelta();
  updateMovers(delta);
  if (controls.isLocked) updateMovement(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

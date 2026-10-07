import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadPomniRoom } from './rooms/pomniRoom.js';
import { loadTadcRoom } from './rooms/tadcRoom.js';
import { loadMazeRoom } from './rooms/mazeRoom.js';
import { loadPomni } from './characters/pomni.js';
import { createDialogueUI } from './ui/DialogueUI.js';
import { SPEAKERS, preLevel1Dialogue, level1OpenDialogue } from './data/dialogues.js';

// Collision fires dozens of short rays a frame (wall probe, floor probes,
// body-overlap rings). Plain three.js tests a ray against every triangle of
// each candidate mesh, which makes walking crawl in dense rooms like Pomni's
// (~120k triangles, almost all of it around the player). A BVH per mesh lets
// each ray test only the handful of triangles near it. Meshes without one
// (skinned meshes) fall back to the regular raycast.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const DIALOGUE_SCRIPTS = {
  preLevel1: preLevel1Dialogue,
  level1Open: level1OpenDialogue,
};

const ROOM_LOADERS = {
  pomni: loadPomniRoom,
  tadc: loadTadcRoom,
  maze: loadMazeRoom,
};

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
// Kept close to the speeds Pomni's Walk/Run clips are authored at (see
// WALK_CLIP_SPEED/RUN_CLIP_SPEED) so her feet don't skate or blur.
const WALK_SPEED = 2.0; // metres per second
const SPRINT_MULTIPLIER = 2.0; // running speed = WALK_SPEED × this
const WALL_MARGIN = 0.4; // keep the camera this far from any wall
const STEP_HEIGHT = 0.4; // ledges up to this tall are stepped onto; taller ones block
const PROBE_HEIGHT = STEP_HEIGHT + 0.05; // height of the wall-probe ray above the feet
// Body-overlap rings, above the feet. Only the shin ring lets ramp-like
// faces through: a ramp the player can really walk up is always further
// than PLAYER_RADIUS away at chest/head height, so anything that close up
// there is solid — like the steep lip around the lobby stage, which is
// sloped enough to pass as a "ramp" but far too high to step onto.
const BODY_RINGS = [
  { height: PROBE_HEIGHT, skipRamps: true },
  { height: 1.0, skipRamps: false },
  { height: PLAYER_HEIGHT - 0.1, skipRamps: false },
];
// The wall probe holds the player exactly PLAYER_RADIUS off walls; anything
// nearer than this means the body is overlapping geometry.
const BODY_CLEARANCE = PLAYER_RADIUS * 0.8;
// The wall probe must lead a full PLAYER_RADIUS of clearance *along its own
// ray*; for an oblique approach that lead is PLAYER_RADIUS / |dir·normal|,
// so this reach keeps everything down to about 70° off a wall's normal
// stopping cleanly (grazing steps change clearance only in millimetres).
const PROBE_LEAD = PLAYER_RADIUS / 0.35;
const GROUND_RAY_FAR = 24; // how far below the player a floor still counts as "under" them
const WALKABLE_NORMAL_Y = 0.6; // faces tilted further than this are ramps, not walls
const INTERACT_DISTANCE = 4.5; // how far away a door etc. can be used from

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

// Generic studio reflections for rooms that ask for them (room.environment):
// metallic materials render black with nothing to reflect.
const environmentMap = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

// --- Player (Pomni) ---
// Stands in for the old first-person camera: position.y = feet + PLAYER_HEIGHT,
// so all the collision code below works unchanged.
const player = new THREE.Object3D();
scene.add(player);

let pomni = null;
let pomniMixer = null;
const pomniActions = {}; // lower-cased clip name -> AnimationAction
let currentAction = null;
const pomniReady = loadPomni().then(({ pomni: model, animations }) => {
  pomni = model;
  pomni.position.y = -PLAYER_HEIGHT; // feet on the floor
  player.add(pomni);

  if (animations.length > 0) {
    pomniMixer = new THREE.AnimationMixer(pomni);
    for (const clip of animations) pomniActions[clip.name.toLowerCase()] = pomniMixer.clipAction(clip);
    playAction('idle');
  }
});

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySubtitle = document.getElementById('overlay-subtitle');
const roomPicker = document.getElementById('room-picker');
const dialoguePicker = document.getElementById('dialogue-picker');
const crosshair = document.getElementById('crosshair');
const hint = document.getElementById('hint');
const interactPrompt = document.getElementById('prompt');

const dialogueUI = createDialogueUI({ speakers: SPEAKERS });

let currentRoom = null;
let readyToPlay = false;
let hintTimeout = null;

function showHint(text, durationMs = 3000) {
  hint.textContent = text;
  hint.classList.add('visible');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => hint.classList.remove('visible'), durationMs);
}

roomPicker.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation(); // don't also trigger the overlay's lock-on-click
    selectRoom(button.dataset.room);
  });
});

dialoguePicker.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    playDialoguePreview(button.dataset.dialogue);
  });
});

/**
 * Loads the TADC map as a backdrop (both scripts are set in the main tent)
 * and plays a dialogue script over it instead of the usual "Click to Play"
 * prompt. The pointer is never locked during this, so WASD/mouse-look stay
 * inert for free — the same "locks movement" behaviour the plan calls for
 * NPC interaction, achieved without a separate guard.
 */
function playDialoguePreview(key) {
  const script = DIALOGUE_SCRIPTS[key];
  if (!script) return;

  selectRoom('tadc', {
    onReady: () => {
      overlay.classList.add('hidden');
      readyToPlay = false;
      dialogueUI.play(script, {
        onComplete: () => {
          readyToPlay = true;
          overlay.classList.remove('hidden');
          overlayTitle.textContent = 'Click to Play';
          overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
        },
      });
    },
  });
}

function selectRoom(roomKey, { onReady } = {}) {
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
  roomUpdate = null;
  interactables = [];
  focusedInteractable = null;
  interactPrompt.hidden = true;
  foundJax = false;
  reachedExit = false;
  caught = false;
  roomPicker.hidden = true;
  dialoguePicker.hidden = true;
  overlay.classList.add('loading');
  overlayTitle.textContent = 'Loading…';
  overlaySubtitle.textContent = 'Fetching room model (0%)';

  Promise.all([
    loadRoom((ratio) => {
      overlaySubtitle.textContent = `Fetching room model (${Math.round(ratio * 100)}%)`;
    }),
    pomniReady,
  ])
    .then(([{
      group,
      bounds: box,
      spawn,
      spawnFacing,
      colliders: roomColliders,
      collisionMeshes: roomCollisionMeshes,
      triggers: roomTriggers,
      movers: roomMovers,
      hazards: roomHazards,
      update: roomUpdateFn,
      interactables: roomInteractables,
      environment: wantsEnvironment,
    }]) => {
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
        dynamic: entry.dynamic ?? false,
      }));
      dynamicCollisionMeshes = collisionMeshes.filter((entry) => entry.dynamic);
      for (const { mesh } of collisionMeshes) {
        // BVHs are in the mesh's local space, so swinging doors keep theirs.
        if (!mesh.isSkinnedMesh && !mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree();
      }
      triggers = roomTriggers ?? null;
      movers = roomMovers ?? [];
      hazards = roomHazards ?? [];
      roomUpdate = roomUpdateFn ?? null;
      interactables = roomInteractables ?? [];
      scene.environment = wantsEnvironment ? environmentMap : null;

      player.position.set(spawn.x, floorY + PLAYER_HEIGHT, spawn.z);
      // Rooms can request a starting yaw (the maze points the player down
      // whichever side of the start cell is actually open); anything that
      // doesn't specify one keeps the default of facing -Z.
      cameraYaw = spawnFacing ?? 0;
      pomni.rotation.y = cameraYaw + Math.PI; // her model faces +Z
      cameraPitch = DEFAULT_PITCH;
      currentCameraDistance = CAMERA_DISTANCE;

      // three.js compiles each material's shader the first time it comes
      // into view, which hitches mid-walk; compile them all up front instead,
      // now that the room's lights and environment are in place.
      renderer.compile(scene, camera);

      readyToPlay = true;
      overlay.classList.remove('loading');
      if (onReady) {
        onReady();
      } else {
        overlayTitle.textContent = 'Click to Play';
        overlaySubtitle.textContent = 'WASD / Arrow keys to move, mouse to look, Shift to sprint, E to interact — Esc to release the mouse';
      }
    })
    .catch((err) => {
      console.error('Failed to load room model', err);
      overlayTitle.textContent = 'Failed to load room';
      overlaySubtitle.textContent = 'Check the browser console for details.';
      roomPicker.hidden = false;
      dialoguePicker.hidden = false;
      overlay.classList.remove('loading');
    });
}

function disposeObject3D(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.dispose?.(); // e.g. a mirror's Reflector frees its render target
    child.geometry?.disposeBoundsTree();
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

window.addEventListener('keydown', (e) => {
  setMove(e.code, true);
  if (e.code === 'KeyE' && !e.repeat && isLocked && focusedInteractable) {
    focusedInteractable.interact();
  }
});
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
// Body-overlap check (see acceptMove): rays fanned around the player.
const BODY_RAY_DIRECTIONS = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
});
const bodyRaycaster = new THREE.Raycaster();
const moveStart = new THREE.Vector3();
const partDirection = new THREE.Vector3();

// Populated once a room model has loaded and its real bounding box is known.
let bounds = null;
let floorY = 0;
// --- Pointer lock + third-person mouse look ---
const MOUSE_SENSITIVITY = 0.0025;
const PITCH_MIN = -0.4; // radians; below 0 = camera under her head looking up
const PITCH_MAX = 1.2;  // looking down from above
const DEFAULT_PITCH = 0.25;

let isLocked = false;
let cameraYaw = 0; // 0 = looking toward -Z, the spawn facing
let cameraPitch = DEFAULT_PITCH;

// Third-person follow camera (see updateCamera).
const CAMERA_DISTANCE = 3.2;        // how far behind Pomni
const CAMERA_TARGET_DROP = 0.3;     // aim at her shoulders, a bit below PLAYER_HEIGHT
const CAMERA_COLLISION_PAD = 0.25;  // stay this far in front of any wall
const CAMERA_RETURN_SHARPNESS = 6;  // how fast it eases back out after a wall
const MIN_VISIBLE_DISTANCE = 0.7;   // hide Pomni if the camera is inside her
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3();
const cameraHitPoint = new THREE.Vector3();
const cameraRaycaster = new THREE.Raycaster();
let currentCameraDistance = CAMERA_DISTANCE;

// Pomni turning and her walk animation (see updatePomniWalk).
const TURN_SHARPNESS = 14;     // higher = snappier turning
// Ground speed each clip's feet move at, measured at POMNI_HEIGHT; the clip
// is sped up/slowed down by actual speed ÷ this so her feet stay planted.
const WALK_CLIP_SPEED = 1.1;
const RUN_CLIP_SPEED = 2.85;
const RUN_THRESHOLD = WALK_SPEED * 1.4; // above this she's sprinting
const ACTION_FADE = 0.2;       // seconds to cross-fade between clips
let animSpeed = 0;             // smoothed ground speed, so clips don't flicker
// Fallback hop-and-waddle for a model without clips (e.g. the placeholder).
const STEPS_PER_METRE = 1.4;
const WALK_BOB_HEIGHT = 0.06;  // metres of hop per step
const WALK_SWAY = 0.08;        // radians of side-to-side waddle
const wishDirection = new THREE.Vector3();
let walkPhase = 0;
let walkAmount = 0;

overlay.addEventListener('click', () => {
  if (!readyToPlay) return;
  renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  isLocked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', isLocked);
  crosshair.hidden = !isLocked;
  // Esc mid-game is a pause: offer the menus so the player can switch rooms
  // without reloading. (endLevel clears readyToPlay before unlocking, so its
  // own title and subtitle are left alone.)
  if (!isLocked && readyToPlay) {
    overlayTitle.textContent = 'Paused';
    overlaySubtitle.textContent = 'Click to resume, or choose a room below';
    roomPicker.hidden = false;
    dialoguePicker.hidden = false;
  }
});
document.addEventListener('mousemove', (e) => {
  if (!isLocked) return;
  cameraYaw -= e.movementX * MOUSE_SENSITIVITY;
  cameraPitch = THREE.MathUtils.clamp(
    cameraPitch + e.movementY * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX,
  );
});

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
// Per-frame hook for room-specific animation (e.g. Caine's idle in Pomni's room).
let roomUpdate = null;
// Moving collision meshes (e.g. swinging doors): their boxes are refreshed every frame.
let dynamicCollisionMeshes = [];
// Things the player can use with E: { objects: Mesh[], prompt(): string, interact() }.
let interactables = [];
let focusedInteractable = null;
const interactRaycaster = new THREE.Raycaster();
const SCREEN_CENTER = new THREE.Vector2(0, 0);
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

/**
 * Finishes a GLB-room step: clamps to the room, follows the floor, and
 * checks the whole body is clear of geometry. The wall probe is a single
 * ray at shin height, so on its own it lets the player's sides squeeze
 * into gaps narrower than they are (between the toy blocks by the stage),
 * or drop from a ledge into geometry — and these rooms' double-sided
 * meshes then wall them in from every side. A step that leaves the body
 * overlapping something is refused — unless the player already overlapped
 * (a door swung into them) and the step doesn't make it worse, so they can
 * always walk back out.
 */
function acceptMove(player, startClearance) {
  if (bounds) {
    player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
  }
  // No floor anywhere under the new position: the walkable surface itself
  // keeps the player in bounds.
  if (!settleOnGround(player)) return false;

  const clearance = bodyClearance(player);
  return clearance >= BODY_CLEARANCE || clearance >= startClearance - 1e-3;
}

/**
 * How close the player's body is to any non-floor geometry: the shortest
 * hit of rings of short horizontal rays at shin, chest and head height, or
 * Infinity when nothing is within PLAYER_RADIUS.
 */
function bodyClearance(player) {
  const feetY = player.position.y - PLAYER_HEIGHT;
  const { x, z } = player.position;

  const candidates = [];
  for (const entry of collisionMeshes) {
    const box = entry.paddedBox;
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (box.max.y < feetY + PROBE_HEIGHT || box.min.y > feetY + PLAYER_HEIGHT) continue;
    candidates.push(entry.mesh);
  }
  if (candidates.length === 0) return Infinity;

  let closest = Infinity;
  bodyRaycaster.far = PLAYER_RADIUS;
  for (const { height, skipRamps } of BODY_RINGS) {
    probeOrigin.set(x, feetY + height, z);
    for (const direction of BODY_RAY_DIRECTIONS) {
      bodyRaycaster.set(probeOrigin, direction);
      for (const hit of bodyRaycaster.intersectObjects(candidates, false)) {
        if (skipRamps) {
          normalMatrix.getNormalMatrix(hit.object.matrixWorld);
          faceNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize();
          if (Math.abs(faceNormal.y) > WALKABLE_NORMAL_Y) continue; // floor/ramp, not a wall
        }
        closest = Math.min(closest, hit.distance);
        break;
      }
    }
  }
  return closest;
}

function endLevel(title, subtitle) {
  readyToPlay = false;
  document.exitPointerLock();
  overlayTitle.textContent = title;
  overlaySubtitle.textContent = subtitle;
  roomPicker.hidden = false;
  dialoguePicker.hidden = false;
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

  // Camera-relative basis: W always walks "into the screen".
  moveForward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
  moveRight.set(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));

  // Turn Pomni toward the direction she's being steered.
  wishDirection.set(0, 0, 0)
    .addScaledVector(moveRight, velocity.x)
    .addScaledVector(moveForward, -velocity.z);
  if (wishDirection.lengthSq() > 1e-8) {
    const targetYaw = Math.atan2(wishDirection.x, wishDirection.z);
    pomni.rotation.y = dampAngle(pomni.rotation.y, targetYaw, TURN_SHARPNESS, deltaSeconds);
  }

  const frameStartX = player.position.x;
  const frameStartZ = player.position.z;

  if (collisionMeshes.length > 0) {
    // GLB rooms: pass the frame's displacement through the wall probes and
    // the floor follow before it is applied.
    moveDelta
      .set(0, 0, 0)
      .addScaledVector(moveRight, velocity.x)
      .addScaledVector(moveForward, -velocity.z);

    const distance = moveDelta.length();
    if (distance > 1e-6) {
      moveDelta.divideScalar(distance);
      moveStart.copy(player.position);
      const startClearance = bodyClearance(player);

      moveWithCollisions(player, moveDelta, distance);
      if (!acceptMove(player, startClearance)) {
        // Blocked as a whole: try the X and Z parts on their own, so the
        // player still slides past instead of sticking.
        moveDelta.subVectors(player.position, moveStart).setY(0);
        const parts = [[moveDelta.x, 0], [0, moveDelta.z]];
        let accepted = false;
        for (const [dx, dz] of parts) {
          const length = Math.hypot(dx, dz);
          if (length < 1e-6) continue;
          player.position.copy(moveStart);
          moveWithCollisions(player, partDirection.set(dx / length, 0, dz / length), length);
          if (acceptMove(player, startClearance)) {
            accepted = true;
            break;
          }
        }
        if (!accepted) player.position.copy(moveStart);
      }
    }
  } else {
    player.position.addScaledVector(moveRight, velocity.x).addScaledVector(moveForward, -velocity.z);

    resolveWallCollisions(player.position);

    if (bounds) {
      player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
      player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
      player.position.y = floorY + PLAYER_HEIGHT;
    }
  }

  // Animate from how far she actually got, so walking into a wall doesn't bob.
  const moved = Math.hypot(player.position.x - frameStartX, player.position.z - frameStartZ);
  updatePomniWalk(deltaSeconds, deltaSeconds > 0 ? moved / deltaSeconds : 0);

  checkTriggers(player);
}

/** Frame-rate-independent turn toward `target`, always taking the short way round. */
function dampAngle(current, target, sharpness, dt) {
  const diff = THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
  return current + diff * (1 - Math.exp(-sharpness * dt));
}

/**
 * Plays Idle/Walk/Run from her real ground speed, scaling the clip's
 * playback so her feet match how fast she's actually moving. Without
 * clips (the placeholder), walking is faked: a small hop per step plus a
 * side-to-side waddle, faded in and out with her speed.
 */
function updatePomniWalk(dt, speed) {
  if (pomniMixer) {
    animSpeed = THREE.MathUtils.damp(animSpeed, speed, 12, dt);
    if (animSpeed < 0.2) {
      playAction('idle');
    } else if (animSpeed > RUN_THRESHOLD && pomniActions.run) {
      playAction('run');
      pomniActions.run.timeScale = animSpeed / RUN_CLIP_SPEED;
    } else {
      playAction('walk');
      pomniActions.walk.timeScale = animSpeed / WALK_CLIP_SPEED;
    }
    pomniMixer.update(dt);
    return;
  }

  walkAmount = THREE.MathUtils.damp(walkAmount, speed > 0.1 ? 1 : 0, 10, dt);
  walkPhase += speed * dt * STEPS_PER_METRE * Math.PI;

  pomni.position.y = -PLAYER_HEIGHT + Math.abs(Math.sin(walkPhase)) * WALK_BOB_HEIGHT * walkAmount;
  pomni.rotation.z = Math.sin(walkPhase) * WALK_SWAY * walkAmount;
}

/** Cross-fades from whatever Pomni is playing to the named clip. */
function playAction(name) {
  const next = pomniActions[name];
  if (!next || next === currentAction) return;
  next.reset().fadeIn(ACTION_FADE).play();
  currentAction?.fadeOut(ACTION_FADE);
  currentAction = next;
}

// --- Third-person follow camera ---

function updateCamera(dt) {
  cameraTarget.set(player.position.x, player.position.y - CAMERA_TARGET_DROP, player.position.z);
  cameraOffset.set(
    Math.sin(cameraYaw) * Math.cos(cameraPitch),
    Math.sin(cameraPitch),
    Math.cos(cameraYaw) * Math.cos(cameraPitch),
  ); // unit vector pointing from Pomni back toward the camera

  // Snap in instantly when a wall gets in the way (so it never clips through),
  // but ease back out smoothly once it's clear.
  const allowed = cameraCollisionDistance(cameraTarget, cameraOffset, CAMERA_DISTANCE);
  currentCameraDistance = allowed < currentCameraDistance
    ? allowed
    : THREE.MathUtils.damp(currentCameraDistance, allowed, CAMERA_RETURN_SHARPNESS, dt);

  camera.position.copy(cameraTarget).addScaledVector(cameraOffset, currentCameraDistance);
  camera.lookAt(cameraTarget);

  pomni.visible = currentCameraDistance > MIN_VISIBLE_DISTANCE;
}

/** How far the camera can sit along `direction` before hitting the room. */
function cameraCollisionDistance(origin, direction, maxDistance) {
  const reach = maxDistance + CAMERA_COLLISION_PAD;
  cameraRaycaster.set(origin, direction);
  cameraRaycaster.far = reach;
  let nearest = reach;

  // GLB rooms: same box broad-phase as firstWallHit, then exact triangles.
  const candidates = [];
  for (const entry of collisionMeshes) {
    if (cameraRaycaster.ray.intersectsBox(entry.box)) candidates.push(entry.mesh);
  }
  const hit = cameraRaycaster.intersectObjects(candidates, false)[0];
  if (hit) nearest = Math.min(nearest, hit.distance);

  // Maze: walls are plain Box3s, not meshes.
  for (const box of colliders) {
    if (cameraRaycaster.ray.intersectBox(box, cameraHitPoint)) {
      nearest = Math.min(nearest, cameraHitPoint.distanceTo(origin));
    }
  }
  return Math.max(0, nearest - CAMERA_COLLISION_PAD);
}

function refreshDynamicColliders() {
  for (const entry of dynamicCollisionMeshes) {
    entry.box.setFromObject(entry.mesh);
    entry.paddedBox.copy(entry.box).expandByScalar(PLAYER_RADIUS);
  }
}

/**
 * Finds the interactable under the crosshair, if it's within reach, and
 * shows its prompt. Only interactables are tested, so a door behind a
 * thin prop still counts — fine at this short range.
 */
function updateInteractionFocus() {
  let focused = null;
  if (isLocked && interactables.length > 0) {
    // The crosshair ray starts behind Pomni, so reach is measured from her.
    interactRaycaster.setFromCamera(SCREEN_CENTER, camera);
    interactRaycaster.far = INTERACT_DISTANCE + currentCameraDistance;
    const hit = interactRaycaster.intersectObjects(interactables.flatMap((i) => i.objects), false)[0];
    if (hit && hit.point.distanceTo(player.position) <= INTERACT_DISTANCE) {
      focused = interactables.find((i) => i.objects.includes(hit.object));
    }
  }

  focusedInteractable = focused;
  interactPrompt.hidden = !focused;
  if (focused) interactPrompt.textContent = `E — ${focused.prompt()}`;
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
  roomUpdate?.(delta);
  refreshDynamicColliders();
  if (pomni) {
    if (isLocked) updateMovement(delta);
    else updatePomniWalk(delta, 0); // settle the waddle while paused
    updateCamera(delta);
  }
  updateInteractionFocus();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { loadPomniRoom } from './rooms/pomniRoom.js';
import { loadTadcRoom } from './rooms/tadcRoom.js';

const ROOM_LOADERS = {
  pomni: loadPomniRoom,
  tadc: loadTadcRoom,
};

const PLAYER_HEIGHT = 1.7;
const WALK_SPEED = 3.0;
const SPRINT_MULTIPLIER = 1.8;
const WALL_MARGIN = 0.4; // keep the camera this far from any wall

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

let currentRoom = null;
let readyToPlay = false;

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
  roomPicker.hidden = true;
  overlay.classList.add('loading');
  overlayTitle.textContent = 'Loading…';
  overlaySubtitle.textContent = 'Fetching room model (0%)';

  loadRoom((ratio) => {
    overlaySubtitle.textContent = `Fetching room model (${Math.round(ratio * 100)}%)`;
  })
    .then(({ group, bounds: box, spawn }) => {
      currentRoom = group;
      scene.add(group);

      floorY = spawn.y;
      bounds = {
        minX: box.min.x + WALL_MARGIN,
        maxX: box.max.x - WALL_MARGIN,
        minZ: box.min.z + WALL_MARGIN,
        maxZ: box.max.z - WALL_MARGIN,
      };

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

// Populated once a room model has loaded and its real bounding box is known.
let bounds = null;
let floorY = 0;

function updateMovement(deltaSeconds) {
  const speed = WALK_SPEED * (move.sprint ? SPRINT_MULTIPLIER : 1);

  velocity.x = Number(move.right) - Number(move.left);
  velocity.z = Number(move.back) - Number(move.forward);
  if (velocity.lengthSq() > 0) velocity.normalize();
  velocity.multiplyScalar(speed * deltaSeconds);

  controls.moveRight(velocity.x);
  controls.moveForward(-velocity.z);

  if (bounds) {
    const player = controls.object;
    player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
    player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
    player.position.y = floorY + PLAYER_HEIGHT;
  }
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
  if (controls.isLocked) updateMovement(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();

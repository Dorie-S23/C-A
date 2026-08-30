import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { createRoom, ROOM } from './room.js';

const PLAYER_HEIGHT = 1.7;
const WALK_SPEED = 4.0;
const SPRINT_MULTIPLIER = 1.8;
const WALL_MARGIN = 0.4; // keep the camera this far from any wall

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1a1d);

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, PLAYER_HEIGHT, 4);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

scene.add(createRoom());

const ambient = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(ambient);

// --- Pointer-lock first-person controls ---
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.object);

const overlay = document.getElementById('overlay');
const crosshair = document.getElementById('crosshair');

overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => {
  overlay.classList.add('hidden');
  crosshair.hidden = false;
});
controls.addEventListener('unlock', () => {
  overlay.classList.remove('hidden');
  crosshair.hidden = true;
});

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
const bounds = {
  minX: -ROOM.width / 2 + WALL_MARGIN,
  maxX: ROOM.width / 2 - WALL_MARGIN,
  minZ: -ROOM.depth / 2 + WALL_MARGIN,
  maxZ: ROOM.depth / 2 - WALL_MARGIN,
};

function updateMovement(deltaSeconds) {
  const speed = WALK_SPEED * (move.sprint ? SPRINT_MULTIPLIER : 1);

  velocity.x = Number(move.right) - Number(move.left);
  velocity.z = Number(move.back) - Number(move.forward);
  if (velocity.lengthSq() > 0) velocity.normalize();
  velocity.multiplyScalar(speed * deltaSeconds);

  controls.moveRight(velocity.x);
  controls.moveForward(-velocity.z);

  const player = controls.object;
  player.position.x = THREE.MathUtils.clamp(player.position.x, bounds.minX, bounds.maxX);
  player.position.z = THREE.MathUtils.clamp(player.position.z, bounds.minZ, bounds.maxZ);
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

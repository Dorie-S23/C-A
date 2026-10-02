// Node verification harness for the main.js wall-probe/slide/floor-follow
// logic: exercises it against real three.js meshes (no DOM needed).
// Run with `node _verify_collision.mjs`.
import * as THREE from 'three';

const PLAYER_RADIUS = 0.35;
const PLAYER_HEIGHT = 1.7;
const STEP_HEIGHT = 0.4;
const PROBE_HEIGHT = STEP_HEIGHT + 0.05;
const WALKABLE_NORMAL_Y = 0.6;
const PROBE_LEAD = PLAYER_RADIUS / 0.35;
const GROUND_RAY_FAR = 24;

// --- copies of the main.js helpers under test ---
const faceNormal = new THREE.Vector3();
const hitNormal = new THREE.Vector3();
const normalMatrix = new THREE.Matrix3();
const probeOrigin = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wallRaycaster = new THREE.Raycaster();
const groundRaycaster = new THREE.Raycaster();

function firstWallHit(collisionMeshes, origin, direction, distance) {
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
    if (faceNormal.dot(direction) > 0) faceNormal.negate();
    if (Math.abs(faceNormal.y) > WALKABLE_NORMAL_Y) continue;
    hitNormal.set(faceNormal.x, 0, faceNormal.z).normalize();
    return { distance: hit.distance, normal: hitNormal };
  }
  return null;
}

function moveWithCollisions(collisionMeshes, player, direction, distance) {
  probeOrigin.set(player.x, player.y - PLAYER_HEIGHT + PROBE_HEIGHT, player.z);
  const hit = firstWallHit(collisionMeshes, probeOrigin, direction, distance + PROBE_LEAD);
  if (!hit) { player.addScaledVector(direction, distance); return; }

  const approach = -(direction.x * hit.normal.x + direction.z * hit.normal.z);
  if (approach < 1e-4) { player.addScaledVector(hit.normal, PLAYER_RADIUS); return; }

  const clearance = hit.distance * approach;
  if (clearance < PLAYER_RADIUS) {
    player.addScaledVector(hit.normal, PLAYER_RADIUS - clearance);
    return;
  }

  const allowed = Math.min(distance, (clearance - PLAYER_RADIUS) / approach);
  player.addScaledVector(direction, allowed);
  const leftover = distance - allowed;
  if (leftover < 1e-4) return;

  const slideDelta = new THREE.Vector3(direction.x * leftover, 0, direction.z * leftover);
  slideDelta.addScaledVector(hit.normal, -slideDelta.dot(hit.normal));
  const slideLength = slideDelta.length();
  if (slideLength < 1e-4) return;
  slideDelta.divideScalar(slideLength);
  probeOrigin.set(player.x, player.y - PLAYER_HEIGHT + PROBE_HEIGHT, player.z);
  const slideHit = firstWallHit(collisionMeshes, probeOrigin, slideDelta, slideLength + PROBE_LEAD);
  let slideAllowed = slideLength;
  if (slideHit) {
    const slideApproach = -(slideDelta.x * slideHit.normal.x + slideDelta.z * slideHit.normal.z);
    slideAllowed = slideApproach < 1e-4
      ? 0
      : Math.max(0, Math.min(slideLength, (slideHit.distance * slideApproach - PLAYER_RADIUS) / slideApproach));
  }
  player.addScaledVector(slideDelta, slideAllowed);
}

function findGroundY(collisionMeshes, x, z, originY, feetY) {
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

// --- scene building ---
function entry(mesh) {
  const box = new THREE.Box3().setFromObject(mesh);
  return { mesh, box, paddedBox: box.clone().expandByScalar(PLAYER_RADIUS) };
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

// 1) wall 3m ahead, rotated 30° (not axis-aligned): step in, then slide along it
{
  const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 3, 0.2));
  wall.rotation.y = Math.PI / 6;
  wall.position.set(0, 1.5, -3);
  wall.updateMatrixWorld(true);
  const meshes = [entry(wall)];
  const faceN = new THREE.Vector3(0, 0, 1).applyQuaternion(wall.quaternion).normalize();
  const facePoint = wall.localToWorld(new THREE.Vector3(0, 0, 0.1));
  const clearanceOf = (p) => faceN.dot(new THREE.Vector3().copy(p).sub(facePoint));

  const player = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
  const dir = new THREE.Vector3(0, 0, -1);
  let minClearance = Infinity;
  for (let i = 0; i < 100; i++) {
    moveWithCollisions(meshes, player, dir, 0.09);
    minClearance = Math.min(minClearance, clearanceOf(player));
  }
  check('rotated wall never penetrated', minClearance >= PLAYER_RADIUS - 0.02,
    `minClearance=${minClearance.toFixed(3)}`);
  check('slide carried the player along the angled wall', player.x > 2,
    `x=${player.x.toFixed(2)}, z=${player.z.toFixed(2)}`);
}

// 2) diagonal into a flat wall -> slides sideways without sticking
{
  const wall = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 0.2));
  wall.position.set(0, 1.5, -3);
  wall.updateMatrixWorld(true);
  const meshes = [entry(wall)];
  const player = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
  const dir = new THREE.Vector3(1, 0, -1).normalize();
  let minClearance = Infinity;
  for (let i = 0; i < 100; i++) {
    moveWithCollisions(meshes, player, dir, 0.09);
    minClearance = Math.min(minClearance, player.z + 2.9); // wall face at z = -2.9
  }
  check('diagonal approach keeps full clearance', minClearance >= PLAYER_RADIUS - 0.02,
    `minClearance=${minClearance.toFixed(3)}`);
  check('diagonal approach slides along wall (+X)', player.x > 4, `x=${player.x.toFixed(2)}`);
  check('slide never crosses the wall', player.z > -2.9 + PLAYER_RADIUS - 0.02, `z=${player.z.toFixed(3)}`);
}

// 3) step-height ledge is not a wall, chest-high is
{
  const low = new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2));
  low.position.set(0, 0.2, -2);
  low.updateMatrixWorld(true);
  const high = low.clone();
  high.geometry = new THREE.BoxGeometry(2, 1.2, 2);
  high.position.set(4, 0.6, -2);
  high.updateMatrixWorld(true);
  const meshes = [entry(low), entry(high)];

  const p1 = new THREE.Vector3(0, PLAYER_HEIGHT, 0);
  for (let i = 0; i < 60; i++) moveWithCollisions(meshes, p1, new THREE.Vector3(0, 0, -1), 0.09);
  check('0.4 ledge does not block (stepped over)', p1.z < -1.5, `z=${p1.z.toFixed(2)}`);

  const p2 = new THREE.Vector3(4, PLAYER_HEIGHT, 0);
  for (let i = 0; i < 60; i++) moveWithCollisions(meshes, p2, new THREE.Vector3(0, 0, -1), 0.09);
  check('1.2 block blocks the walk', p2.z > -1 + PLAYER_RADIUS - 0.02, `z=${p2.z.toFixed(2)}`);
}

// 4) ground raycast: floor at 0 under everything; a thigh-high box scanned over
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50));
  floor.rotation.x = -Math.PI / 2;
  floor.updateMatrixWorld(true);
  const box = new THREE.Mesh(new THREE.BoxGeometry(2, 0.3, 2));
  box.position.set(3, 0.15, 0);
  box.updateMatrixWorld(true);
  const meshes = [entry(floor), entry(box)];

  const g1 = findGroundY(meshes, 0, 0, PLAYER_HEIGHT + 0.2, 0);
  check('floor found at y=0', g1 !== null && Math.abs(g1) < 1e-6, `y=${g1}`);
  const g2 = findGroundY(meshes, 3, 0, PLAYER_HEIGHT + 0.2, 0);
  check('0.3 step top is stepped onto', g2 !== null && Math.abs(g2 - 0.3) < 1e-6, `y=${g2}`);
  const g3 = findGroundY(meshes, 3, 0, PLAYER_HEIGHT + 0.2, 0.3);
  check('standing on the step stays at 0.3', g3 !== null && Math.abs(g3 - 0.3) < 1e-6, `y=${g3}`);
  const g4 = findGroundY(meshes, 99, 99, PLAYER_HEIGHT + 0.2, 0);
  check('no floor off the map -> null', g4 === null, `y=${g4}`);
}

// 5) far clipping + prefilter sanity: wall 5m away is outside a 1m probe
{
  const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.2));
  wall.position.set(0, 1.5, -5);
  wall.updateMatrixWorld(true);
  const meshes = [entry(wall)];
  const origin = new THREE.Vector3(0, PROBE_HEIGHT, 0);
  const hit = firstWallHit(meshes, origin, new THREE.Vector3(0, 0, -1), 1);
  check('far-clipped probe finds nothing at 5m', hit === null);
}

// 6) double-sided back faces: walking away and back still collides
{
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(10, 3, 0.2),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  wall.position.set(0, 1.5, 0);
  wall.updateMatrixWorld(true);
  const meshes = [entry(wall)];
  const player = new THREE.Vector3(0, PLAYER_HEIGHT, 2);
  for (let i = 0; i < 80; i++) moveWithCollisions(meshes, player, new THREE.Vector3(0, 0, -1), 0.09);
  check('back side of double-sided wall collides too', player.z > PLAYER_RADIUS - 0.02,
    `z=${player.z.toFixed(3)}`);
}

// 7) movement basis: camera at yaw 0 must give right=(1,0,0), forward=(0,0,-1)
{
  const camera = new THREE.PerspectiveCamera();
  camera.updateMatrixWorld(true);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  right.y = 0;
  right.normalize();
  const forward = new THREE.Vector3().crossVectors(camera.up, right).normalize();
  check('move basis right', right.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6, right.toArray().join(','));
  check('move basis forward', forward.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-6, forward.toArray().join(','));
  camera.rotation.y = -Math.PI / 2; // yaw -90°: camera faces +X world
  camera.updateMatrixWorld(true);
  right.setFromMatrixColumn(camera.matrix, 0);
  right.y = 0;
  right.normalize();
  forward.crossVectors(camera.up, right).normalize();
  check('move basis rotates with yaw', forward.distanceTo(new THREE.Vector3(1, 0, 0)) < 1e-6,
    forward.toArray().join(','));
}

// 8) back-face hits: three culls back faces for single-sided materials, but
// on double-sided back-face hits it reports the *un-flipped* geometric
// normal — main.js must reorient it or the player is pushed through the wall
{
  // plane faces +Z, so a player approaching from -Z hits its back side
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
  );
  back.updateMatrixWorld(true);
  const meshes = [entry(back)];
  const p1 = new THREE.Vector3(0, PLAYER_HEIGHT, -2);
  for (let i = 0; i < 40; i++) moveWithCollisions(meshes, p1, new THREE.Vector3(0, 0, 1), 0.09);
  check('double-sided plane stops the walk from its back side',
    Math.abs(p1.z + PLAYER_RADIUS) < 0.02, `z=${p1.z.toFixed(3)}`);

  const front = back.clone();
  front.material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  front.updateMatrixWorld(true);
  const meshes2 = [entry(front)];
  const backHit = firstWallHit(meshes2, new THREE.Vector3(0, PROBE_HEIGHT, -2),
    new THREE.Vector3(0, 0, 1), 5);
  check('single-sided plane ignores its invisible back side', backHit === null);

  const p2 = new THREE.Vector3(0, PLAYER_HEIGHT, 2);
  for (let i = 0; i < 40; i++) moveWithCollisions(meshes2, p2, new THREE.Vector3(0, 0, -1), 0.09);
  check('single-sided plane still blocks from its front side',
    Math.abs(p2.z - PLAYER_RADIUS) < 0.02, `z=${p2.z.toFixed(3)}`);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);

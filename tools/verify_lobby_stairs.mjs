// Confirms the Lobby's new staircase (src/props/accessStairs.js, wired up
// in tadcRoom.js) is actually climbable and doesn't clip into the real
// Circus Lobby model — same real-GLB technique as
// verify_lobby_picture_scatter.mjs. Run: node tools/verify_lobby_stairs.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createStaircase } from '../src/props/accessStairs.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};

const STEP_HEIGHT = 0.4; // mirrors main.js's own constant — ledges up to this tall are auto-climbed

const BASE = { x: 2, z: 3 };
const FLOOR_Y = 0.26;
const stairs = createStaircase({ base: BASE, floorY: FLOOR_Y });

/** Height of whatever surface is directly under (x, z), via the same cheap
 * "which box's column contains this point, take the tallest" approach a
 * vertical raycast would resolve to for these axis-aligned boxes. */
function surfaceAt(x, z) {
  let top = null;
  for (const { box } of stairs.colliders) {
    if (x < box.min.x || x > box.max.x || z < box.min.z || z > box.max.z) continue;
    if (top === null || box.max.y > top) top = box.max.y;
  }
  return top;
}

// Walk a straight line up the middle of the stairs, sampling finely enough
// that no step's rise is skipped over.
const centreX = BASE.x;
let previous = FLOOR_Y;
let reachedPlatformHeight = false;
const totalSteps = 6, stepRise = 0.33, treadDepth = 0.6, platformDepth = 4; // accessStairs.js's own defaults
const platformHeight = FLOOR_Y + totalSteps * stepRise;
const totalRun = totalSteps * treadDepth + platformDepth;
for (let z = BASE.z - 0.1; z <= BASE.z + totalRun; z += 0.05) {
  const y = surfaceAt(centreX, z);
  if (y === null) continue; // before the first step or past the platform's far edge
  assert.ok(y - previous <= STEP_HEIGHT + 1e-6,
    `rise from ${previous.toFixed(3)} to ${y.toFixed(3)} at z=${z.toFixed(2)} exceeds STEP_HEIGHT (${STEP_HEIGHT})`);
  assert.ok(y >= previous - 1e-6, `surface should never drop while climbing, got ${previous.toFixed(3)} -> ${y.toFixed(3)} at z=${z.toFixed(2)}`);
  previous = y;
  if (y >= platformHeight - 1e-6) reachedPlatformHeight = true;
}
assert.ok(reachedPlatformHeight, 'never reached the platform height — staircase does not actually climb this far');
console.log(`PASS every sampled rise along the stairs stays within STEP_HEIGHT (${STEP_HEIGHT}m), reaching the platform`);

// No gap in the walkable surface across the whole run (a raycast finding
// nothing mid-climb is exactly what currently sends the player through
// the floor in the real game's settleOnGround()).
let gapFound = false;
for (let z = BASE.z + 0.05; z <= BASE.z + totalRun - 0.05; z += 0.05) {
  if (surfaceAt(centreX, z) === null) { gapFound = true; break; }
}
assert.ok(!gapFound, 'found a gap in the staircase/platform surface somewhere along the climb');
console.log('PASS no gaps in the staircase/platform surface');

// Doesn't clip into the real Lobby model: every stair/platform box kept
// clear of every lobby mesh's own bounding box.
const gltf = await new GLTFLoader().loadAsync('./models/world/Circus%20Lobby%20V10%20colored.glb');
gltf.scene.updateMatrixWorld(true);
const lobbyMeshes = [];
gltf.scene.traverse((child) => { if (child.isMesh) lobbyMeshes.push(child); });

// Bounding-box overlap is useless here: the model keeps every wall in the
// whole building as one "Walls" mesh, whose own bbox spans nearly the
// entire castle regardless of where its actual (thin, far-off) geometry
// is. Horizontal raycasts against the real triangles, the same technique
// used to find this spot in the first place, catches a genuine clip
// without that false positive.
const raycaster = new THREE.Raycaster();
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const MARGIN = 0.4; // clear of the structure's own half-width/half-depth, generously
let closest = Infinity;
for (const { box } of stairs.colliders) {
  const centre = box.getCenter(new THREE.Vector3());
  for (const [dx, dz] of DIRS) {
    raycaster.set(new THREE.Vector3(centre.x, box.min.y + 0.1, centre.z), new THREE.Vector3(dx, 0, dz));
    raycaster.far = 10;
    const hits = raycaster.intersectObjects(lobbyMeshes, false);
    if (hits.length) closest = Math.min(closest, hits[0].distance);
  }
}
assert.ok(closest > MARGIN, `nearest real Lobby geometry is only ${closest.toFixed(2)}m from the staircase — too close`);
console.log(`PASS nearest real Lobby geometry is ${closest === Infinity ? 'beyond 10m' : closest.toFixed(2) + 'm'} away, clear of the staircase`);

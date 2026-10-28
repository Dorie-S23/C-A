// Regenerates src/rooms/lobbyReach.js: which parts of the Circus Lobby's
// floor Pomni can actually walk to from the spawn. Level 2's photo scatter
// uses it so no photo ends up sealed inside the toy-block walls or the
// poles' hollow bases (both happened: the sweep's grid origins can land
// inside them). Run after changing the Lobby model, the castle walls or
// the staircase: node tools/buildLobbyReach.mjs
//
// A flood fill over a 0.5 m grid from the spawn, moving the way main.js
// does: a step is blocked by anything within reach at shin, waist or head
// height, may climb at most STEP_HEIGHT, and a cell narrower than the
// player's body doesn't count. Jumping isn't counted, so every photo can
// be reached on foot.
import '../tools/testCanvas.mjs';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadTadcRoom } from '../src/rooms/tadcRoom.js';

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
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const STEP = 0.5;                 // grid cell, metres
const STEP_HEIGHT = 0.4;          // mirrors main.js
const PLAYER_RADIUS = 0.35;       // mirrors main.js
const BODY_CLEARANCE = PLAYER_RADIUS * 0.8;
const BODY_HEIGHTS = [0.45, 1.0, 1.6];
const AREA = { minX: -80, maxX: 170, minZ: -75, maxZ: 115 }; // the tent's floor, with margin

const room = await loadTadcRoom(null, {});
room.group.updateMatrixWorld(true);
const entries = room.collisionMeshes.filter(({ mesh }) => !mesh.isSkinnedMesh);
for (const { mesh } of entries) if (!mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);

// Each ray only tests the meshes whose boxes its own box touches.
const BUCKET = 4;
const buckets = new Map();
const bucketKey = (i, j) => `${i},${j}`;
for (const entry of entries) {
  const { min, max } = entry.box;
  for (let i = Math.floor(min.x / BUCKET); i <= Math.floor(max.x / BUCKET); i++) {
    for (let j = Math.floor(min.z / BUCKET); j <= Math.floor(max.z / BUCKET); j++) {
      const key = bucketKey(i, j);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(entry);
    }
  }
}
const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;
const segment = new THREE.Box3();
const end = new THREE.Vector3();
function blocked(origin, direction, far) {
  end.copy(origin).addScaledVector(direction, far);
  segment.makeEmpty().expandByPoint(origin).expandByPoint(end);
  const near = new Set();
  for (let i = Math.floor(segment.min.x / BUCKET); i <= Math.floor(segment.max.x / BUCKET); i++) {
    for (let j = Math.floor(segment.min.z / BUCKET); j <= Math.floor(segment.max.z / BUCKET); j++) {
      for (const entry of buckets.get(bucketKey(i, j)) ?? []) if (entry.box.intersectsBox(segment)) near.add(entry.mesh);
    }
  }
  if (!near.size) return null;
  raycaster.set(origin, direction);
  raycaster.far = far;
  return raycaster.intersectObjects([...near], false)[0] ?? null;
}

const width = Math.round((AREA.maxX - AREA.minX) / STEP) + 1;
const height = Math.round((AREA.maxZ - AREA.minZ) / STEP) + 1;
const floor = new Float32Array(width * height).fill(NaN); // NaN: not reached
const DOWN = new THREE.Vector3(0, -1, 0);
const AXES = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const at = new THREE.Vector3();

const start = [Math.round((room.spawn.x - AREA.minX) / STEP), Math.round((room.spawn.z - AREA.minZ) / STEP)];
floor[start[1] * width + start[0]] = room.spawn.y;
const queue = [start];
const t0 = Date.now();
while (queue.length) {
  const [i, j] = queue.pop();
  const x = AREA.minX + i * STEP, z = AREA.minZ + j * STEP, y = floor[j * width + i];
  for (const axis of AXES) {
    const ni = i + axis.x, nj = j + axis.z;
    if (ni < 0 || nj < 0 || ni >= width || nj >= height || !Number.isNaN(floor[nj * width + ni])) continue;
    if (BODY_HEIGHTS.some((h) => blocked(at.set(x, y + h, z), axis, STEP + PLAYER_RADIUS))) continue;
    const nx = AREA.minX + ni * STEP, nz = AREA.minZ + nj * STEP;
    const ground = blocked(at.set(nx, y + STEP_HEIGHT, nz), DOWN, 3);
    if (!ground) continue; // off the floor's edge
    const ny = ground.point.y;
    if (AXES.some((side) => blocked(at.set(nx, ny + 1.0, nz), side, BODY_CLEARANCE))) continue; // too tight a gap
    floor[nj * width + ni] = ny;
    queue.push([ni, nj]);
  }
}

// Run-length rows: "start:length,start:length" per grid row, rows joined by "|".
const rows = [];
let cells = 0;
for (let j = 0; j < height; j++) {
  const runs = [];
  for (let i = 0; i < width; i++) {
    if (Number.isNaN(floor[j * width + i])) continue;
    let k = i;
    while (k + 1 < width && !Number.isNaN(floor[j * width + k + 1])) k++;
    runs.push(`${i}:${k - i + 1}`);
    cells += k - i + 1;
    i = k;
  }
  rows.push(runs.join(','));
}
const out = new URL('../src/rooms/lobbyReach.js', import.meta.url);
fs.writeFileSync(out, `// Generated by tools/buildLobbyReach.mjs — rerun it rather than editing.
// The Circus Lobby's walkable floor, reachable on foot from its spawn: a
// ${STEP} m grid from (${AREA.minX}, ${AREA.minZ}), ${width} x ${height} cells, each row run-length
// coded as "firstCell:count" runs. See reachMap.js for reading it.
export const LOBBY_REACH = {
  minX: ${AREA.minX}, minZ: ${AREA.minZ}, step: ${STEP}, width: ${width}, height: ${height},
  rows: '${rows.join('|')}',
};
`);
console.log(`${cells} reachable cells (${(cells * STEP * STEP).toFixed(0)} m²) in ${Date.now() - t0} ms → ${out.pathname}`);

// Regression check against the REAL Circus Lobby geometry, not a synthetic
// stand-in (see _verify_picture_scatter.mjs for that) — catches exactly the
// bug this was written for: scatterPictures()'s old single-origin sweep
// found a usable wall spot within a sensible mounting distance on only 2 of
// 16 rays from the Lobby's actual spawn (it's a large, mostly-open room),
// so across 30 trials it never once placed all 5 pictures, usually only 2.
// Run: node tools/verify_lobby_picture_scatter.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadTadcRoom } from '../src/rooms/tadcRoom.js';
import { loadDormHallRoom } from '../src/rooms/dormHallRoom.js';
import { loadKaufmoRoom } from '../src/rooms/kaufmoRoom.js';
import { createLevel2Items, PHOTO_COUNT } from '../src/state/level2Items.js';
import { nearestLandmark } from '../src/rooms/lobbyLandmarks.js';

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

const TRIALS = 8; // each trial reloads both real GLBs from scratch; the wider scatter grid (see officePicture.js) also costs more per trial than the old one did
const counts = [];
const landmarkRepeats = [];
const routeSamples = [];
const hall = await loadDormHallRoom(null, { from: 'tadc' });
const kaufmo = await loadKaufmoRoom(null, { from: 'dorm' });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const returnDistance = distance(hall.spawn, hall.portals.find(p => p.to === 'kaufmo').box.getCenter(new THREE.Vector3()))
  + Math.max(0, distance(kaufmo.spawn, kaufmo.kaufmoApi.kaufmo.position) - 2.8);
const mainSource = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const walkSpeed = Number(mainSource.match(/const WALK_SPEED = ([\d.]+)/)[1]);
const sprintMultiplier = Number(mainSource.match(/const SPRINT_MULTIPLIER = ([\d.]+)/)[1]);
const budget = Number(mainSource.match(/const SEARCH_TIMER_SECONDS = (\d+)/)[1]);
// All 120 pickup orders, followed by the Lobby exit, Dorm Hall and Kaufmo.
// These are distance estimates, not collision-aware navigation or human
// search times. They intentionally report the gap left for those costs.
function routeLengths(start, photos, exit) {
  if (!photos.length) return [distance(start, exit) + returnDistance];
  return photos.flatMap((photo, i) => routeLengths(photo, photos.filter((_, j) => j !== i), exit)
    .map(length => length + distance(start, photo)));
}
for (let i = 0; i < TRIALS; i++) {
  const items = createLevel2Items();
  const room = await loadTadcRoom(null, { items });
  counts.push(room.group.children.filter((c) => c.name === 'OfficePicture').length);
  const photos = room.group.children.filter(c => c.name === 'OfficePicture');
  // Same reach tadcRoom.js uses: three photos on one wall of toy blocks
  // once passed the 8m spacing check alone.
  const landmarks = photos.map(p => nearestLandmark(p.position.x, p.position.z, 6)?.label).filter(Boolean);
  if (new Set(landmarks).size < landmarks.length) landmarkRepeats.push(`trial ${i + 1}: ${landmarks.join(', ')}`);
  const lengths = routeLengths(room.spawn, photos.map(p => p.position), room.portals[0].box.getCenter(new THREE.Vector3()));
  const best = Math.min(...lengths) / walkSpeed;
  const worst = Math.max(...lengths) / walkSpeed;
  routeSamples.push({ trial: i + 1, photos: photos.map(p => p.position.toArray()),
    bestOrderWalkSeconds: best, worstOrderWalkSeconds: worst,
    bestOrderSprintSeconds: best / sprintMultiplier,
    worstOrderSprintSeconds: worst / sprintMultiplier,
    remainingAt180BestWalk: 180 - best, remainingAt180WorstWalk: 180 - worst,
    remainingAtBudgetWorstWalk: budget - worst,
  });

  if (i === 0) {
    const before = photos.map(p => ({ position: p.position.toArray(), rotation: p.rotation.toArray() }));
    room.interactables.find(entry => entry.prompt() === 'Pick up photo').interact();
    items.presentHeld();
    const revisit = await loadTadcRoom(null, { items, from: 'dorm' });
    assert.deepEqual(revisit.group.children.filter(c => c.name === 'OfficePicture')
      .map(p => ({ position: p.position.toArray(), rotation: p.rotation.toArray() })), before.slice(1));
    console.log('PASS Real Lobby revisit retains the remaining photo positions after partial delivery');
  }
}

assert.ok(counts.every((n) => n === PHOTO_COUNT),
  `expected all ${TRIALS} trials to place all ${PHOTO_COUNT} pictures, got counts: ${counts.join(',')}`);
console.log(`PASS All ${PHOTO_COUNT} pictures placed in every one of ${TRIALS} trials against the real Lobby model`);
assert.deepEqual(landmarkRepeats, [], 'no landmark should hold two photos');
console.log(`PASS No landmark held two photos in any of ${TRIALS} trials`);
const timingReport = {
  method: 'Straight-line distances through every pickup order, plus real Lobby exit, Dorm Hall and Kaufmo approach; no obstacle detours, spotting time or interaction delays. Not human playtest results.',
  budgetSeconds: budget, walkSpeed, sprintMultiplier, returnDistance, trials: routeSamples,
};
fs.mkdirSync(new URL('../artifacts/photo-search-timing/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../artifacts/photo-search-timing/routes.json', import.meta.url), JSON.stringify(timingReport, null, 2));
console.log(`TIMING Known-location walking routes across ${TRIALS} layouts: ${Math.min(...routeSamples.map(s => s.bestOrderWalkSeconds)).toFixed(1)}–${Math.max(...routeSamples.map(s => s.worstOrderWalkSeconds)).toFixed(1)} seconds before search/obstacle/interaction costs (budget ${budget}s).`);

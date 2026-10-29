// Exercises scatterPictures()'s floor-sweep + randomization without starting
// WebGL or loading a real room .glb. Run: node --test test/_verify_picture_scatter.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { scatterPictures } from '../src/props/officePicture.js';
import { createLevel2Items } from '../src/state/level2Items.js';
import { createSeededRandom } from '../src/maze/seededRandom.js';
import { nearestLandmark } from '../src/rooms/lobbyLandmarks.js';
import { decodeReachMap } from '../src/rooms/reachMap.js';
import { LOBBY_REACH } from '../src/rooms/lobbyReach.js';

const PICTURES = [
  { id: 'ca1', url: './models/objects/ca1.png' },
  { id: 'ca2', url: './models/objects/ca2.png' },
  { id: 'ca3', url: './models/objects/ca3.png' },
];
const SPAWN = { x: 0, y: 0, z: 0 };
// Production's defaults (gridStep 10, gridRadius 4, spacing 16) are tuned
// for the real Circus Lobby, which is enormous — scaled down to match this
// test's small 10x10 room instead of the production room it isn't.
const SMALL_ROOM_OPTIONS = { spacing: 2, gridStep: 3, gridRadius: 1 };

/**
 * A plain 10x10 square room (four thin walls, floor split into four 5x5
 * quadrant tiles rather than one slab, so zoneOf's default — the mesh a
 * spot lands on — has something to dedupe against, the way four separate
 * walls used to). Fresh each call so one trial's placed pictures can't
 * shadow the next trial's raycasts.
 */
function buildRoom() {
  const group = new THREE.Group();
  const size = 10, half = size / 2, thickness = 0.2, height = 3;
  const spans = [
    { w: size, d: thickness, x: 0, z: -half },
    { w: size, d: thickness, x: 0, z: half },
    { w: thickness, d: size, x: -half, z: 0 },
    { w: thickness, d: size, x: half, z: 0 },
  ];
  for (const { w, d, x, z } of spans) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, height, d));
    wall.position.set(x, height / 2, z);
    group.add(wall);
  }
  const offset = half / 2;
  for (const qx of [-1, 1]) for (const qz of [-1, 1]) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(half, thickness, half));
    floor.position.set(qx * offset, -thickness / 2, qz * offset);
    floor.name = `Floor${qx > 0 ? 'E' : 'W'}${qz > 0 ? 'S' : 'N'}`;
    group.add(floor);
  }
  group.updateMatrixWorld(true);
  return { group, interactables: [] };
}

function placedPictures(room) {
  return room.group.children.filter(child => child.name === 'OfficePicture');
}

/** A placed picture's local face normal in world space — ~(0,1,0) lying
 * flat and face-up on the floor, allowing for the small random tilt. */
function faceNormal(picture) {
  return new THREE.Vector3(0, 0, 1).applyQuaternion(picture.quaternion);
}

test('places all three pictures on the floor, each its own spot, none in the keep-clear zone', () => {
  const room = buildRoom();
  const items = createLevel2Items();
  const keepClear = [{ x: 0, z: -4.5 }]; // right against the north wall's midpoint
  scatterPictures(room, items, PICTURES, SPAWN, keepClear, SMALL_ROOM_OPTIONS);

  const pictures = placedPictures(room);
  assert.equal(pictures.length, 3, 'all three should find a free floor spot in an empty square room');
  assert.equal(room.interactables.length, 3);

  for (const picture of pictures) {
    assert.ok(picture.position.y >= 0 && picture.position.y < 0.1, 'rests on the floor, not at head height');
    assert.ok(faceNormal(picture).y > 0.9, 'lies flat, face up — not standing against a wall');
    assert.ok(Math.hypot(picture.position.x - 0, picture.position.z - -4.5) >= 1.5, 'stays clear of the kept-clear spot');
  }
  for (let i = 0; i < pictures.length; i++) {
    for (let j = i + 1; j < pictures.length; j++) {
      assert.ok(pictures[i].position.distanceTo(pictures[j].position) >= 2, 'each picture is its own find, not stacked on another');
    }
  }
});

test('a replay scatters them differently, not back to the same three spots', () => {
  const firstSpotKeys = new Set();
  for (let trial = 0; trial < 30; trial++) {
    const room = buildRoom();
    const items = createLevel2Items();
    scatterPictures(room, items, PICTURES, SPAWN, [], SMALL_ROOM_OPTIONS);
    const [first] = placedPictures(room);
    firstSpotKeys.add(`${first.position.x.toFixed(2)},${first.position.z.toFixed(2)}`);
  }
  // A fixed sweep (no randomization) would land ca1 on the exact same floor
  // spot all 30 times; a real retry has to actually look somewhere new.
  assert.ok(firstSpotKeys.size > 1, `expected varied placement across replays, got ${firstSpotKeys.size} distinct spot(s)`);
});

test('an already-collected picture is not placed again', () => {
  const room = buildRoom();
  const items = createLevel2Items();
  items.collect('ca1');
  scatterPictures(room, items, PICTURES, SPAWN, [], SMALL_ROOM_OPTIONS);
  assert.equal(placedPictures(room).length, 2, 'only the two not-yet-collected pictures get dropped');
});

test('partial pickups and deliveries preserve every remaining slot across room reloads', () => {
  const items = createLevel2Items();
  const first = buildRoom();
  scatterPictures(first, items, PICTURES, SPAWN, [], { ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(17) });
  const snapshot = picture => ({ position: picture.position.toArray(), rotation: picture.rotation.toArray() });
  const original = placedPictures(first).map(snapshot);
  const pickup = first.interactables[0];
  pickup.interact();
  pickup.interact(); // repeated input cannot collect or score twice
  assert.equal(items.totalFound(), 1);
  assert.equal(first.interactables.length, 2);
  items.presentHeld();

  for (let revisit = 0; revisit < 3; revisit++) {
    const room = buildRoom();
    scatterPictures(room, items, PICTURES, SPAWN, [], {
      ...SMALL_ROOM_OPTIONS,
      rng: () => assert.fail('A revisit must not roll a new layout'),
    });
    assert.deepEqual(placedPictures(room).map(snapshot), original.slice(1));
    assert.equal(items.totalPresented(), 1);
  }

  items.reset();
  const retry = buildRoom();
  scatterPictures(retry, items, PICTURES, SPAWN, [], { ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(99) });
  assert.equal(placedPictures(retry).length, 3);
  assert.notDeepEqual(placedPictures(retry).map(snapshot), original);
});

/** Which of buildRoom()'s four floor quadrants a picture landed on. */
function quadrantOf(picture) {
  return `${picture.position.x >= 0 ? 'E' : 'W'}${picture.position.z >= 0 ? 'S' : 'N'}`;
}

test('no two pictures share a floor quadrant while there are quadrants to spare', () => {
  // Spacing alone (2m here) lets a 5x5 quadrant take two or three pictures:
  // the Lobby's version of this was three photos on one patch of floor.
  for (let trial = 0; trial < 30; trial++) {
    const room = buildRoom();
    scatterPictures(room, createLevel2Items(), PICTURES, SPAWN, [], { ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(trial + 1) });
    const quadrants = placedPictures(room).map(quadrantOf);
    assert.equal(new Set(quadrants).size, 3, `trial ${trial + 1} doubled up a quadrant: ${quadrants.join(', ')}`);
  }
});

test('zones group meshes, and too few zones still places every picture', () => {
  const room = buildRoom();
  // North and south halves as one zone, east and west as another.
  const axis = spot => (Math.abs(spot.position.z) > Math.abs(spot.position.x) ? 'north-south' : 'east-west');
  scatterPictures(room, createLevel2Items(), PICTURES, SPAWN, [], { ...SMALL_ROOM_OPTIONS, zoneOf: axis });
  const pictures = placedPictures(room);
  assert.equal(pictures.length, 3, 'two zones for three pictures: the third doubles up rather than going missing');
  assert.equal(new Set(pictures.slice(0, 2).map(picture => axis(picture))).size, 2, 'the first two take one zone each');
});

test('Lobby landmarks: nearest by footprint, earlier wins an overlap, none past reach', () => {
  assert.equal(nearestLandmark(31, -30)?.label, 'Gumball Tower');
  assert.equal(nearestLandmark(56, 28)?.label, 'Spiral Staircase', 'inside both the staircase and the Block Row');
  assert.equal(nearestLandmark(35, 27)?.label, 'Block Row');
  assert.equal(nearestLandmark(80, 100, 6), null, 'open floor far from every landmark');
});

test('a spot the room calls unreachable never gets a picture', () => {
  // Stands in for a gap sealed inside the Lobby's toy blocks: the north
  // half of the floor is in range of the sweep but can't be got to.
  for (let trial = 0; trial < 10; trial++) {
    const room = buildRoom();
    scatterPictures(room, createLevel2Items(), PICTURES, SPAWN, [], {
      ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(trial + 1), isReachable: spot => spot.position.z > -4,
    });
    const pictures = placedPictures(room);
    assert.equal(pictures.length, 3);
    assert.ok(pictures.every(p => p.position.z > -4), `trial ${trial + 1} used the unreachable north half`);
  }
});

test('reach map: decodes runs, and the Lobby map has its spawn but not the sealed block pocket', () => {
  const map = decodeReachMap({ minX: 0, minZ: 0, step: 1, width: 4, height: 2, rows: '1:2|0:1,3:1' });
  assert.deepEqual([[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [3, 1]].map(([x, z]) => map.has(x, z)),
    [false, true, true, false, true, false, true]);
  assert.equal(map.has(-5, 0), false, 'outside the grid');
  const lobby = decodeReachMap(LOBBY_REACH);
  assert.equal(lobby.has(45.4, 15.9), true, 'the Lobby spawn');
  assert.equal(lobby.has(75.4, -24.1), false, 'inside the Toy Block Wall, where a photo once hung out of reach');
  assert.equal(lobby.has(5.4, 25.9), false, "inside the Black Pole's base");
});

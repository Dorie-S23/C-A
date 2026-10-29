// Exercises scatterPictures()'s wall-sweep + randomization without starting
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
// Production's defaults (gridStep 10, gridRadius 4, spacing 8) are tuned
// for the real Circus Lobby, which is enormous — scaled down to match this
// test's small 10x10 room instead of the production room it isn't.
const SMALL_ROOM_OPTIONS = { spacing: 2, gridStep: 3, gridRadius: 1, maxDistance: 8 };

/** A plain 10x10 square room (four thin walls), fresh each call so one
 * trial's placed pictures can't shadow the next trial's raycasts. */
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
  group.updateMatrixWorld(true);
  return { group, interactables: [] };
}

function placedPictures(room) {
  return room.group.children.filter(child => child.name === 'OfficePicture');
}

test('places all three pictures, each its own wall spot, none in the keep-clear zone', () => {
  const room = buildRoom();
  const items = createLevel2Items();
  const keepClear = [{ x: 0, z: -4.5 }]; // right against the north wall's midpoint
  scatterPictures(room, items, PICTURES, SPAWN, keepClear, SMALL_ROOM_OPTIONS);

  const pictures = placedPictures(room);
  assert.equal(pictures.length, 3, 'all three should find a free wall spot in an empty square room');
  assert.equal(room.interactables.length, 3);

  for (const picture of pictures) {
    assert.ok(picture.position.distanceTo(new THREE.Vector3(0, 1.5, -4.5)) >= 1.5, 'stays clear of the kept-clear spot');
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
  // A fixed sweep (no randomization) would land ca1 on the exact same wall
  // spot all 30 times; a real retry has to actually look somewhere new.
  assert.ok(firstSpotKeys.size > 1, `expected varied placement across replays, got ${firstSpotKeys.size} distinct spot(s)`);
});

test('an already-collected picture is not placed again', () => {
  const room = buildRoom();
  const items = createLevel2Items();
  items.collect('ca1');
  scatterPictures(room, items, PICTURES, SPAWN, [], SMALL_ROOM_OPTIONS);
  assert.equal(placedPictures(room).length, 2, 'only the two not-yet-collected pictures get hung');
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

/** Which of buildRoom()'s four walls a picture hangs on. */
function wallOf(picture) {
  const { x, z } = picture.position;
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? 'east' : 'west') : (z > 0 ? 'south' : 'north');
}

test('no two pictures share a wall while there are walls to spare', () => {
  // Spacing alone (2m here) lets a 10m wall take two or three pictures:
  // the Lobby's version of this was three photos on one stack of toy blocks.
  for (let trial = 0; trial < 30; trial++) {
    const room = buildRoom();
    scatterPictures(room, createLevel2Items(), PICTURES, SPAWN, [], { ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(trial + 1) });
    const walls = placedPictures(room).map(wallOf);
    assert.equal(new Set(walls).size, 3, `trial ${trial + 1} doubled up a wall: ${walls.join(', ')}`);
  }
});

test('zones group meshes, and too few zones still places every picture', () => {
  const room = buildRoom();
  // North and south walls as one zone, east and west as another.
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
  // Stands in for a gap sealed inside the Lobby's toy blocks: the north wall
  // is in range of the sweep but can't be got to.
  for (let trial = 0; trial < 10; trial++) {
    const room = buildRoom();
    scatterPictures(room, createLevel2Items(), PICTURES, SPAWN, [], {
      ...SMALL_ROOM_OPTIONS, rng: createSeededRandom(trial + 1), isReachable: spot => spot.position.z > -4,
    });
    const walls = placedPictures(room).map(wallOf);
    assert.equal(walls.length, 3);
    assert.ok(!walls.includes('north'), `trial ${trial + 1} used the unreachable wall`);
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

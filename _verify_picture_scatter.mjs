// Exercises scatterPictures()'s wall-sweep + randomization without starting
// WebGL or loading a real room .glb. Run: node --test _verify_picture_scatter.mjs
import './tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { scatterPictures } from './src/props/officePicture.js';
import { createLevel2Items } from './src/state/level2Items.js';

const PICTURES = [
  { id: 'ca1', url: './models/objects/ca1.png' },
  { id: 'ca2', url: './models/objects/ca2.png' },
  { id: 'ca3', url: './models/objects/ca3.png' },
];
const SPAWN = { x: 0, y: 0, z: 0 };

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
  scatterPictures(room, items, PICTURES, SPAWN, keepClear);

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
    scatterPictures(room, items, PICTURES, SPAWN, []);
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
  scatterPictures(room, items, PICTURES, SPAWN, []);
  assert.equal(placedPictures(room).length, 2, 'only the two not-yet-collected pictures get hung');
});

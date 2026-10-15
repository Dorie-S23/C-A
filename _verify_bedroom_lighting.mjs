// Real room geometry, without browser-only image decoding. Rendered appearance
// and texture/reflection quality still need a browser check.
import './tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadRoomModel } from './src/rooms/loadRoomModel.js';
import { createBedroomLighting } from './src/rooms/bedroomLighting.js';
import { loadPomniRoom } from './src/rooms/pomniRoom.js';
import { loadDormHallRoom } from './src/rooms/dormHallRoom.js';
import { loadTadcRoom } from './src/rooms/tadcRoom.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  try {
    const file = new URL(url.replace(/^\.\//, ''), new URL('./public/', import.meta.url));
    const bytes = fs.readFileSync(file);
    let data;
    if (bytes.readUInt32LE(0) === 0x46546c67) {
      const length = bytes.readUInt32LE(12);
      data = JSON.parse(bytes.subarray(20, 20 + length));
      data.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(length + 28).toString('base64')}`;
    } else data = JSON.parse(bytes);
    delete data.images;
    delete data.textures;
    data.materials = data.materials?.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};

const check = (name, run) => { run(); console.log(`PASS ${name}`); };
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
const room = await loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb');
const meshes = [];
room.group.traverse((mesh) => {
  if (mesh.isMesh) meshes.push({ mesh, matrix: mesh.matrix.toArray(), geometry: mesh.geometry,
    material: mesh.material, materialJSON: JSON.stringify(mesh.material.toJSON()) });
});
const lights = room.group.getObjectByName('RoomLighting').children.slice();
const fill = lights.find((light) => light.isHemisphereLight);
const point = lights.find((light) => light.isPointLight);
const fillColor = fill.color.clone();
const scene = new THREE.Scene();
scene.environmentIntensity = 0.6;
const lighting = createBedroomLighting(room);
lighting.attach(scene);
const gameplayIntensity = point.intensity;

check('Normal room starts in GAMEPLAY with original fill/reflection brightness', () => {
  assert.equal(lighting.state, 'GAMEPLAY');
  assert.equal(lighting.transitioning, false);
  near(fill.intensity, 0.6);
  near(scene.environmentIntensity, 0.6);
  assert.ok(fill.color.equals(fillColor));
});
check('Existing point light is centred beneath the actual chandelier hardware', () => {
  near(point.position.x, -4.370176272712929e-8);
  near(point.position.y, 3.4611322100181967);
  near(point.position.z, 1.9887532110018924e-7);
  assert.deepEqual(room.group.getObjectByName('RoomLighting').children, lights);
  assert.ok(point.castShadow && gameplayIntensity > 0);
});
lighting.setState('SLEEPING', { duration: 0 });
check('SLEEPING extinguishes room illumination but retains readable fill', () => {
  near(point.intensity, 0);
  assert.ok(fill.intensity > 0 && fill.intensity < 0.6);
  assert.ok(scene.environmentIntensity > 0 && scene.environmentIntensity < 0.6);
});
const sleepingFill = fill.intensity;
lighting.setState('WAKING');
check('Changing state does not jump brightness', () => near(fill.intensity, sleepingFill));
lighting.update(1);
check('WAKING interpolates gently with zero-delta pause support', () => {
  assert.ok(fill.intensity > sleepingFill && fill.intensity < 0.3);
  const value = fill.intensity;
  lighting.update(0);
  near(fill.intensity, value);
});
const halfway = fill.intensity;
lighting.setState('GAMEPLAY');
check('Interrupted transitions start at their currently rendered values', () => near(fill.intensity, halfway));
lighting.update(2.4);
near(point.intensity, gameplayIntensity);
check('Different frame rates give identical transition results', () => {
  const values = [];
  for (const fps of [30, 120]) {
    lighting.setState('SLEEPING', { duration: 0 });
    lighting.setState('GAMEPLAY');
    let time = 0;
    while (time < 1.3) {
      const step = Math.min(1 / fps, 1.3 - time);
      lighting.update(step);
      time += step;
    }
    values.push([fill.intensity, point.intensity, scene.environmentIntensity]);
  }
  values[0].forEach((value, i) => near(value, values[1][i]));
});
lighting.reset();
check('Reset restores normal lighting; geometry and materials are untouched', () => {
  near(point.intensity, gameplayIntensity);
  near(fill.intensity, 0.6);
  near(scene.environmentIntensity, 0.6);
  for (const entry of meshes) {
    assert.deepEqual(entry.mesh.matrix.toArray(), entry.matrix);
    assert.equal(entry.mesh.geometry, entry.geometry);
    assert.equal(entry.mesh.material, entry.material);
    assert.equal(JSON.stringify(entry.mesh.material.toJSON()), entry.materialJSON);
  }
  assert.throws(() => lighting.setState('UNKNOWN'), RangeError);
  assert.throws(() => lighting.setState('SLEEPING', { duration: -1 }), RangeError);
});
let shadowDisposed = 0;
point.shadow.map = new THREE.WebGLRenderTarget(8, 8);
point.shadow.map.addEventListener('dispose', () => shadowDisposed++);
lighting.setState('SLEEPING', { duration: 0 });
lighting.dispose();
lighting.dispose();
check('Unload restores shared environment and disposes the shadow target once', () => {
  near(scene.environmentIntensity, 0.6);
  assert.equal(shadowDisposed, 1);
  const value = point.intensity;
  lighting.update(10);
  near(point.intensity, value);
});

const bedroom = await loadPomniRoom(undefined, { from: 'dorm', travel: (to) => assert.equal(to, 'dorm') });
check('Re-entry starts in GAMEPLAY with working exit and existing mirrors', () => {
  assert.equal(bedroom.lighting.state, 'GAMEPLAY');
  bedroom.interactables[0].interact();
  assert.ok(bedroom.group.getObjectByProperty('isReflector', true));
  assert.equal(bedroom.group.getObjectByName('Caine'), undefined);
});
const dorm = await loadDormHallRoom(undefined, { from: 'pomni' });
check('Dorm lighting, bedroom door, Caine placement and lobby portal are preserved', () => {
  assert.equal(dorm.lighting, undefined);
  assert.equal(dorm.interactables[0].prompt(), "Enter Pomni's Room");
  const caine = dorm.group.getObjectByName('Caine');
  near(caine.position.x, -2.131381070613861);
  near(caine.position.z, -38.45658950805664);
  assert.equal(typeof dorm.update, 'function');
  assert.equal(dorm.portals[0].to, 'tadc');
});
const lobby = await loadTadcRoom(undefined, { from: 'dorm' });
check('Lobby keeps its existing lighting and return portal', () => {
  assert.equal(lobby.lighting, undefined);
  assert.equal(lobby.portals[0].to, 'dorm');
});
bedroom.lighting.dispose();
console.log('ALL BEDROOM LIGHTING CHECKS PASSED');

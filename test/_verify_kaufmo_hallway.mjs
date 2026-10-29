import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadDormHallRoom } from '../src/rooms/dormHallRoom.js';
import { kaufmoHallwayPlan, playKaufmoHallwayCutscene } from '../src/cutscenes/kaufmoHallwayCutscene.js';

globalThis.ProgressEvent ??= class ProgressEvent { constructor(type, data = {}) { this.type = type; Object.assign(this, data); } };

// Parse the shipped geometry in Node; skip browser-only image decoding.
GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + length));
    json.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(28 + length).toString('base64');
    delete json.images; delete json.textures;
    json.materials = json.materials?.map(({ name, doubleSided }) => ({ name, doubleSided }));
    this.parseAsync(JSON.stringify(json), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};
const room = await loadDormHallRoom(undefined, { from: 'ribbit' });
const plan = kaufmoHallwayPlan(room);

test('real-door route passes Ribbit, heads toward Kaufmo and keeps Pomni clear', () => {
  const ribbit = new THREE.Box3().setFromObject(room.group.getObjectByName('Door_Frame089')).getCenter(new THREE.Vector3());
  const kaufmo = new THREE.Box3().setFromObject(room.group.getObjectByName('Door_Frame087')).getCenter(new THREE.Vector3());
  assert.ok(plan.points[0].z < ribbit.z);
  assert.equal(plan.points[1].z, kaufmo.z);
  assert.ok(plan.points[1].z > ribbit.z);
  assert.ok(plan.points[2].x < kaufmo.x);
  assert.ok(plan.points[0].x - plan.pomni.x > 1);
  assert.equal(plan.points[0].y, room.spawn.y);
  assert.ok(Math.abs(plan.pomni.z - ribbit.z) < 0.01);
});

test('fixed cinematic camera frames both real doors and the approaching runner', () => {
  const camera = new THREE.PerspectiveCamera(55, 4 / 3, 0.1, 150);
  camera.position.copy(plan.camera); camera.lookAt(plan.target); camera.updateMatrixWorld(true);
  for (const name of ['Door_Frame089', 'Door_Frame087']) {
    const centre = new THREE.Box3().setFromObject(room.group.getObjectByName(name)).getCenter(new THREE.Vector3());
    const projected = centre.project(camera);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && projected.z < 1, name);
  }
  const runner = plan.points[0].clone().add(new THREE.Vector3(0, 0.65, 0)).project(camera);
  assert.ok(Math.abs(runner.x) < 1 && Math.abs(runner.y) < 1 && runner.z < 1);
});

test('scripted running lane and opened doorway clear the shipped collision geometry', () => {
  room.hallDoors.kaufmo.control.open({ immediate: true });
  room.hallDoors.kaufmo.control.update(0);
  room.group.updateMatrixWorld(true);
  const meshes = room.collisionMeshes.map(({ mesh }) => mesh);
  const ignored = new Set();
  room.group.traverse(o => { if (o.name === 'DoorwayGlimpse') ignored.add(o); });
  for (let i = 0; i < plan.points.length - 1; i++) {
    const from = plan.points[i], to = plan.points[i + 1];
    const direction = to.clone().sub(from).normalize();
    const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x);
    for (const offset of [-0.35, 0, 0.35]) for (const height of [0.4, 1.05]) {
      const origin = from.clone().addScaledVector(perpendicular, offset); origin.y += height;
      const hits = new THREE.Raycaster(origin, direction, 0.01, from.distanceTo(to)).intersectObjects(meshes, false)
        .filter(hit => !ignored.has(hit.object));
      assert.deepEqual(hits.map(hit => ({ name: hit.object.name, point: hit.point.toArray() })), [], `leg ${i}, offset ${offset}, height ${height}`);
    }
  }
});

test('run uses the existing actor animation in the real scene, opens Kaufmo door and cleans up safely', () => {
  const scene = new THREE.Scene(); scene.add(room.group);
  const actor = new THREE.Group();
  const legs = [];
  let active;
  const api = {
    kaufmo: actor,
    playPassBy(from, to, duration) { active = { from, to, duration, time: 0 }; legs.push(active); actor.position.copy(from); },
    update(dt) { active.time += dt; actor.position.lerpVectors(active.from, active.to, Math.min(1, active.time / active.duration)); },
  };
  let rendered = 0;
  globalThis.window = { innerWidth: 800, innerHeight: 600 };
  const runner = playKaufmoHallwayCutscene({ render(s) { assert.equal(s, scene); rendered++; } }, { scene, room, kaufmoApi: api, plan });
  assert.equal(actor.parent, scene);
  const start = actor.position.clone();
  assert.equal(runner.update(0), false); // pause freezes the run
  assert.deepEqual(actor.position.toArray(), start.toArray());
  assert.equal(runner.update(0.5), false);
  assert.ok(actor.position.z > start.z);
  assert.equal(runner.update(30), true); // large frame still traverses every segment
  assert.equal(legs.length, 2);
  assert.deepEqual(actor.position.toArray(), plan.points.at(-1).toArray());
  assert.equal(room.hallDoors.kaufmo.control.isOpen, true);
  runner.cleanup(); runner.cleanup();
  assert.equal(actor.parent, null);
  assert.equal(room.group.parent, scene);
  assert.equal(runner.update(1), true);
  assert.equal(rendered, 3);
});

import './tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPomniRoom } from './src/rooms/pomniRoom.js';
import { createRagathaEntrance } from './src/cinematics/ragathaEntrance.js';
import { createEntranceAudioSession, ENTRANCE_CUES } from './src/cinematics/openingAudio.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('./public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch(error) { onError(error); }
};
const room = await loadPomniRoom(undefined, { travel: to => travels.push(to) });
const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 1.8, 0); camera.lookAt(1, 1, 3);
const slab = room.group.getObjectByName('Door_Slab024'), frame = room.group.getObjectByName('Door_Frame024');
const frameMatrix = frame.matrixWorld.clone(), closedMatrix = slab.matrixWorld.clone();
const relative = slab.children.map(o => [o, o.matrix.clone()]);
const travelObjects = [...room.interactables[0].objects], travels = [], cues = [];
let dialogueCount = 0, completionCount = 0, finish;
const create = options => createRagathaEntrance({ room, camera, resolveCamera: (_t, p) => p,
  onDialogue: callback => { dialogueCount++; finish = callback; }, onComplete: () => completionCount++, ...options });
const entrance = create({ audio: { start: () => cues.push('start'), pause: () => cues.push('pause'), resume: () => cues.push('resume'), dispose: () => cues.push('dispose') } });
const meshes = new Set(); slab.traverse(o => { if (o.isMesh) meshes.add(o); });
assert.ok(room.collisionMeshes.filter(e => meshes.has(e.mesh)).every(e => e.dynamic));
entrance.update(1.2);
assert.ok(Math.abs(slab.parent.rotation.y) > 0);
for (const [child, matrix] of relative) assert.deepEqual(child.matrix.elements, matrix.elements);
assert.deepEqual(frame.matrixWorld.elements, frameMatrix.elements);
for (const e of room.collisionMeshes.filter(e => meshes.has(e.mesh))) assert.ok(e.box.equals(new THREE.Box3().setFromObject(e.mesh)));
console.log('PASS Real door swings with all children attached, stationary frame and refreshed child colliders');
entrance.setPaused(true); const time = entrance.elapsed, angle = slab.parent.rotation.y;
entrance.update(12); entrance.skip(); assert.equal(entrance.elapsed, time); assert.equal(slab.parent.rotation.y, angle); assert.equal(dialogueCount, 0);
entrance.setPaused(false); entrance.update(2.8); assert.equal(dialogueCount, 1); assert.equal(entrance.phase, 'dialogue');
entrance.skip(); entrance.update(20); assert.equal(dialogueCount, 1);const openMatrix=slab.matrixWorld.clone();
finish(); finish(); const follow = { position: new THREE.Vector3(0, 1.8, 0), target: new THREE.Vector3(-1, 1, 0) };
entrance.update(1.25, follow); entrance.update(100, follow);
assert.equal(completionCount, 1); assert.equal(entrance.phase, 'done');
assert.ok(Math.abs(slab.parent.rotation.y+Math.PI/2)<1e-8);
slab.matrixWorld.elements.forEach((v, i) => assert.ok(Math.abs(v - openMatrix.elements[i]) < 1e-8));
assert.deepEqual(room.interactables[0].objects, travelObjects); room.interactables[0].interact(); assert.deepEqual(travels, ['dorm']);
assert.deepEqual(cues, ['start', 'pause', 'resume', 'dispose']);
console.log('PASS Pause/resume, one dialogue, repeated finish, smooth return and original E travel');
entrance.dispose(); entrance.dispose(); assert.equal(entrance.phase, 'disposed');
// Separate real room sessions exercise cancellation and frame-rate independence.
const make = async step => {
 const r = await loadPomniRoom(); let calls = 0;
 const c = createRagathaEntrance({ room: r, camera, onDialogue: () => calls++ });
 for(let t = 0; t < 240; t++) c.update(step);
 c.update(.01); return { c, r, calls };
};
const a = await make(1/60), b = await make(1/30);
a.c.update(.01); b.c.update(.01); assert.equal(a.c.phase, 'dialogue'); assert.equal(b.c.phase, 'dialogue');
assert.equal(a.calls, 1); assert.equal(b.calls, 1); a.c.dispose(); b.c.dispose();
const r = await loadPomniRoom(); let late = 0;
const cancelled = createRagathaEntrance({ room: r, camera, onDialogue: () => late++, onComplete: () => late++ });
cancelled.update(1); cancelled.dispose(); cancelled.skip(); cancelled.update(30); assert.equal(late, 0);
const r2 = await loadPomniRoom(); const silent = createRagathaEntrance({ room: r2, camera, onDialogue: () => late++ });
silent.skip(); silent.skip(); assert.equal(late, 1); silent.dispose();
assert.throws(() => createRagathaEntrance({ room: { group: new THREE.Group() }, camera }), /door/);
console.log('PASS Frame-rate independent timing, skip once, silent fallback, missing door and disposal without callbacks');
// Reuse the existing real Three.js Audio graph test double and its checks.
await import('./_verify_opening_audio.mjs');
const context = THREE.AudioContext.getContext(), listener = new THREE.AudioListener();
const base = context.sources.length; context.currentTime = 0;
const audio = createEntranceAudioSession(listener, room.group); audio.start(0);
assert.deepEqual(context.sources.slice(base).map(s => s.at), ENTRANCE_CUES.map(c => c.at));
context.currentTime = 2.1; audio.update(2.1); audio.pause();
const stopped = context.sources.length; context.currentTime = 20; audio.resume(2.1);
assert.equal(context.sources.length - stopped, 2); // creak and first footstep cannot replay
assert.ok(Math.abs(context.sources.at(-2).at - 20.33) < 1e-8);
audio.dispose(); audio.dispose(); assert.equal(room.group.getObjectByName('TemporaryEntranceAudio'), undefined);
const count = context.sources.length; audio.resume(0); assert.equal(context.sources.length, count);
console.log('PASS Temporary creak/footsteps pause without duplicates and dispose idempotently');

// Sample the actual room triangles during both camera blends and door swing.
THREE.Mesh.prototype.raycast = acceleratedRaycast;
const geometryRoom = await loadPomniRoom();
for(const { mesh } of geometryRoom.collisionMeshes) if(!mesh.isSkinnedMesh && !mesh.geometry.boundsTree) computeBoundsTree.call(mesh.geometry);
const ray = new THREE.Raycaster(), hits = geometryRoom.collisionMeshes.map(e => e.mesh);
let minimum = Infinity, minReach = Infinity;
const resolve = (target, desired) => {
 const direction = desired.clone().sub(target), length = direction.length(); direction.normalize();
 ray.set(target, direction); ray.far = length + .25;
 const hit = ray.intersectObjects(hits, false)[0];
 const allowed = Math.max(0, Math.min(length + .25, hit?.distance ?? Infinity) - .25);
 if(allowed<minReach && allowed<.7) console.log('CAMERA_LIMIT', {allowed, target:target.toArray(), desired:desired.toArray(), mesh:hit?.object.name, distance:hit?.distance});
 minReach = Math.min(minReach, allowed);
 return target.clone().addScaledVector(direction, allowed);
};
camera.position.set(-3.1,1.9,-.53); camera.lookAt(-1.05,1.406783,-.53);
let geometryFinish;
const geometryEntrance = createRagathaEntrance({ room: geometryRoom, camera, resolveCamera: resolve, onDialogue: f => geometryFinish=f });
function clearance(){
 for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){
  ray.set(camera.position,direction);ray.far=.3;
  const hit=ray.intersectObjects(hits,false)[0];if(hit)minimum=Math.min(minimum,hit.distance);
 }
}
for(let i=0;i<81;i++){geometryEntrance.update(.05);clearance()}
geometryFinish();
for(let i=0;i<26;i++){geometryEntrance.update(.05,follow);clearance()}
assert.ok(minReach>.7, 'Camera collapsed against a surface: '+minReach);
assert.ok(minimum>.15, 'Camera near plane touches room geometry: '+minimum);
geometryEntrance.dispose();
console.log('PASS Actual-room entrance camera clearance', {minimum, minReach});

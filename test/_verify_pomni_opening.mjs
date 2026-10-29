// Real assets and controller lifecycle; browser-only texture decoding is omitted.
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { OPENING_HANDOFF, sampleOpeningShot, OPENING_SLEEP_SECONDS, OPENING_WAKE_SECONDS, OPENING_PLAYBACK_SECONDS, openingClipTime } from '../src/cinematics/pomniOpening.js';
import { KNOCK_TIMES, makeOpeningBuffers } from '../src/cinematics/openingAudio.js';
import { POMNI_INVITATION } from '../src/cinematics/pomniInvitation.js';
globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, onProgress, onError) {
  try {
    const file = new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url));
    const bytes = fs.readFileSync(file), length = bytes.readUInt32LE(12);
    const data = JSON.parse(bytes.subarray(20,20+length));
    data.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(length+28).toString('base64')}`;
    delete data.images;delete data.textures;
    data.materials = data.materials.map(({name,doubleSided})=>({name,doubleSided}));
    new GLTFLoader().parseAsync(JSON.stringify(data),'').then(onLoad,onError);
  } catch(error) { onError(error); }
};
const check=(name,fn)=>{fn();console.log('PASS',name)};
const named=(room,name)=>{let found;room.group.traverse(o=>{if(o.userData.name===name)found=o});return found};
const make=()=>loadPomniRoom(undefined,{openingMode:'play'});
const camera=new THREE.PerspectiveCamera(70,16/9,.1,500);
const follow={target:new THREE.Vector3(-1.05,1.406783,-.53),position:new THREE.Vector3(-3.1,1.9,-.53)};
const preview=await loadPomniRoom();
check('Room preview stays in GAMEPLAY, original cover visible, no cinematic',()=>{
  assert.equal(preview.opening,undefined);assert.equal(named(preview,'Plane.003').visible,true);assert.equal(preview.lighting.state,'GAMEPLAY');
});
const room=await make(),opening=room.opening;
check('Real R5 loads; only original cover is hidden and excluded from collision',()=>{
  assert.ok(opening);assert.equal(named(room,'Plane.003').visible,false);
  assert.ok(!room.collisionMeshes.some(e=>e.mesh===named(room,'Plane.003')));
  for(const name of ['Plane.002','Plane.050']){assert.ok(named(room,name).visible);assert.ok(room.collisionMeshes.some(e=>e.mesh===named(room,name)))}
});
let handoffs=0,completed=0;
opening.start({camera,resolveCamera:(target,desired)=>desired,onHandoff:()=>handoffs++,onComplete:()=>completed++});
check('Sleeping starts at t=0, with a single skinned actor and one animated cover',()=>{
  assert.equal(room.lighting.state,'SLEEPING');assert.equal(opening.time,0);
  let actors=0,covers=0;room.group.traverse(o=>{if(o.name==='PomniPlacement_GameScale')actors++;if(o.name==='R4_Continuous_Blanket')covers++});assert.equal(actors,1);assert.equal(covers,1);
});
const cueCalls=[];
opening.setAudio({start:t=>cueCalls.push(['start',t]),update:t=>cueCalls.push(['update',t]),pause:()=>cueCalls.push(['pause']),resume:t=>cueCalls.push(['resume',t]),dispose:()=>cueCalls.push(['dispose'])});
opening.update(4.9);
check('First five seconds reuse sleeping samples with moving blanket and closed eyes',()=>{
 assert.equal(room.lighting.state,'SLEEPING');assert.ok(opening.time<1.4);assert.ok(opening.blanket.morphTargetInfluences.some(w=>w>0));
 const a=openingClipTime(.8),b=openingClipTime(2.4);assert.notEqual(a,b);assert.ok([a,b].every(t=>t>=0&&t<1.4));
});
opening.setPaused(true);opening.setPaused(false);
opening.update(.1);
check('All three knocks precede waking and snoring stops at five seconds',()=>{assert.equal(room.lighting.state,'SLEEPING');assert.ok(Math.abs(opening.time-1.4)<1e-10);assert.ok(KNOCK_TIMES.at(-1)+.16<=OPENING_WAKE_SECONDS+1e-10)});
opening.update(OPENING_WAKE_SECONDS-OPENING_SLEEP_SECONDS);
check('Waking begins at actual source frame 43 after the knocks',()=>{assert.equal(room.lighting.state,'WAKING');assert.ok(Math.abs(opening.time-1.4)<1e-10);assert.ok(cueCalls.some(c=>c[0]==='pause'));assert.ok(cueCalls.some(c=>c[0]==='resume'))});
check('Waking remains at 1x; standing marker shifts by only the added sleep time',()=>{
 assert.ok(Math.abs(openingClipTime(6.1)-openingClipTime(5.6)-.5)<1e-10);assert.ok(Math.abs(OPENING_PLAYBACK_SECONDS-11.7)<1e-10);
});
opening.update(190/30-1.4);
check('GAMEPLAY threshold follows standing at source frame 191',()=>assert.equal(room.lighting.state,'GAMEPLAY'));
opening.update(OPENING_PLAYBACK_SECONDS-opening.elapsed);
const finalWeights=Array.from(opening.blanket.morphTargetInfluences);
check('Natural finish freezes blanket, releases actor and hands off exactly once',()=>{
  assert.equal(opening.phase,'blending');assert.equal(handoffs,1);assert.equal(room.group.getObjectByName('PomniPlacement_GameScale'),undefined);assert.ok(finalWeights.some(w=>w>0));
  assert.equal(cueCalls.at(-1)[0],'dispose');
});
opening.update(1.25,follow);
check('Camera blends to gameplay and completes once',()=>{
  assert.equal(opening.phase,'done');assert.equal(completed,1);assert.ok(camera.position.distanceTo(follow.position)<1e-10);
  opening.update(50,follow);assert.equal(completed,1);assert.deepEqual(opening.blanket.morphTargetInfluences,finalWeights);
});
for(const skipTime of [0,2.3,6.8]){
 const r=await make(),o=r.opening;let swaps=0;
 o.start({camera,resolveCamera:(target,desired)=>desired,onHandoff:()=>swaps++});o.update(skipTime);const before=camera.position.clone();o.skip();
 check(`Skip at ${skipTime}s yields the identical final blanket, lighting and single handoff`,()=>{
  assert.equal(o.time,7.5);assert.equal(swaps,1);assert.deepEqual(o.blanket.morphTargetInfluences,finalWeights);assert.equal(r.lighting.state,'GAMEPLAY');
  o.update(0,follow);assert.ok(camera.position.distanceTo(before)<1e-9,'Skip camera jumps at start of blend');
  o.skip();assert.equal(swaps,1);
 });o.dispose();r.lighting.dispose();
}
const reentry=await loadPomniRoom(undefined,{from:'dorm',openingMode:'settled'});
check('Dorm re-entry keeps final cover, door arrival, no actor or replay',()=>{
 assert.equal(reentry.opening.phase,'done');assert.deepEqual(reentry.opening.blanket.morphTargetInfluences,finalWeights);
 assert.equal(reentry.group.getObjectByName('PomniPlacement_GameScale'),undefined);assert.equal(reentry.lighting.state,'GAMEPLAY');assert.equal(reentry.interactables[0].prompt(),'Exit to Hallway');
 assert.notDeepEqual(reentry.spawn.toArray(),[OPENING_HANDOFF.x,OPENING_HANDOFF.y,OPENING_HANDOFF.z]);
});
const originalLoad=GLTFLoader.prototype.load,originalWarn=console.warn;
GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){
 if(url.includes('/cinematics/'))onError(new Error('Intentional missing R5 asset test'));
 else originalLoad.call(this,url,onLoad,onProgress,onError);
};
console.warn=()=>{};
const fallback=await make();GLTFLoader.prototype.load=originalLoad;console.warn=originalWarn;
check('Missing cinematic falls back to an explorable, normally lit bedroom',()=>{
 assert.equal(fallback.openingError,true);assert.equal(fallback.opening,undefined);assert.equal(named(fallback,'Plane.003').visible,true);assert.equal(fallback.lighting.state,'GAMEPLAY');assert.equal(fallback.interactables[0].prompt(),'Exit to Hallway');
});fallback.lighting.dispose();
const cancel=await make(),cancelOpening=cancel.opening;let swapAfterCancel=0;
cancelOpening.start({camera,resolveCamera:(target,desired)=>desired,onHandoff:()=>swapAfterCancel++});cancelOpening.update(.5);
let geometryDisposals=0;const geometries=new Set();cancel.group.getObjectByName('PomniOpeningR5').traverse(o=>{if(o.isMesh)geometries.add(o.geometry)});geometries.forEach(g=>g.addEventListener('dispose',()=>geometryDisposals++));
cancelOpening.dispose();cancelOpening.dispose();cancelOpening.update(20);
check('Cancellation disposes owned geometry once and cannot finish later',()=>{assert.equal(swapAfterCancel,0);assert.equal(cancelOpening.phase,'disposed');assert.equal(geometryDisposals,geometries.size);assert.equal(cancel.group.getObjectByName('PomniOpeningR5'),undefined)});

const frameRates=[];
for(const fps of [30,120]){
 const r=await make(),o=r.opening;o.start({camera,resolveCamera:(target,desired)=>desired});
 let elapsed=0;while(elapsed<5){const dt=Math.min(1/fps,5-elapsed);o.update(dt);elapsed+=dt}
 frameRates.push({camera:camera.position.clone(),sky:r.group.getObjectByName('RoomLighting').children[0].intensity});o.dispose();r.lighting.dispose();
}
check('30/120fps have equivalent shot and lighting progression',()=>{assert.ok(frameRates[0].camera.distanceTo(frameRates[1].camera)<1e-9);assert.ok(Math.abs(frameRates[0].sky-frameRates[1].sky)<1e-9)});

// Actual room triangles, accelerated exactly as in the game. Check cinematic
// rays and camera-surface clearance along the entire shot path.
THREE.Mesh.prototype.raycast=acceleratedRaycast;
for(const {mesh} of room.collisionMeshes)if(!mesh.isSkinnedMesh)computeBoundsTree.call(mesh.geometry);
const ray=new THREE.Raycaster();let minDistance=Infinity,minClearance=Infinity;
for(let time=0;time<=7.5;time+=.05){
 const {target,position}=sampleOpeningShot(time),direction=position.clone().sub(target),distance=direction.length();direction.normalize();ray.set(target,direction);ray.far=distance+.25;
 const candidates=room.collisionMeshes.filter(e=>ray.ray.intersectsBox(e.box)).map(e=>e.mesh),hit=ray.intersectObjects(candidates,false)[0];
 const allowed=Math.max(0,Math.min(distance+.25,hit?.distance??Infinity)-.25);minDistance=Math.min(minDistance,allowed);
 const resolved=target.clone().addScaledVector(direction,allowed);
 for(const axis of [new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)]){
  ray.set(resolved,axis);ray.far=.3;const near=ray.intersectObjects(room.collisionMeshes.map(e=>e.mesh),false)[0];if(near)minClearance=Math.min(minClearance,near.distance);
 }
}
check('Cinematic camera rays stay clear of furniture, canopy and room surfaces',()=>{assert.ok(minDistance>.7,`Too close to target: ${minDistance}`);assert.ok(minClearance>.16,`Near-plane surface clearance ${minClearance}`)});
console.log('CAMERA_METRICS',JSON.stringify({minimum_target_distance:minDistance,minimum_axis_surface_clearance:minClearance}));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
check('Temporary audio buffers are finite, quiet, and have exactly three knock times',()=>{
 const context={createBuffer(channels,count,rate){const data=new Float32Array(count);return {getChannelData:()=>data,duration:count/rate}}};
 const buffers=makeOpeningBuffers(context);for(const b of Object.values(buffers)){const a=b.getChannelData(0);assert.ok(a.every(Number.isFinite));assert.ok(a.some(v=>Math.abs(v)>.01));assert.ok(a.every(v=>Math.abs(v)<1))}
 assert.deepEqual(KNOCK_TIMES,[5,5.22,5.44]);assert.equal(POMNI_INVITATION[0].text,'Come in.');assert.equal(POMNI_INVITATION[0].speaker,'pomni');
});
check('Runtime GLB is the verified export; original game assets are unchanged',()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../tools/fixtures/pomni-opening-assets.json',import.meta.url)));
 assert.equal(hash(fs.readFileSync('public/models/cinematics/pomni-sleep-wake-r5.glb')),manifest.asset_sha256);
 for(const [name,digest] of Object.entries(manifest.protected_source_hashes))assert.equal(hash(fs.readFileSync(name)),digest,name);
});
for(const r of [room,reentry,cancel,preview]){r.opening?.dispose();r.lighting.dispose()}
console.log('ALL POMNI OPENING CHECKS PASSED');

import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { createRagathaEntrance } from '../src/cinematics/ragathaEntrance.js';
import { createEntranceAudioSession, ENTRANCE_CUES } from '../src/cinematics/openingAudio.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch(error) { onError(error); }
};


const {loadRagatha}=await import('../src/characters/ragatha.js');
const {OPENING_HANDOFF}=await import('../src/cinematics/pomniOpening.js');
const room=await loadPomniRoom();room.spawn.set(OPENING_HANDOFF.x,OPENING_HANDOFF.y,OPENING_HANDOFF.z);
Math.random=()=>.25;const cast=await loadRagatha();room.group.add(cast.ragatha);
const camera=new THREE.PerspectiveCamera(70,4/3,.1,500);camera.position.set(-3.1,1.9,-.53);camera.lookAt(-1.05,1.4,-.53);
const cameraRay=new THREE.Raycaster();
const resolveCamera=(target,desired)=>{
 const direction=desired.clone().sub(target),distance=direction.length();direction.normalize();
 cameraRay.set(target,direction);cameraRay.far=distance+.25;
 const hit=cameraRay.intersectObjects(room.collisionMeshes.map(e=>e.mesh),false)[0];
 return target.clone().addScaledVector(direction,Math.max(0,Math.min(distance+.25,hit?.distance??Infinity)-.25));
};
let dialogue=0,complete=0;const c=createRagathaEntrance({room,camera,cast,resolveCamera,onDialogue:()=>dialogue++,onComplete:()=>complete++});
const fixed=room.collisionMeshes.map(e=>e.mesh);const actors=[];cast.ragatha.traverse(o=>{if(o.isMesh&&o!==cast.collider)actors.push(o)});
for(const m of [...fixed,...actors])if(!m.geometry.boundsTree)computeBoundsTree.call(m.geometry);
const contacts=[],samples=[];
function validate(){room.group.updateMatrixWorld(true);if(!cast.ragatha.visible)return;const hits=[];const fixed=room.collisionMeshes.map(e=>e.mesh);room.group.getObjectByName('RagathaDoorVestibule').traverse(o=>{if(o.isMesh)fixed.push(o)});for(const m of fixed)if(!m.geometry.boundsTree)computeBoundsTree.call(m.geometry);
 for(const m of actors){const a=new THREE.Box3().setFromObject(m);for(const f of fixed){if(!a.intersectsBox(new THREE.Box3().setFromObject(f)))continue;let count=0;let contact;
  f.geometry.boundsTree.bvhcast(m.geometry.boundsTree,f.matrixWorld.clone().invert().multiply(m.matrixWorld),{intersectsTriangles(a,b){
   // Guard the SAT test against disjoint/degenerate triangles produced at a cut edge.
   if(!new THREE.Box3().setFromPoints([a.a,a.b,a.c]).intersectsBox(new THREE.Box3().setFromPoints([b.a,b.b,b.c])))return false;
   const line=new THREE.Line3();if(a.intersectsTriangle(b,line,true)){count++;contact={point:line.start.clone().applyMatrix4(f.matrixWorld).toArray(),triangle:[a.a,a.b,a.c].map(v=>v.clone().applyMatrix4(f.matrixWorld).toArray())};return true}return false}});
  if(count)hits.push([m.name,f.name,contact]);
 }}
 if(hits.length)contacts.push({phase:c.phase,stage:c.diagnostics.stage,position:cast.ragatha.position.toArray(),hits});
 samples.push({phase:c.phase,...c.diagnostics});
}
for(let i=0;i<450&&c.phase==='entering';i++){c.update(1/30);validate()}
assert.equal(c.phase,'dialogue');assert.equal(dialogue,1);
assert.ok(Math.abs(room.group.getObjectByName('Door_Frame024Hinge').rotation.y+Math.PI/2)<1e-8,'Door must stay fully open for the Jax background beat');
assert.ok(Math.abs(cast.ragatha.scale.x-.9)<1e-10);
camera.updateMatrixWorld(true);
for(const [name,point] of [['Pomni',room.spawn.clone().add(new THREE.Vector3(0,1.4,0))],['Ragatha',cast.ragatha.position.clone().add(new THREE.Vector3(0,1.5,0))],['Door',new THREE.Vector3(1.4,1.5,3.32)]]){const ndc=point.project(camera);console.log('SHOT',name,ndc.toArray());assert.ok(Math.abs(ndc.x)<.9&&ndc.y>-.2&&ndc.y<.9,name+' must be visible above dialogue');}
for(const point of [room.spawn.clone().add(new THREE.Vector3(0,1.4,0)),cast.ragatha.position.clone().add(new THREE.Vector3(0,1.5,0))]){
 const direction=point.clone().sub(camera.position);cameraRay.set(camera.position,direction.clone().normalize());cameraRay.far=direction.length()-.05;
 assert.equal(cameraRay.intersectObjects(room.collisionMeshes.map(e=>e.mesh),false).length,0,'Furniture must not obscure either face');
}
const towardPomni=room.spawn.clone().sub(cast.ragatha.position).setY(0).normalize();
assert.ok(towardPomni.dot(new THREE.Vector3(Math.sin(cast.ragatha.rotation.y),0,Math.cos(cast.ragatha.rotation.y)))>.99);
const frozenPosition=cast.ragatha.position.clone(),frozenCamera=camera.position.clone();
c.setPaused(true);c.update(5);c.skip();assert.ok(cast.ragatha.position.equals(frozenPosition));assert.ok(camera.position.equals(frozenCamera));c.setPaused(false);
for(const speaker of ['ragatha','pomni']){c.dialogueNode({type:'line',speaker});for(let i=0;i<60;i++){c.update(1/30);validate()}}
c.finishDialogue();for(let i=0;i<450&&c.phase!=='done';i++){c.update(1/30,{position:new THREE.Vector3(-3.1,1.9,-.53),target:new THREE.Vector3(-1.05,1.4,-.53)});validate()}
assert.equal(complete,1);assert.equal(cast.ragatha.visible,false);
assert.equal(room.group.getObjectByName('Wall').visible,false);
assert.equal(room.group.getObjectByName('WallCinematicAperture').visible,true);
assert.ok(Math.abs(room.group.getObjectByName('Door_Frame024Hinge').rotation.y+Math.PI/2)<1e-8);
assert.ok(room.interactables[0].objects.some(o=>o.name==='OpenBedroomExitTarget'));
c.dispose();
assert.equal(room.group.getObjectByName('Wall').visible,true);
assert.equal(contacts.length,0,'Ragatha must not intersect the actual room triangles');
fs.mkdirSync('artifacts/ragatha-3d',{recursive:true});fs.writeFileSync('artifacts/ragatha-3d/geometry.json',JSON.stringify({route:c.diagnostics.route,samples,contacts},null,2));
console.log('SAMPLES',samples.length,'CONTACTS',contacts.length);console.log(JSON.stringify(contacts.slice(0,1),null,2));
// Skip cancels pending procedural waypoints; disposal never calls back.
const r=await loadPomniRoom();r.spawn.copy(room.spawn);const skippedCast=await loadRagatha();r.group.add(skippedCast.ragatha);
let skippedDialogue=0,skippedComplete=0;
const skipped=createRagathaEntrance({room:r,camera,cast:skippedCast,onDialogue:()=>skippedDialogue++,onComplete:()=>skippedComplete++});
skipped.update(2.4);skipped.skip();skipped.skip();assert.equal(skippedDialogue,1);assert.equal(skipped.phase,'dialogue');
skipped.finishDialogue();skipped.skip();assert.equal(skipped.phase,'returning');
skipped.update(2,{position:frozenCamera,target:new THREE.Vector3(0,1,0)});assert.equal(skippedComplete,1);assert.equal(skippedCast.ragatha.visible,false);
skipped.dispose();skipped.update(20);assert.equal(skippedComplete,1);
const fail=await loadPomniRoom();fail.spawn.copy(room.spawn);const failCast=await loadRagatha();fail.group.add(failCast.ragatha);
const disposed=createRagathaEntrance({room:fail,camera,cast:failCast,onDialogue:()=>assert.fail('Disposed entrance ran dialogue')});
disposed.update(1);disposed.dispose();disposed.dispose();disposed.skip();disposed.update(30);assert.equal(failCast.ragatha.visible,false);assert.equal(fail.group.getObjectByName('Wall').visible,true);
console.log('PASS Real actor clearance/facing, pause, source-wall restoration, skips and disposal');
// The model is optional: a rejected load must retain the original cinematic
// and the already-tested portrait/staged entrance rather than blocking play.
const originalLoad=GLTFLoader.prototype.load;
GLTFLoader.prototype.load=function(url,onLoad,onProgress,onError){
 if(url.includes('/Ragatha/')){onError(new Error('Expected missing Ragatha test'));return;}
 return originalLoad.call(this,url,onLoad,onProgress,onError);
};
const warning=console.warn;console.warn=()=>{};
const missing=await loadPomniRoom(undefined,{openingMode:'play'});
console.warn=warning;GLTFLoader.prototype.load=originalLoad;
assert.ok(missing.opening);assert.equal(missing.group.userData.ragathaCast,undefined);
console.log('PASS Failed Ragatha loading preserves R5 and the staged entrance fallback');
await import('../_verify_opening_audio.mjs');
const context=THREE.AudioContext.getContext(),listener=new THREE.AudioListener();
const manualAudio=createEntranceAudioSession(listener,room.group,undefined,{manual:true});
let sourceCount=context.sources.length;manualAudio.start(0);assert.equal(context.sources.length,sourceCount);
manualAudio.cue('step',new THREE.Vector3(1,.01,2));assert.equal(context.sources.length,++sourceCount);
manualAudio.pause();manualAudio.resume(40);assert.equal(context.sources.length,sourceCount);
manualAudio.cue('creak',new THREE.Vector3(1,1,3));assert.equal(context.sources.length,++sourceCount);
manualAudio.dispose();manualAudio.cue('step',new THREE.Vector3());assert.equal(context.sources.length,sourceCount);
console.log('PASS Movement-driven audio has no scheduled duplicate cues and cleans up');

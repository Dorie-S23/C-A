import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree } from 'three-mesh-bvh';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { loadJax } from '../src/characters/jax.js';
import { loadRagatha } from '../src/characters/ragatha.js';
import { createDormHallPreview } from '../src/rooms/dormHallPreview.js';
import { createRagathaEntrance } from '../src/cinematics/ragathaEntrance.js';
import { createJaxBedroomPass, JAX_PASS_BEAT, JAX_PASS_RESUME } from '../src/cinematics/jaxBedroomPass.js';
import { preLevel1Dialogue } from '../src/data/dialogues.js';
import { createDialogueEngine } from '../src/dialogue/dialogueEngine.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url, ready, progress, failed) {
  try {
    const b=fs.readFileSync(new URL(url.replace(/^\.\//,''),new URL('../public/',import.meta.url)));
    const n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));
    j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(n+28).toString('base64');
    delete j.images;delete j.textures;j.materials=j.materials.map(({name,doubleSided})=>({name,doubleSided}));
    new GLTFLoader().parseAsync(JSON.stringify(j),'').then(ready,failed);
  } catch(e) { failed(e); }
};
const first=createDialogueEngine(preLevel1Dialogue,{startAt:'ragathaMorningGreeting',stopAt:JAX_PASS_BEAT});
const seen=[];while(!first.done){seen.push(first.current.text);first.advance();}
assert.equal(seen.length,4);assert.ok(seen.at(-1).includes('brilliant'));assert.ok(!seen.some(t=>t.includes('storms past')));
// Structure, not wording: the script's lines get rewritten, the split must not.
const rest=createDialogueEngine(preLevel1Dialogue,{startAt:JAX_PASS_RESUME}),beat=preLevel1Dialogue.findIndex(n=>n.id===JAX_PASS_BEAT);
assert.equal(rest.current,preLevel1Dialogue[beat+1],'Resumes on the line straight after the pass-by beat');assert.equal(rest.current.speaker,'ragatha','Ragatha reacts to Jax first');
console.log('PASS Actual beat marker splits without dropping/repeating spoken lines');

const room=await loadPomniRoom(null,{hallPreview:false});
const preview=createDormHallPreview(await new GLTFLoader().loadAsync('./models/world/dorm-hall-v7.glb'));
room.group.add(preview.group);room.group.userData.dormHallPreview=preview;
const ragatha=await loadRagatha();room.group.add(ragatha.ragatha);
const camera=new THREE.PerspectiveCamera(55,4/3,.1,100);camera.position.set(1.8,2.2,-2.6);
const entrance=createRagathaEntrance({room,camera,cast:ragatha});entrance.skip();
const cast=await loadJax();room.group.add(cast.jax);
cast.jax.traverse(mesh=>{if(mesh.isSkinnedMesh)mesh.skeleton.computeBoneTexture()});
const collisionCount=room.collisionMeshes.length, slab=room.group.getObjectByName('Door_Slab024');
slab.updateWorldMatrix(true,false);const door=slab.matrixWorld.clone(), cameraStart=camera.position.clone(), rotationStart=camera.quaternion.clone();
const cues=[];let complete=0;
const make=()=>createJaxBedroomPass({room:room.group,camera,cast,audio:{cue:(...a)=>cues.push(a),pause(){},resume(){},dispose(){}},onComplete:()=>complete++});
let pass=make();
// Up the hall, to his own door straight across from Pomni's, and in through it.
const jaxSlab=preview.group.getObjectByName('Door_Slab018'),jaxDoor=new Set();jaxSlab.traverse(o=>{if(o.isMesh)jaxDoor.add(o)});
jaxSlab.updateWorldMatrix(true,true);const jaxClosed=jaxSlab.matrixWorld.clone();
const {from,atDoor,inside}=pass.diagnostics;
assert.ok(from[2]>3.4&&atDoor[2]<inside[2]);assert.equal(from[1],pass.diagnostics.floorY);
assert.equal(room.collisionMeshes.length,collisionCount);
assert.ok(cast.jax.children.filter(o=>o.isLight).every(o=>!o.visible));
pass.update(.2);pass.setPaused(true);const frozen=pass.diagnostics;pass.update(2);assert.deepEqual(pass.diagnostics,frozen);pass.setPaused(false);
const samples=[],contacts=[],handHeights=[],handleGaps=[];let widest=0;
const hands=[];let hips;
cast.jax.traverse(o=>{const name=o.name.toLowerCase().replace(/[^a-z]/g,'');if(o.isBone&&/^hand[lr]/.test(name))hands.push(o);if(o.isBone&&name.startsWith('hips'))hips=o});
const knob=jaxSlab.getObjectByName('Plane_9');
const doorCentre=new THREE.Box3().setFromObject(preview.group.getObjectByName('Door_Frame018')).getCenter(new THREE.Vector3());
const inward=Math.sign(doorCentre.z-pass.diagnostics.from[2]);
for(const mesh of preview.meshes)if(!mesh.geometry.boundsTree)computeBoundsTree.call(mesh.geometry);
while(pass.active){
  pass.update(1/60);
  assert.deepEqual(camera.position,cameraStart,'Conversation camera must stay fixed throughout the pass');
  assert.deepEqual(camera.quaternion.toArray(),rotationStart.toArray());
  if(!cast.jax.visible)continue;
  cast.jax.updateMatrixWorld(true);cast.jax.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox()});
  const box=new THREE.Box3().setFromObject(cast.jax);
  const hip=cast.jax.worldToLocal(hips.getWorldPosition(new THREE.Vector3())).multiplyScalar(pass.diagnostics.scale);
  widest=Math.max(widest,pass.diagnostics.doorOpen);
  const handle=new THREE.Box3().setFromObject(knob).getCenter(new THREE.Vector3());
  if(pass.diagnostics.reaching)handleGaps.push({t:pass.diagnostics.elapsed,gap:Math.min(...hands.map(h=>h.getWorldPosition(new THREE.Vector3()).distanceTo(handle)))});
  else for(const hand of hands){
    const p=cast.jax.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).multiplyScalar(pass.diagnostics.scale);
    assert.ok(Math.abs(p.x)<.24&&Math.abs(p.z)<.2,'Hands remain close to the overall pockets, without running arm swings');
    handHeights.push(p.y-hip.y);assert.ok(p.y-hip.y>.06&&p.y-hip.y<.25);
  }
  assert.ok(cast.jax.rotation.x<=0&&Math.abs(cast.jax.rotation.z)<.03,'Relaxed lean and restrained swagger');
  samples.push({t:pass.diagnostics.elapsed,min:box.min.toArray(),max:box.max.toArray()});
  // At and through his door his arm's out to it and his box (turning, arm
  // out) takes in the wall beside it: there, he must keep to the doorway's
  // middle, and only cross the wall's line with the door well open.
  const {position,doorOpen,reaching}=pass.diagnostics;
  const fromWall=(position[2]-doorCentre.z)*inward;
  if(reaching||doorOpen>0||Math.abs(fromWall)<.5){
    if(Math.abs(fromWall)<.3)assert.ok(Math.abs(position[0]-doorCentre.x)<.3,'Through the middle of his doorway');
    if(Math.abs(fromWall)<.1)assert.ok(doorOpen>.25,'His middle crosses the wall line only once it is open: '+doorOpen);
    continue;
  }
  // Test the swept body volume above shoe contact; floor contact is expected.
  const body=box.clone();body.min.y=Math.max(body.min.y,pass.diagnostics.floorY+.035);
  for(const mesh of preview.meshes){
    const local=body.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
    if(mesh.geometry.boundsTree.intersectsBox(local,new THREE.Matrix4())){contacts.push({t:pass.diagnostics.elapsed,mesh:mesh.name});}
  }
}
assert.equal(complete,1);assert.equal(cast.jax.visible,false);assert.deepEqual(camera.position,cameraStart);assert.deepEqual(camera.quaternion.toArray(),rotationStart.toArray());
assert.deepEqual(slab.matrixWorld,door);assert.equal(entrance.phase,'dialogue');assert.equal(room.collisionMeshes.length,collisionCount);
const kinds=cues.map(c=>c[0]);
assert.deepEqual(kinds.filter(k=>k!=='step'),['creak','thud'],'His door creaks open, then thuds shut');
assert.ok(kinds.filter(k=>k==='step').length>=6,'Footsteps match the 2.8 steps/second strut');
assert.ok(widest>.9,'He swings his door right open');jaxSlab.updateWorldMatrix(true,true);
jaxSlab.matrixWorld.elements.forEach((v,i)=>assert.ok(Math.abs(v-jaxClosed.elements[i])<1e-6,'and it ends shut'));
// His hand is on the handle while he holds it: the hand bone is his wrist,
// and the handle's middle is half the door's thickness in from its knob.
const held=handleGaps.filter(g=>g.gap<.24);assert.ok(held.length>20,'His hand reaches the handle and rides it: '+JSON.stringify(handleGaps.filter((_,i)=>i%10===0)));
assert.deepEqual(contacts,[]);
cast.jax.traverse(mesh=>{if(mesh.isSkinnedMesh)assert.equal(mesh.skeleton.boneTexture,null)});
assert.ok(samples.every(s=>s.min[1]>=pass.diagnostics.floorY-.001),'Evaluated shoes must not penetrate the floor');
console.log('PASS Sly pocket-height hands, restrained walk, matching footsteps, real hall clearance, fixed camera/door',{samples:samples.length,contacts:contacts.length,cues:cues.length,closestToHandle:Math.min(...handleGaps.map(g=>g.gap)),lowestShoe:Math.min(...samples.map(s=>s.min[1])),handHeightAboveHips:[Math.min(...handHeights),Math.max(...handHeights)]});
pass.dispose();pass.dispose();assert.equal(complete,1);
// A fresh cast is used for each session; exercise skip/disposal with it too.
const cast2=await loadJax();room.group.add(cast2.jax);
pass=createJaxBedroomPass({room:room.group,camera,cast:cast2,onComplete:()=>complete++});pass.skip();pass.skip();assert.equal(complete,2);
pass.dispose();
const cast3=await loadJax();room.group.add(cast3.jax);
pass=createJaxBedroomPass({room:room.group,camera,cast:cast3,onComplete:()=>complete++});pass.update(.6);pass.dispose();pass.update(5);assert.equal(complete,2);assert.equal(cast3.jax.visible,false);
assert.deepEqual(camera.position,cameraStart);
console.log('PASS Pause/resume, skip once, disposal without callback or duplicate actor activity');
const normal=await loadJax();normal.playPassBy(new THREE.Vector3(),new THREE.Vector3(0,0,4),2);normal.update(.4);
assert.ok(normal.jax.rotation.x>.2,'Default standalone cutscene still runs with its original forward lean');
console.log('PASS Existing standalone Jax running style remains the default');
fs.mkdirSync('artifacts/jax-bedroom-pass',{recursive:true});fs.writeFileSync('artifacts/jax-bedroom-pass/geometry.json',JSON.stringify({pass:true,samples,contacts,cues:cues.length},null,2));

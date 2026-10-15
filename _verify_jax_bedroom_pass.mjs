import './tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree } from 'three-mesh-bvh';
import { loadPomniRoom } from './src/rooms/pomniRoom.js';
import { loadJax } from './src/characters/jax.js';
import { loadRagatha } from './src/characters/ragatha.js';
import { createDormHallPreview } from './src/rooms/dormHallPreview.js';
import { createRagathaEntrance } from './src/cinematics/ragathaEntrance.js';
import { createJaxBedroomPass, JAX_PASS_BEAT, JAX_PASS_RESUME } from './src/cinematics/jaxBedroomPass.js';
import { preLevel1Dialogue } from './src/data/dialogues.js';
import { createDialogueEngine } from './src/dialogue/dialogueEngine.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url, ready, progress, failed) {
  try {
    const b=fs.readFileSync(new URL(url.replace(/^\.\//,''),new URL('./public/',import.meta.url)));
    const n=b.readUInt32LE(12),j=JSON.parse(b.subarray(20,20+n));
    j.buffers[0].uri='data:application/octet-stream;base64,'+b.subarray(n+28).toString('base64');
    delete j.images;delete j.textures;j.materials=j.materials.map(({name,doubleSided})=>({name,doubleSided}));
    new GLTFLoader().parseAsync(JSON.stringify(j),'').then(ready,failed);
  } catch(e) { failed(e); }
};
const first=createDialogueEngine(preLevel1Dialogue,{startAt:'ragathaMorningGreeting',stopAt:JAX_PASS_BEAT});
const seen=[];while(!first.done){seen.push(first.current.text);first.advance();}
assert.equal(seen.length,4);assert.ok(seen.at(-1).includes('brilliant'));assert.ok(!seen.some(t=>t.includes('storms past')));
const rest=createDialogueEngine(preLevel1Dialogue,{startAt:JAX_PASS_RESUME});assert.equal(rest.current.text,"...He's been like that for days now.");
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
assert.ok(Math.abs(pass.diagnostics.from[2]-pass.diagnostics.to[2])<1e-8);
assert.ok(pass.diagnostics.from[2]>3.4);assert.equal(pass.diagnostics.from[1],pass.diagnostics.floorY);
assert.equal(room.collisionMeshes.length,collisionCount);
assert.ok(cast.jax.children.filter(o=>o.isLight).every(o=>!o.visible));
pass.update(.2);pass.setPaused(true);const frozen=pass.diagnostics;pass.update(2);assert.deepEqual(pass.diagnostics,frozen);pass.setPaused(false);
const samples=[],contacts=[];
for(const mesh of preview.meshes)if(!mesh.geometry.boundsTree)computeBoundsTree.call(mesh.geometry);
while(pass.active){
  pass.update(1/60);
  assert.deepEqual(camera.position,cameraStart,'Conversation camera must stay fixed throughout the pass');
  assert.deepEqual(camera.quaternion.toArray(),rotationStart.toArray());
  if(!cast.jax.visible)continue;
  cast.jax.updateMatrixWorld(true);cast.jax.traverse(o=>{if(o.isSkinnedMesh)o.computeBoundingBox()});
  const box=new THREE.Box3().setFromObject(cast.jax);
  samples.push({t:pass.diagnostics.elapsed,min:box.min.toArray(),max:box.max.toArray()});
  // Test the swept body volume above shoe contact; floor contact is expected.
  const body=box.clone();body.min.y=Math.max(body.min.y,pass.diagnostics.floorY+.035);
  for(const mesh of preview.meshes){
    const local=body.clone().applyMatrix4(mesh.matrixWorld.clone().invert());
    if(mesh.geometry.boundsTree.intersectsBox(local,new THREE.Matrix4()))contacts.push({t:pass.diagnostics.elapsed,mesh:mesh.name});
  }
}
assert.equal(complete,1);assert.equal(cast.jax.visible,false);assert.deepEqual(camera.position,cameraStart);assert.deepEqual(camera.quaternion.toArray(),rotationStart.toArray());
assert.deepEqual(slab.matrixWorld,door);assert.equal(entrance.phase,'dialogue');assert.equal(room.collisionMeshes.length,collisionCount);
assert.ok(cues.length>=8&&cues.length<=15);assert.deepEqual(contacts,[]);
cast.jax.traverse(mesh=>{if(mesh.isSkinnedMesh)assert.equal(mesh.skeleton.boneTexture,null)});
assert.ok(samples.every(s=>s.min[1]>=pass.diagnostics.floorY-.001),'Evaluated shoes must not penetrate the floor');
console.log('PASS Real rig runs parallel to real hall, audio cadence, stationary door/Ragatha, restored camera',{samples:samples.length,contacts:contacts.length,steps:cues.length,lowestShoe:Math.min(...samples.map(s=>s.min[1]))});
pass.dispose();pass.dispose();assert.equal(complete,1);
// A fresh cast is used for each session; exercise skip/disposal with it too.
const cast2=await loadJax();room.group.add(cast2.jax);
pass=createJaxBedroomPass({room:room.group,camera,cast:cast2,onComplete:()=>complete++});pass.skip();pass.skip();assert.equal(complete,2);
pass.dispose();
const cast3=await loadJax();room.group.add(cast3.jax);
pass=createJaxBedroomPass({room:room.group,camera,cast:cast3,onComplete:()=>complete++});pass.update(.6);pass.dispose();pass.update(5);assert.equal(complete,2);assert.equal(cast3.jax.visible,false);
assert.deepEqual(camera.position,cameraStart);
console.log('PASS Pause/resume, skip once, disposal without callback or duplicate actor activity');
fs.mkdirSync('artifacts/jax-bedroom-pass',{recursive:true});fs.writeFileSync('artifacts/jax-bedroom-pass/geometry.json',JSON.stringify({pass:true,samples,contacts,cues:cues.length},null,2));

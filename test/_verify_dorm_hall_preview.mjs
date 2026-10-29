import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { createDormHallPreview, loadDormHallPreview, DORM_PREVIEW_POSITION } from '../src/rooms/dormHallPreview.js';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { loadRagatha } from '../src/characters/ragatha.js';
import { createRagathaEntrance } from '../src/cinematics/ragathaEntrance.js';

globalThis.ProgressEvent??=class{};
THREE.Mesh.prototype.raycast=acceleratedRaycast;
GLTFLoader.prototype.load=function(url,onLoad,_progress,onError){
 try{
  const bytes=fs.readFileSync(new URL(url.replace(/^\.\//,''),new URL('../public/',import.meta.url)));
  const n=bytes.readUInt32LE(12),j=JSON.parse(bytes.subarray(20,20+n));
  j.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(n+28).toString('base64');
  delete j.images;delete j.textures;j.materials=j.materials.map(({name,doubleSided})=>({name,doubleSided}));
  new GLTFLoader().parseAsync(JSON.stringify(j),'').then(onLoad,onError);
 }catch(error){onError(error)}
};
const gltf=await new GLTFLoader().loadAsync('./models/world/dorm-hall-v7.glb');gltf.scene.updateMatrixWorld(true);
const transforms=new Map();gltf.scene.traverse(o=>transforms.set(o.uuid,{p:o.position.toArray(),q:o.quaternion.toArray(),s:o.scale.toArray()}));
const preview=createDormHallPreview(gltf,{sourceBytes:30115128});
assert.deepEqual(preview.group.position.toArray(),DORM_PREVIEW_POSITION);assert.equal(preview.group.rotation.y,-Math.PI/2);assert.deepEqual(preview.group.scale.toArray(),[1,1,1]);
preview.group.traverse(o=>{if(o===preview.group)return;const t=transforms.get(o.uuid);assert.deepEqual(o.position.toArray(),t.p);assert.deepEqual(o.quaternion.toArray(),t.q);assert.deepEqual(o.scale.toArray(),t.s)});
assert.ok(preview.metrics.triangles<55000);assert.ok(preview.metrics.triangles>20000);
for(const n of ['Door_Slab068','Door_Frame068','Plane_36','Plane_37','Pomni'])assert.equal(preview.group.getObjectByName(n),undefined);
preview.group.traverse(o=>assert.equal(o.isLight===true||o.isSkinnedMesh===true,false));
const floor=preview.meshes.find(m=>m.name==='Cube002');const floorBox=new THREE.Box3().setFromObject(floor);
assert.ok(Math.abs(floorBox.min.y-.0009707212448120117)<1e-6);assert.ok(Math.abs(floorBox.min.z-3.325169447809458)<2e-6);
for(const m of preview.meshes){const box=new THREE.Box3().setFromObject(m);assert.ok(box.min.z>3.32516,'Hall geometry must remain outside bedroom');for(const attr of Object.values(m.geometry.attributes))assert.ok(attr.array.every(Number.isFinite));if(!m.geometry.boundsTree)computeBoundsTree.call(m.geometry)}
console.log('PASS Native alignment, floor seam, crop, original child/negative transforms, duplicate removal and no gameplay/lights',preview.metrics);

// Release only resources exclusive to pruned meshes, then dispose retained ones once.
const image={close(){image.closed++},closed:0},texture=new THREE.Texture(image),otherTexture=new THREE.Texture(image);
const material=new THREE.MeshStandardMaterial({map:texture}),otherMaterial=new THREE.MeshStandardMaterial({map:otherTexture});
const geometry=new THREE.BoxGeometry(.2,.2,.2),scene=new THREE.Group();
const kept=new THREE.Mesh(geometry,material);kept.position.set(0,1,-40);scene.add(kept);
const pruned=new THREE.Mesh(geometry,[material,otherMaterial]);scene.add(pruned);
let gd=0,md=0,td=0;geometry.addEventListener('dispose',()=>gd++);material.addEventListener('dispose',()=>md++);texture.addEventListener('dispose',()=>td++);
const synthetic=createDormHallPreview({scene});assert.equal(gd+md+td+image.closed,0);synthetic.dispose();synthetic.dispose();assert.deepEqual([gd,md,td,image.closed],[1,1,1,1]);
console.log('PASS Shared geometry/material/image survive pruning; owned resources close/dispose exactly once');

const room=await loadPomniRoom();room.spawn.set(-1.0500005828829344,.006783101291564675,-.5300000095389795);
room.group.add(preview.group);room.group.userData.dormHallPreview=preview;
const cast=await loadRagatha();room.group.add(cast.ragatha);
const camera=new THREE.PerspectiveCamera(70,4/3,.1,500);camera.position.set(-3.1,1.9,-.53);camera.lookAt(-1.05,1.4,-.53);
let greeted=0;const c=createRagathaEntrance({room,camera,cast,onDialogue:()=>greeted++});
const actors=[];cast.ragatha.traverse(o=>{if(o.isMesh&&o!==cast.collider)actors.push(o)});
for(const m of actors)computeBoundsTree.call(m.geometry);
const contacts=[];let samples=0;
function validate(){room.group.updateMatrixWorld(true);if(!cast.ragatha.visible)return;samples++;
 for(const actor of actors){const a=new THREE.Box3().setFromObject(actor);for(const wall of preview.meshes){if(!a.intersectsBox(new THREE.Box3().setFromObject(wall)))continue;
  wall.geometry.boundsTree.bvhcast(actor.geometry.boundsTree,wall.matrixWorld.clone().invert().multiply(actor.matrixWorld),{intersectsTriangles(a,b){if(!new THREE.Box3().setFromPoints([a.a,a.b,a.c]).intersectsBox(new THREE.Box3().setFromPoints([b.a,b.b,b.c])))return false;if(a.intersectsTriangle(b,new THREE.Line3(),true)){contacts.push({stage:c.diagnostics.stage,actor:actor.name,hall:wall.name});return true}return false}});
 }}
}
for(let i=0;i<300&&c.phase==='entering';i++){c.update(1/30);validate()}
assert.equal(greeted,1);assert.equal(preview.group.visible,true);
room.group.getObjectByName('RagathaDoorVestibule').traverse(o=>{if(o.isMesh)assert.equal(o.material.visible,false);assert.notEqual(o.isLight,true)});
c.finishDialogue();for(let i=0;i<300&&c.phase!=='done';i++){c.update(1/30,{position:camera.position.clone(),target:new THREE.Vector3(-1,1,0)});validate()}
assert.equal(contacts.length,0,JSON.stringify(contacts.slice(0,3)));assert.equal(c.phase,'done');assert.equal(preview.group.visible,false);c.dispose();assert.equal(preview.group.visible,false);
console.log('PASS Ragatha complete entrance/departure vs real hallway triangles; no added lights; aperture/preview lifecycle (hall hidden once the door is shut)', {samples,contacts:contacts.length});

const savedFetch=globalThis.fetch,savedWarn=console.warn;globalThis.fetch=async(input,...args)=>{
 const url=typeof input==='string'?input:input.url??input.href;
 if(url.startsWith('data:'))return savedFetch(input,...args);
 throw new Error('Expected preview load failure');
};console.warn=()=>{};document.baseURI='http://preview.test/';
const fallback=await loadPomniRoom(undefined,{hallPreview:true});console.warn=savedWarn;
assert.equal(fallback.group.userData.dormHallPreview,undefined);assert.ok(fallback.group.userData.dormHallPreviewError);assert.equal(fallback.interactables[0].prompt(),'Exit to Hallway');
await assert.rejects(loadDormHallPreview(),/fetch|ENOTFOUND|preview|Invalid|HTTP/i);
globalThis.fetch=savedFetch;
const savedLocation=globalThis.location;globalThis.location={search:'?hallPreview=0'};
const optedOut=await loadPomniRoom(undefined,{hallPreview:true});
assert.equal(optedOut.group.userData.dormHallPreview,undefined);assert.equal(optedOut.group.userData.dormHallPreviewError,undefined);
if(savedLocation===undefined)delete globalThis.location;else globalThis.location=savedLocation;
optedOut.lighting.dispose();
console.log('PASS Explicit low-cost URL skips the optional hall without treating it as a loading error');
preview.dispose();preview.dispose();room.lighting.dispose();fallback.lighting.dispose();
fs.mkdirSync('artifacts/dorm-hall-preview',{recursive:true});fs.writeFileSync('artifacts/dorm-hall-preview/geometry.json',JSON.stringify({pass:true,metrics:preview.metrics,routeSamples:samples,contacts},null,2));
console.log('PASS Optional preview failure preserves bedroom/E interaction; original assets were read only');

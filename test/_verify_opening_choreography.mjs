import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { createRagathaEntrance } from '../src/cinematics/ragathaEntrance.js';
import { OPENING_SEATED_TIME, OPENING_WAKE_SECONDS } from '../src/cinematics/pomniOpening.js';
import { POMNI_SEATED_DIALOGUE } from '../src/cinematics/pomniInvitation.js';
import { preLevel1Dialogue } from '../src/data/dialogues.js';
import { createDialogueEngine } from '../src/dialogue/dialogueEngine.js';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url,onLoad,_progress,onError) {
 try {
  const bytes=fs.readFileSync(new URL(url.replace(/^\.\//,''),new URL('../public/',import.meta.url)));
  const size=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+size));
  json.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(size+28).toString('base64');
  delete json.images;delete json.textures;json.materials=json.materials.map(({name,doubleSided})=>({name,doubleSided}));
  new GLTFLoader().parseAsync(JSON.stringify(json),'').then(onLoad,onError);
 }catch(error){onError(error)}
};
const metadata=JSON.parse(fs.readFileSync('tools/fixtures/pomni-r5-timing.json'));
const seated=metadata.markers.find(m=>m.name==='Sitting');
assert.equal(seated.frame,119);assert.equal(OPENING_SEATED_TIME,seated.clip_time);
assert.equal(POMNI_SEATED_DIALOGUE[0],preLevel1Dialogue[0]);
const morning=createDialogueEngine(preLevel1Dialogue,{startAt:'ragathaMorningGreeting'});
assert.equal(morning.current.speaker,'ragatha');
while(morning.current){assert.notEqual(morning.current.id,'pomniMorningRemark');morning.advance()}
console.log('PASS Seated time derives from frozen frame 119; self-directed line is reused exactly once');

const camera=new THREE.PerspectiveCamera(),make=()=>loadPomniRoom(undefined,{openingMode:'play'});
const follow={position:new THREE.Vector3(-3.1,1.9,-.53),target:new THREE.Vector3(-1.05,1.4,-.53)};
for(const fps of [30,120]){
 const room=await make(),o=room.opening;let seats=0,handoffs=0,completes=0;
 o.start({camera,resolveCamera:(_,desired)=>desired,onSeated:()=>seats++,onHandoff:()=>handoffs++,onComplete:()=>completes++});
 while(o.phase==='playing')o.update(1/fps);
 assert.equal(o.phase,'seated');assert.equal(seats,1);assert.equal(handoffs,0);
 assert.ok(Math.abs(o.time-OPENING_SEATED_TIME)<1e-10);
 const actor=room.group.getObjectByName('PomniPlacement_GameScale');room.group.updateMatrixWorld(true);
 const hips=[];actor.traverse(b=>{if(b.isBone&&/hips/i.test(b.name))hips.push(b)});assert.ok(hips.length);
 const seatedHip=hips[0].getWorldPosition(new THREE.Vector3());
 const matrices=[];actor.traverse(b=>{if(b.isBone)matrices.push(b.matrixWorld.toArray())});
 const weights=Array.from(o.blanket.morphTargetInfluences),position=camera.position.clone(),time=o.elapsed;
 o.update(100);o.setPaused(true);o.resumeForEntrance();o.update(100);assert.equal(o.phase,'seated');o.setPaused(false);
 const held=[];room.group.updateMatrixWorld(true);actor.traverse(b=>{if(b.isBone)held.push(b.matrixWorld.toArray())});
 assert.deepEqual(held,matrices);assert.deepEqual(o.blanket.morphTargetInfluences,weights);assert.equal(o.elapsed,time);assert.ok(camera.position.equals(position));
 o.resumeForEntrance();o.resumeForEntrance();o.update(.5);
 assert.equal(handoffs,0);assert.ok(room.group.getObjectByName('PomniPlacement_GameScale'));
 assert.ok(Math.abs(o.time-OPENING_SEATED_TIME-.5)<1e-10);assert.ok(camera.position.equals(position));
 assert.notDeepEqual(o.blanket.morphTargetInfluences,weights);
 o.setPaused(true);const paused=o.time;o.update(20);assert.equal(o.time,paused);o.setPaused(false);
 while(o.active)o.update(1/fps);
 assert.equal(handoffs,1);assert.equal(completes,1);assert.equal(o.phase,'done');assert.equal(seats,1);
 assert.equal(room.group.getObjectByName('PomniPlacement_GameScale'),undefined);
 console.log('PASS '+fps+'fps: seated skeleton/blanket/camera hold, coordinated 1x resume, delayed single handoff; seated hips '+seatedHip.toArray());
 o.dispose();room.lighting.dispose();
}
const room=await make(),o=room.opening;let handed=0,dialogues=0,doors=0;
o.start({camera,resolveCamera:(_,p)=>p,onSeated:()=>{},onHandoff:()=>handed++});o.update(30);assert.equal(o.phase,'seated');
const entrance=createRagathaEntrance({room,camera,onDoorOpening:()=>{doors++;o.resumeForEntrance()},canStartDialogue:()=>!o.active,onDialogue:()=>dialogues++});
entrance.update(.6);assert.equal(o.phase,'seated');entrance.update(.1);assert.equal(o.phase,'playing');assert.equal(doors,1);
entrance.update(20);assert.equal(dialogues,0,'Entrance must wait for Pomni even if its own timeline finishes first');
o.update(20);assert.equal(handed,1);entrance.update(.01);assert.equal(dialogues,1);entrance.skip();assert.equal(doors,1);
entrance.dispose();o.dispose();room.lighting.dispose();
console.log('PASS Door-opening event resumes Pomni once; conversation waits for standing even on uneven update rates');
const cancelled=await make(),c=cancelled.opening;let late=0;
c.start({camera,resolveCamera:(_,p)=>p,onSeated:()=>{},onComplete:()=>late++});c.update(30);c.dispose();c.resumeForEntrance();c.skip();c.update(50);assert.equal(late,0);
cancelled.lighting.dispose();
const skipped=await make(),s=skipped.opening;let swaps=0;
s.start({camera,resolveCamera:(_,p)=>p,onSeated:()=>{},onHandoff:()=>swaps++});s.update(30);s.skip();assert.equal(s.time,7.5);s.update(1.25,follow);assert.equal(s.phase,'done');assert.equal(swaps,1);s.dispose();skipped.lighting.dispose();
console.log('PASS Seated disposal has no late callbacks; seated skip stands and restores gameplay camera once');
for(const fps of [30,120]){
 const room=await make(),o=room.opening,cast=room.group.userData.ragathaCast;
 room.spawn.set(-1.0500005828829344,.006783101291564675,-.5300000095389795);
 let greetings=0,overlap=0;
 o.start({camera,resolveCamera:(_,p)=>p,onSeated:()=>{}});o.update(30);
 const entrance=createRagathaEntrance({room,camera,cast,onDoorOpening:()=>o.resumeForEntrance(),
  advanceOpening:dt=>o.update(dt),canStartDialogue:()=>!o.active,onDialogue:()=>greetings++});
 assert.ok(room.group.getObjectByName('WallCinematicAperture').geometry.boundsTree);
 for(let i=0;i<fps*12&&entrance.phase==='entering';i++){
  entrance.update(1/fps);
  if(entrance.diagnostics.stage==='walking-in'&&o.phase==='playing'){
   overlap++;assert.ok(Math.abs(o.time-(OPENING_SEATED_TIME+entrance.elapsed-.65))<.034);
   if(i%Math.ceil(fps/6)===0){
    room.group.updateMatrixWorld(true);
    const pomni=new THREE.Box3().setFromObject(room.group.getObjectByName('PomniPlacement_GameScale'),true);
    const ragatha=new THREE.Box3();cast.ragatha.traverse(m=>{if(m.isMesh&&m!==cast.collider)ragatha.expandByObject(m,true)});
    assert.equal(pomni.intersectsBox(ragatha),false,'Simultaneous actors must have disjoint rendered bounds');
   }
  }
 }
 assert.ok(overlap>fps);assert.equal(greetings,1);assert.equal(o.phase,'done');
 entrance.dispose();o.dispose();room.lighting.dispose();
 console.log('PASS '+fps+'fps: shared simulation steps retain overlapping movement, actor clearance and one greeting');
}
assert.ok(OPENING_WAKE_SECONDS>5.44+.159);

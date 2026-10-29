import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadPomni } from '../src/characters/pomni.js';
import { createPomniSpeaking } from '../src/characters/pomniSpeaking.js';
globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function(url,onLoad,_progress,onError) {
  try {
    const bytes=fs.readFileSync(new URL(url.replace(/^\.\//,''),new URL('../public/',import.meta.url)));
    const length=bytes.readUInt32LE(12),data=JSON.parse(bytes.subarray(20,20+length));
    data.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(length+28).toString('base64');
    delete data.images;delete data.textures;data.materials=data.materials.map(({name,doubleSided})=>({name,doubleSided}));
    new GLTFLoader().parseAsync(JSON.stringify(data),'').then(onLoad,onError);
  } catch(error) { onError(error); }
};
const {pomni,animations}=await loadPomni(),layer=createPomniSpeaking(pomni);
assert.equal(layer.diagnostics.joints.length,6,'Uses all six existing Mixamo arm/hand bones');
const hash=()=>{
  const h=createHash('sha256');
  for(const clip of animations){h.update(clip.name+clip.duration);for(const t of clip.tracks){h.update(t.name);h.update(Buffer.from(t.times.buffer));h.update(Buffer.from(t.values.buffer));}}
  return h.digest('hex');
};
const originalHash=hash(),mixer=new THREE.AnimationMixer(pomni);
mixer.clipAction(animations.find(c=>c.name.toLowerCase()==='idle')).play();
const names=layer.diagnostics.joints.map(j=>j.name),bones=names.map(name=>pomni.getObjectByName('mixamorig'+name));
function frame(dt,speaking){layer.remove();mixer.update(dt);layer.update(dt,speaking);}
frame(.1,false);const idle=bones.map(b=>b.quaternion.clone());
frame(0,false);assert.deepEqual(bones.map(b=>b.quaternion.toArray()),idle.map(q=>q.toArray()));
for(let i=0;i<60;i++)frame(1/60,true);
assert.ok(layer.diagnostics.weight>.999);
const a=bones.map(b=>b.quaternion.clone());
for(let i=0;i<20;i++)frame(1/60,true);
assert.ok(bones.some((b,i)=>b.quaternion.angleTo(a[i])>.005),'Real hands/arms move during a held speaking line');
const frozen=bones.map(b=>b.quaternion.toArray());const time=layer.diagnostics.time;
for(let i=0;i<20;i++)frame(0,true);
assert.deepEqual(bones.map(b=>b.quaternion.toArray()),frozen);assert.equal(layer.diagnostics.time,time);
for(let i=0;i<120;i++)frame(1/60,false);
assert.equal(layer.diagnostics.weight,0);assert.equal(layer.diagnostics.speaking,false);
console.log('PASS Actual Pomni skeleton gestures during speech, rests while listening, and freezes during pause');
// No cumulative rotations, including bones not overwritten by a mixer track.
layer.reset();mixer.update(0);const base=bones.map(b=>b.quaternion.clone());
for(let i=0;i<3600;i++){
 layer.remove();layer.update(1/60,true);
 assert.ok(bones.every((b,j)=>b.quaternion.angleTo(base[j])<.5),'Subtle bounded rotations without drift');
}
layer.reset();assert.deepEqual(bones.map(b=>b.quaternion.toArray()),base.map(q=>q.toArray()));
assert.equal(layer.diagnostics.weight,0);assert.equal(hash(),originalHash,'Idle/Walk/Run clips remain unchanged');
function atRate(rate){layer.reset();for(let i=0;i<rate;i++){layer.remove();layer.update(1/rate,true)}return layer.diagnostics;}
const slow=atRate(30),fast=atRate(120);assert.ok(Math.abs(slow.weight-fast.weight)<1e-10);
slow.joints.forEach((joint,i)=>joint.rotation.forEach((value,j)=>assert.ok(Math.abs(value-fast.joints[i].rotation[j])<1e-10)));
layer.reset();const missing=createPomniSpeaking(new THREE.Group());missing.update(.1,true);missing.remove();missing.reset();
assert.equal(missing.diagnostics.joints.length,0);
console.log('PASS No drift over 60 seconds, frame-rate independence, safe reset/missing bones, original Idle/Walk/Run data preserved');

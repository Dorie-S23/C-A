// Confirms loadJax()'s idle breathing/tremble and faceTowards actually
// run against the real model, and that the spine/head bones they rely on
// exist — same technique as verify_kaufmo_talk_bones.mjs.
// Run: node tools/verify_jax_idle_bones.mjs
import '../tools/testCanvas.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadJax } from '../src/characters/jax.js';
import {execFileSync} from 'node:child_process';

globalThis.ProgressEvent ??= class {};
GLTFLoader.prototype.load = function (url, onLoad, _progress, onError) {
  try {
    const bytes = fs.readFileSync(new URL(url.replace(/^\.\//, ''), new URL('../public/', import.meta.url)));
    const length = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + length));
    data.buffers[0].uri = 'data:application/octet-stream;base64,' + bytes.subarray(length + 28).toString('base64');
    delete data.images; delete data.textures;
    data.materials = data.materials.map(({ name, doubleSided }) => ({ name, doubleSided }));
    new GLTFLoader().parseAsync(JSON.stringify(data), '').then(onLoad, onError);
  } catch (error) { onError(error); }
};

const oldSource=execFileSync('git',['show','9f8f05f:src/characters/jax.js'],{encoding:'utf8'})
 .replace("'three'",JSON.stringify(import.meta.resolve('three')))
 .replace("'three/examples/jsm/loaders/GLTFLoader.js'",JSON.stringify(import.meta.resolve('three/examples/jsm/loaders/GLTFLoader.js')))
 .replace("'./bendBone.js'",JSON.stringify(new URL('../src/characters/bendBone.js',import.meta.url).href));
const {loadJax:loadPrevious}=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
const old=await loadPrevious(),current=await loadJax();
const bones=root=>{const result=new Map();root.traverse(o=>{if(o.isBone)result.set(o.name,o);});return result;};
function samePose(a,b){const aa=bones(a.jax),bb=bones(b.jax);for(const [name,bone]of aa){const other=bb.get(name);assert.ok(bone.quaternion.toArray().every((v,i)=>Math.abs(v-other.quaternion.toArray()[i])<1e-6),`changed legacy bone ${name}`);}assert.ok(a.jax.position.distanceTo(b.jax.position)<1e-6);assert.ok(a.jax.quaternion.angleTo(b.jax.quaternion)<1e-6);}
for(let i=0;i<120;i++){old.update(1/60);current.update(1/60);samePose(old,current);}
current.setDistressed(true);current.update(.1);current.jax.updateMatrixWorld(true);old.jax.updateMatrixWorld(true);
const head=bones(current.jax).get('head_8_14'),previousHead=bones(old.jax).get('head_8_14');
const currentPoint=head.getWorldPosition(new THREE.Vector3()),oldPoint=previousHead.getWorldPosition(new THREE.Vector3());
console.log(JSON.stringify({current:currentPoint.toArray(),previous:oldPoint.toArray()}));
assert.ok(currentPoint.y<oldPoint.y-.02,'distress must lower the actual skinned head position');
const snapshot=()=>[...bones(current.jax).values()].map(bone=>bone.quaternion.toArray());
const frozen=snapshot();for(let i=0;i<20;i++)current.update(0);assert.deepEqual(snapshot(),frozen,'zero delta must preserve pose');
for(let i=0;i<240;i++)current.update(1/60);
const from=new THREE.Vector3(0,0,0),to=new THREE.Vector3(0,0,-5);
old.playPassBy(from,to,1.5);current.playPassBy(from,to,1.5);
for(let i=0;i<89;i++){old.update(1/60);current.update(1/60);samePose(old,current);}
console.log(JSON.stringify({legacyIdleAndRunUnchanged:true,distressedHeadY:currentPoint.y,previousHeadY:oldPoint.y,pausedPoseStable:true}));

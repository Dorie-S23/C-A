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

const room=await loadPomniRoom();
const bounds=o=>new THREE.Box3().setFromObject(o);
for(const n of ['Plane_1','Plane_2','Door_Frame024','Door_Slab024']) {const b=bounds(room.group.getObjectByName(n));console.log(n,b.min.toArray(),b.max.toArray());}
const {loadRagatha}=await import('../src/characters/ragatha.js');const cast=await loadRagatha();
for(const p of ['idle','listen','wave','chatty']){cast.setPose(p);for(let i=0;i<90;i++)cast.update(1/60);const b=bounds(cast.ragatha);console.log('RAGATHA',p,b.min.toArray(),b.max.toArray());}
const region=new THREE.Box3(new THREE.Vector3(-.1,.15,-.8),new THREE.Vector3(2.5,2.3,4));
for(const {mesh,box} of room.collisionMeshes){if(box.intersectsBox(region))console.log('NEAR',mesh.name,box.min.toArray(),box.max.toArray());}

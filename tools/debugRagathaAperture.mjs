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
const camera=new THREE.PerspectiveCamera();camera.position.set(-3.1,1.9,-.53);camera.lookAt(-1.05,1.4,-.53);
let dialogue=0,complete=0;const c=createRagathaEntrance({room,camera,cast,onDialogue:()=>dialogue++,onComplete:()=>complete++});

c.update(1);room.group.updateMatrixWorld(true);
const wall=room.group.getObjectByName('WallCinematicAperture');
const old=room.group.getObjectByName('Wall');
console.log('MATRICES',old.matrixWorld.elements,wall.matrixWorld.elements,'counts',old.geometry.attributes.position.count,wall.geometry.attributes.position.count);
computeBoundsTree.call(wall.geometry);
const ray=new THREE.Raycaster(new THREE.Vector3(1.4,1,2.8),new THREE.Vector3(0,0,1));console.log('RAY',ray.intersectObject(wall,false).map(h=>({p:h.point.toArray(),face:h.faceIndex})));

import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOpeningAudio } from '../src/cinematics/openingAudio.js';

// Use Three.js's real Audio/PositionalAudio with a deterministic Web Audio
// clock/graph double. Includes the disconnect errors native nodes can raise.
const param=()=>({value:1,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}});
const node=()=>({links:new Set(),connect(other){this.links.add(other)},disconnect(other){if(other&&!this.links.has(other))throw Error('InvalidAccessError');if(other)this.links.delete(other);else this.links.clear()}});
class Context extends EventTarget {
 currentTime=0;state='running';destination=node();sources=[];
 resume(){return Promise.resolve()}
 createGain(){return Object.assign(node(),{gain:param()})}
 createPanner(){return Object.assign(node(),{setPosition(){},setOrientation(){}})}
 createBuffer(channels,count,rate){const data=new Float32Array(count);return {getChannelData:()=>data,duration:count/rate}}
 createBufferSource(){const source=Object.assign(node(),{detune:param(),playbackRate:param(),stops:[],start(at){this.at=at},stop(at){this.stops.push(at)}});this.sources.push(source);return source}
}
globalThis.window={addEventListener(){}};
const context=new Context();THREE.AudioContext.setContext(context);
const camera=new THREE.PerspectiveCamera(),system=createOpeningAudio(camera);await system.unlock();
const room=new THREE.Group(),door=new THREE.Mesh(new THREE.BoxGeometry(.1,2,1));door.name='Plane_1';door.position.set(1,1,3);room.add(door);
const session=system.createSession(room);session.start(0);
assert.equal(context.sources.length,4);assert.deepEqual(context.sources.slice(1).map(s=>s.at),[5,5.22,5.44]);assert.deepEqual(context.sources[0].stops,[5]);
const sounds=room.getObjectByName('TemporaryOpeningAudio').children;
assert.deepEqual(sounds[1].position.toArray(),[1,1,3]);
console.log('PASS Snore stops at five seconds, three knocks use the actual door position');
context.currentTime=2;session.update(2);session.pause();assert.ok(sounds.every(s=>!s.isPlaying));
context.currentTime=20;session.resume(2);
assert.equal(context.sources.length,8);assert.deepEqual(context.sources.slice(5).map(s=>s.at),[23,23.22,23.44]);
console.log('PASS A long pause cancels future sounds, then resumes all unplayed knocks');
context.currentTime=23.1;session.update(5.1);session.pause();context.currentTime=40;session.resume(5.1);
assert.equal(context.sources.length,10);assert.ok(Math.abs(context.sources[8].at-40.12)<1e-9);assert.ok(Math.abs(context.sources[9].at-40.34)<1e-9);
console.log('PASS Pausing between knocks does not replay the first knock or the snore');
session.dispose();session.dispose();assert.ok(sounds.every(s=>!s.isPlaying));assert.equal(room.getObjectByName('TemporaryOpeningAudio'),undefined);
console.log('PASS Skip/cancel cleanup disconnects sources idempotently');

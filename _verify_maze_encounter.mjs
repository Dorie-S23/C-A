import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createMazeItems,mazeObjective} from './src/state/mazeItems.js';
import {createMazeEncounter} from './src/levels/mazeEncounter.js';
import {createJaxStageBoundary} from './src/rooms/jaxStageBoundary.js';
import {level3JaxFinalDialogue} from './src/data/dialogues.js';
import {createDialogueEngine} from './src/dialogue/dialogueEngine.js';
const collectBoth=items=>{items.collect('bowling-ball');items.collect('hot-chocolate-mug');};
test('required IDs, either order and duplicates drive the three objective stages',()=>{
 for(const order of [['bowling-ball','hot-chocolate-mug'],['hot-chocolate-mug','bowling-ball']]){
  const items=createMazeItems();assert.equal(mazeObjective(items).count,0);assert.equal(items.collect('unrelated'),false);
  assert.equal(items.completeJax(),false);items.collect(order[0]);items.collect(order[0]);assert.equal(items.totalFound(),1);assert.equal(items.hasAllRequired(),false);
  items.collect(order[1]);assert.equal(items.hasAllRequired(),true);assert.equal(mazeObjective(items).title,'Find Jax');assert.equal(items.jaxComplete,false);
  assert.equal(items.completeJax(),true);assert.equal(items.completeJax(),false);assert.equal(mazeObjective(items).title,'Reach the exit');
 }
});
test('checkpoints restore zero, either single item, both and completed without stale state',()=>{
 for(const ids of [[],['bowling-ball'],['hot-chocolate-mug'],['bowling-ball','hot-chocolate-mug']])for(const complete of [false,true]){
  const source=createMazeItems();source.ensureSeed(123);ids.forEach(id=>source.collect(id));if(complete)source.completeJax();const saved=JSON.parse(JSON.stringify(source.snapshot()));
  const target=createMazeItems();collectBoth(target);target.completeJax();target.ensureSeed(187);target.restore(saved);
  assert.deepEqual(target.snapshot(),source.snapshot());assert.equal(target.ensureSeed(42),123);
  target.restore();assert.equal(target.totalFound(),0);assert.equal(target.seed,null);assert.equal(target.jaxComplete,false);
 }
 const items=createMazeItems();items.restore({collected:['bowling-ball','other','other'],seed:-1,jaxComplete:true});assert.equal(items.totalFound(),1);assert.equal(items.seed,null);assert.equal(items.jaxComplete,false);
 items.reset();assert.equal(items.totalFound(),0);assert.equal(items.seed,null);
});
test('automatic encounter requires explicit objects, clear sight and eligible gameplay; only genuine finish unlocks exit',()=>{
 const items=createMazeItems();let callbacks,starts=0;
 const encounter=createMazeEncounter({items,playDialogue:handlers=>{callbacks=handlers;starts++;return true;}});
 const approach={inRange:true,visible:true,eligible:true};
 assert.equal(encounter.update(approach),false);items.collect('bowling-ball');assert.equal(encounter.update(approach),false);items.collect('hot-chocolate-mug');
 for(const gate of ['inRange','visible','eligible'])assert.equal(encounter.update({...approach,[gate]:false}),false);
 assert.equal(encounter.update(approach),true);assert.equal(items.jaxComplete,false);assert.equal(encounter.update(approach),false);assert.equal(starts,1);
 callbacks.onNode({id:'jaxFinal3'});callbacks.onCancel();assert.equal(items.jaxComplete,false);assert.equal(encounter.update(approach),false);
 encounter.update({...approach,inRange:false});assert.equal(encounter.update(approach),true);assert.equal(callbacks.startAt,'jaxFinal3');
 callbacks.onComplete();callbacks.onComplete();assert.equal(items.jaxComplete,true);assert.equal(encounter.update(approach),false);
});
test('interruption/disposal invalidates stale dialogue completion and preserves collected items',()=>{
 const items=createMazeItems();collectBoth(items);let callbacks;
 const encounter=createMazeEncounter({items,playDialogue:handlers=>{callbacks=handlers;return true;}});
 encounter.update({inRange:true,visible:true,eligible:true});encounter.dispose();callbacks.onComplete();assert.equal(items.jaxComplete,false);assert.equal(items.totalFound(),2);
});
test('barrier visibility and exact matching collision boxes unlock together without changing wall boxes',()=>{
 const items=createMazeItems(),wall=new THREE.Box3(new THREE.Vector3(-10,0,-10),new THREE.Vector3(-9,3,-9)),colliders=[wall];
 const gate=createJaxStageBoundary({position:new THREE.Vector3(),colliders,isUnlocked:()=>items.hasAllRequired()});
 assert.equal(colliders.length,5);assert.equal(gate.locked,true);assert.equal(gate.group.visible,true);
 gate.group.updateMatrixWorld(true);gate.group.children.slice(0,4).forEach((mesh,i)=>assert.ok(new THREE.Box3().setFromObject(mesh).equals(gate.colliders[i])));
 items.collect('bowling-ball');gate.sync();assert.equal(gate.locked,true);items.collect('hot-chocolate-mug');gate.sync();assert.equal(gate.group.visible,false);assert.deepEqual(colliders,[wall]);gate.sync();assert.deepEqual(colliders,[wall]);
});
test('provisional final dialogue is separate, linear and ends only after its sixth line',()=>{
 const engine=createDialogueEngine(level3JaxFinalDialogue);let count=0;
 while(!engine.done){count++;engine.advance();if(count>8)throw Error('dialogue does not terminate');}
 assert.equal(count,6);
});

test('boundary line resources are released once by normal mesh teardown',()=>{
 const gate=createJaxStageBoundary({position:new THREE.Vector3(),colliders:[],isUnlocked:()=>false});
 const outline=gate.group.children.find(o=>o.isLineSegments);let geometry=0,material=0;
 outline.geometry.addEventListener('dispose',()=>geometry++);outline.material.addEventListener('dispose',()=>material++);
 gate.group.children[0].dispose();gate.group.children[0].dispose();assert.equal(geometry,1);assert.equal(material,1);
});

test('boundary sweeps prevent high-speed tunnelling, permit sliding and leave unlocked motion unchanged',()=>{
 let open=false;const boundary=createJaxStageBoundary({position:new THREE.Vector3(),colliders:[],isUnlocked:()=>open});
 for(const [from,to]of [[[-3,0],[3,0]],[[3,0],[-3,0]],[[0,-3],[0,3]],[[0,3],[0,-3]]]){
  const start={x:from[0],z:from[1]},end={x:to[0],z:to[1]};boundary.constrainMotion(start,end);assert.ok(Math.max(Math.abs(end.x),Math.abs(end.z))>1.19);
 }
 const tangent={x:2,z:2};boundary.constrainMotion({x:2,z:-2},tangent);assert.deepEqual(tangent,{x:2,z:2});
 const inside={x:0,z:0};boundary.constrainMotion({x:0,z:0},inside);assert.ok(Math.max(Math.abs(inside.x),Math.abs(inside.z))>1.19,'never trap a restored/teleported player');
 open=true;boundary.sync();const end={x:3,z:0};boundary.constrainMotion({x:-3,z:0},end);assert.deepEqual(end,{x:3,z:0});
});

import assert from 'node:assert/strict';
import {test} from 'node:test';
import * as THREE from 'three';
import {createMazeItems,mazeObjective} from '../src/state/mazeItems.js';
import {createMazeEncounter} from '../src/levels/mazeEncounter.js';
import {createJaxStageBoundary} from '../src/rooms/jaxStageBoundary.js';
import {level3JaxFinalDialogue} from '../src/data/dialogues.js';
import {createDialogueEngine} from '../src/dialogue/dialogueEngine.js';
const collectBoth=items=>{items.collect('bowling-ball');items.collect('hot-chocolate-mug');};
test('keepsakes are optional points, in either order; on screen it says Find Jax, then Follow Jax once he runs',()=>{
 for(const order of [['bowling-ball','hot-chocolate-mug'],['hot-chocolate-mug','bowling-ball']]){
  const items=createMazeItems();assert.deepEqual(mazeObjective(items),{title:'Find Jax',complete:false});assert.equal(mazeObjective(items,{jaxFled:true}).title,'Follow Jax');assert.equal(items.collect('unrelated'),false);
  assert.equal(items.score,0);items.collect(order[0]);items.collect(order[0]);assert.equal(items.totalFound(),1);assert.equal(items.score,1,'one point each, whichever');
  assert.equal(mazeObjective(items).title,'Find Jax','the keepsakes never change it');items.collect(order[1]);assert.equal(items.score,2);
  items.setChoicePoints(3);assert.equal(items.score,5,'with the conversation’s choices');
  assert.equal(items.completeJax('stays'),true);assert.equal(items.completeJax('abstracts'),false);assert.equal(items.jaxOutcome,'stays');assert.equal(mazeObjective(items).complete,true);
 }
 const none=createMazeItems();assert.equal(none.completeJax('abstracts'),true,'he can be talked to with no keepsakes');assert.equal(none.jaxOutcome,'abstracts');
});
test('checkpoints restore zero, either single item, both, choice points and outcome without stale state',()=>{
 for(const ids of [[],['bowling-ball'],['hot-chocolate-mug'],['bowling-ball','hot-chocolate-mug']])for(const complete of [false,true]){
  const source=createMazeItems();source.ensureSeed(123);ids.forEach(id=>source.collect(id));source.setChoicePoints(ids.length);if(complete)source.completeJax(ids.length?'stays':'abstracts');
  const saved=JSON.parse(JSON.stringify(source.snapshot()));
  const target=createMazeItems();collectBoth(target);target.setChoicePoints(9);target.completeJax('stays');target.ensureSeed(187);target.restore(saved);
  assert.deepEqual(target.snapshot(),source.snapshot());assert.equal(target.score,source.score);assert.equal(target.ensureSeed(42),123);
  target.restore();assert.equal(target.totalFound(),0);assert.equal(target.seed,null);assert.equal(target.jaxComplete,false);assert.equal(target.score,0);assert.equal(target.jaxOutcome,null);
 }
 const items=createMazeItems();items.restore({collected:['bowling-ball','other','other'],seed:-1,jaxOutcome:'stays',choicePoints:-4});
 assert.equal(items.totalFound(),1);assert.equal(items.seed,null);assert.equal(items.jaxOutcome,null,'no outcome without a finished talk');assert.equal(items.choicePoints,0);
 items.reset();assert.equal(items.totalFound(),0);assert.equal(items.seed,null);
});
test('E-press encounter needs a request, clear sight and eligible gameplay (not the keepsakes); finishing records the outcome',()=>{
 const items=createMazeItems();let callbacks,starts=0,released=[],outcome='abstracts';
 const encounter=createMazeEncounter({items,playDialogue:handlers=>{callbacks=handlers;starts++;return true;},outcome:()=>outcome,onRelease:()=>released.push(items.jaxComplete)});
 const press={inRange:true,visible:true,eligible:true,requested:true};
 for(const gate of ['inRange','visible','eligible','requested'])assert.equal(encounter.update({...press,[gate]:false}),false);
 assert.equal(encounter.update({inRange:true,visible:true,eligible:true}),false,'Never starts on its own');
 assert.equal(encounter.update(press),true,'No keepsakes needed');assert.equal(items.jaxComplete,false);assert.equal(encounter.update(press),false);assert.equal(starts,1);
 callbacks.onNode({id:'jaxR3'});callbacks.onCancel();assert.equal(items.jaxComplete,false);
 assert.equal(encounter.update(press),true,'Pressing E again resumes, without walking away first');assert.equal(callbacks.startAt,'jaxR3');
 outcome='stays';callbacks.onComplete();callbacks.onComplete();assert.equal(items.jaxComplete,true);assert.equal(items.jaxOutcome,'stays');assert.equal(encounter.update(press),false);
 assert.deepEqual(released,[false,true],'Released knowing whether the talk was finished');
});
test('interruption/disposal invalidates stale dialogue completion and preserves collected items',()=>{
 const items=createMazeItems();collectBoth(items);let callbacks;
 const encounter=createMazeEncounter({items,playDialogue:handlers=>{callbacks=handlers;return true;}});
 encounter.update({inRange:true,visible:true,eligible:true,requested:true});encounter.dispose();callbacks.onComplete();assert.equal(items.jaxComplete,false);assert.equal(items.totalFound(),2);
});
test('barrier visibility and exact matching collision boxes unlock together without changing wall boxes',()=>{
 const items=createMazeItems(),wall=new THREE.Box3(new THREE.Vector3(-10,0,-10),new THREE.Vector3(-9,3,-9)),colliders=[wall];
 const gate=createJaxStageBoundary({position:new THREE.Vector3(),colliders,isUnlocked:()=>items.hasAllRequired()});
 assert.equal(colliders.length,5);assert.equal(gate.locked,true);assert.equal(gate.group.visible,true);
 gate.group.updateMatrixWorld(true);gate.group.children.slice(0,4).forEach((mesh,i)=>assert.ok(new THREE.Box3().setFromObject(mesh).equals(gate.colliders[i])));
 items.collect('bowling-ball');gate.sync();assert.equal(gate.locked,true);items.collect('hot-chocolate-mug');gate.sync();assert.equal(gate.group.visible,false);assert.deepEqual(colliders,[wall]);gate.sync();assert.deepEqual(colliders,[wall]);
});
test('final dialogue: five scored rounds, one answer each that reaches him, then Ending A or B',()=>{
 const choices=level3JaxFinalDialogue.filter(n=>n.type==='choice');
 assert.equal(choices.length,5);
 for(const choice of choices)assert.equal(choice.options.filter(o=>o.points===1).length,1,choice.id);
 assert.equal(level3JaxFinalDialogue.filter(n=>n.fateCheck).length,4,'every round-5 reply leads on to an ending');
 for(const start of ['jaxWonOver','jaxAbstracts']){
  const engine=createDialogueEngine(level3JaxFinalDialogue,{startAt:start});let count=0;
  while(!engine.done){count++;engine.advance();if(count>20)throw Error(`${start} does not terminate`);}
  assert.ok(count>=5,start);
 }
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

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createMazeHintProgress,MAZE_HINT_OBJECTS,MAZE_HINT_LIMIT} from '../src/state/mazeHints.js';
import {mazeHintMapData} from '../src/ui/mazeHintMap.js';
import {generateMaze} from '../src/maze/generateMaze.js';
import {shapeMazeEnvironment} from '../src/maze/mazeEnvironmentLayout.js';
import {createSeededRandom} from '../src/maze/seededRandom.js';
import {createMazeItems} from '../src/state/mazeItems.js';
import {createSaveSlots} from '../src/game/saveGame.js';
const mug='hot-chocolate-mug',ball='bowling-ball';
const fixture=()=>{const items=createMazeItems(),hints=createMazeHintProgress({hasCollected:id=>items.hasCollected(id)});return {items,hints};};
const roomFor=seed=>{const maze=generateMaze(13,13,createSeededRandom(seed),0);return {maze,environmentLayout:shapeMazeEnvironment(maze)};};
const segment=points=>{const [[x,y],[a,b]]=[points.slice(0,2),points.slice(2)].sort(([x,y],[a,b])=>x-a||y-b);return [x,y,a,b].join(',');};

test('all six hints are maps immediately, even before any object is found',()=>{
 const {hints}=fixture();assert.equal(MAZE_HINT_LIMIT,6);assert.equal(hints.remaining,6);
 for(let n=1;n<=6;n++){assert.equal(hints.next.number,n);assert.equal(hints.reveal().kind,'objects');assert.equal(hints.used,n);assert.equal(hints.remaining,6-n);}
 assert.equal(hints.next,null);assert.equal(hints.reveal(),null);
});

for(const found of [mug,ball])test('one collected object keeps all remaining reveals targeted at missing objects: '+found,()=>{
 const {items,hints}=fixture();items.collect(found);assert.equal(hints.remaining,6);assert.equal(hints.next.kind,'objects');
 assert.equal(hints.reveal().number,1);assert.equal(hints.remaining,5);
});

test('collection switches the remaining shared budget to Jax without skipping hint numbers',()=>{
 const {items,hints}=fixture();hints.reveal();items.collect(ball);assert.equal(hints.next.kind,'objects');hints.reveal();
 items.collect(mug);assert.equal(hints.next.kind,'jax');assert.equal(hints.next.number,3);assert.equal(hints.remaining,4);
 for(let n=3;n<=6;n++){const hint=hints.reveal();assert.equal(hint.number,n);assert.equal(hint.kind,'jax');}assert.equal(hints.reveal(),null);
});

test('both objects found before any hints leaves six Jax maps available',()=>{
 const {items,hints}=fixture();items.collect(mug);items.collect(ball);
 assert.equal(hints.remaining,6);for(let n=1;n<=6;n++){const hint=hints.reveal();assert.equal(hint.kind,'jax');assert.equal(hint.number,n);}
 assert.equal(hints.next,null);
});

test('requests are free; saves preserve the shared budget; New Game resets it',()=>{
 const {items,hints}=fixture();const inventory=items.snapshot();for(let i=0;i<8;i++)assert.equal(hints.next.number,1);assert.equal(hints.used,0);
 hints.reveal();hints.reveal();hints.reveal();const saved=hints.snapshot(),restored=createMazeHintProgress({hasCollected:id=>items.hasCollected(id)});
 const records=new Map(),slots=createSaveSlots({setItem:(k,v)=>records.set(k,v),getItem:k=>records.get(k)});slots.write(1,{room:'maze',mazeHints:saved});
 restored.restore(slots.read(1).mazeHints);assert.deepEqual(restored.snapshot(),saved);assert.equal(restored.next.number,4);assert.deepEqual(items.snapshot(),inventory);
 restored.reset();assert.equal(restored.used,0);assert.equal(restored.remaining,6);assert.equal(restored.next.number,1);
});

test('old saves migrate spent hints; malformed counts cannot exceed the six-use budget',()=>{
 const hints=createMazeHintProgress();hints.restore({unlocked:3,selected:3,cooldown:30});assert.equal(hints.used,3);assert.equal(hints.next.number,4);
 hints.restore({version:2,stationHints:[mug,mug,ball,'bogus'],objectMaps:999,jaxMaps:999});assert.equal(hints.used,6);assert.equal(hints.next,null);
 hints.restore({version:2,stationHints:[mug],objectMaps:1,jaxMaps:0});assert.equal(hints.used,2);assert.equal(hints.next.kind,'objects');
 hints.restore({version:3,used:999});assert.equal(hints.used,6);
 for(const invalid of [undefined,null,{}, {version:3,used:-1},{version:3,used:'2'}]){hints.restore(invalid);assert.equal(hints.used,0);assert.equal(hints.next.number,1);}
});

for(const seed of [123,187])test('seed '+seed+': map reflects all final walls, only missing objects, live player position and goal-specific targets',()=>{
 const room=roomFor(seed),before=JSON.stringify(room),player={x:-27,z:-22.5};
 const data=mazeHintMapData(room,{missingItems:[mug,ball],playerPosition:player,playerFacing:Math.PI/2});
 const walls=new Set(data.walls.map(segment));assert.equal(walls.size,data.walls.length);
 for(const row of room.maze.cells)for(const {r,c,walls:sides} of row){
  const edges={top:[c,r,c+1,r],right:[c+1,r,c+1,r+1],bottom:[c,r+1,c+1,r+1],left:[c,r,c,r+1]};
  for(const [side,edge]of Object.entries(edges))assert.equal(walls.has(segment(edge)),sides[side]);
 }
 const p=data.markers.find(m=>m.marker==='P');assert.ok(Math.abs(p.x-.5)<1e-9);assert.ok(Math.abs(p.y-1.5)<1e-9);assert.equal(p.facing,Math.PI/2);
 for(const item of MAZE_HINT_OBJECTS){const marker=data.markers.find(m=>m.itemId===item.id),cell=room.environmentLayout.alcoves[item.alcove];assert.equal(marker.r,cell.r);assert.equal(marker.c,cell.c);}
 assert.ok(!data.markers.some(m=>m.marker==='J'));
 const missing=mazeHintMapData(room,{missingItems:[ball],playerPosition:{x:-18,z:-9}});assert.deepEqual(missing.markers.filter(m=>m.itemId).map(m=>m.itemId),[ball]);
 assert.notDeepEqual(missing.markers.find(m=>m.marker==='P'),p,'each new map samples the new player position');
 const jax=mazeHintMapData(room,{mode:'jax',playerPosition:player});assert.deepEqual(jax.markers.map(m=>m.marker),['E','J','P']);
 const j=jax.markers.find(m=>m.marker==='J');assert.equal(j.r,room.maze.jax.r);assert.equal(j.c,room.maze.jax.c);
 assert.ok(!/exit|enemy|hazard|solution/.test(JSON.stringify(jax)));assert.equal(JSON.stringify(room),before,'map never edits maze geometry');
});

test('player projection uses actual room bounds and stays inside the map',()=>{
 const room=roomFor(123);room.bounds={min:{x:10,z:20},max:{x:140,z:150}};
 const p=mazeHintMapData(room,{playerPosition:{x:75,z:85}}).markers.find(m=>m.marker==='P');assert.equal(p.x,6.5);assert.equal(p.y,6.5);
 const edge=mazeHintMapData(room,{playerPosition:{x:1000,z:-1000}}).markers.find(m=>m.marker==='P');assert.ok(edge.x<=13&&edge.y>=0);
 const near=mazeHintMapData(room,{playerPosition:{x:10.5,z:20.5}}).markers.find(m=>m.marker==='P');assert.equal(near.x,.05);assert.equal(near.y,.05);
});

test('object markers use actual placed pickup anchors, including offsets from the themed station centre',()=>{
 const room=roomFor(123),elements=Array(16).fill(0);elements[12]=-18;elements[14]=-9;
 room.interactables=[{prompt:()=> 'Pick up bowling ball',anchor:{updateWorldMatrix(){},matrixWorld:{elements}}}];
 const marker=mazeHintMapData(room,{missingItems:[ball]}).markers.find(m=>m.itemId===ball);
 assert.equal(marker.x,2.5);assert.equal(marker.y,4.5);
});

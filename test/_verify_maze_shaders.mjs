import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createMazeLoopMarkings } from '../src/rooms/mazeLoopMarkings.js';
import { ownMazeShadowPass } from '../src/rooms/mazeShadowDepth.js';
import { createMazeShaderEffects } from '../src/rooms/mazeShaders.js';

function fixture() {
  const backdrop = new THREE.Group(); backdrop.position.set(8,0,12); backdrop.rotation.y = Math.PI/2;
  const effects = createMazeShaderEffects({
    patrolCells:[{r:0,c:0},{r:0,c:1},{r:1,c:1}],
    cellCenter:(r,c)=>new THREE.Vector3(c*4.5,0,r*4.5),cellSize:4.5,
    jaxPosition:new THREE.Vector3(8,0,10),backdrop,
  });
  return effects;
}

test('shader effects share delta time, freeze on zero delta and smoothly respond to player proximity',()=>{
  const effect=fixture();
  assert.ok(effect.materials.patrol.isShaderMaterial && effect.materials.cracks.isShaderMaterial);
  effect.update(1,new THREE.Vector3(100,1.7,100));
  assert.equal(effect.materials.patrol.uniforms.uTime.value,1);
  assert.equal(effect.materials.cracks.uniforms.uTime.value,1);
  assert.equal(effect.state.near,0);
  effect.update(0,new THREE.Vector3(8,1.7,10));
  assert.equal(effect.state.near,0); assert.equal(effect.state.time,1);
  effect.update(0.5,new THREE.Vector3(8,1.7,10));
  assert.ok(effect.state.near>0.5 && effect.state.near<1);
  assert.equal(effect.materials.cracks.uniforms.uNear.value,effect.state.near);
  const near=effect.state.near;
  effect.update(0.5,new THREE.Vector3(100,1.7,100));
  assert.ok(effect.state.near<near);
  const state={...effect.state};
  for(const dt of [NaN,Infinity,-1,0]) effect.update(dt,new THREE.Vector3());
  assert.deepEqual(effect.state,state);
  effect.dispose();
});

test('overlays stay on separate small decorative surfaces without colliders, textures or extra lights',()=>{
  const effect=fixture();
  assert.equal(effect.group.children.length,2);
  const strips=effect.group.getObjectByName('PatrolWarningStrips');
  strips.geometry.computeBoundingBox();
  assert.ok(Math.abs(strips.geometry.boundingBox.min.y-0.022)<0.000001);
  assert.ok(Math.abs(strips.geometry.boundingBox.max.y-0.022)<0.000001);
  let triangles=0;
  effect.group.traverse(object=>{
    assert.ok(!object.isLight);
    if(!object.isMesh) return;
    assert.equal(object.castShadow,false); assert.equal(object.material.depthWrite,false);
    assert.equal(object.material.transparent,true);
    triangles+=object.geometry.index.count/3;
    Object.values(object.material.uniforms).forEach(uniform=>assert.ok(!uniform.value?.isTexture));
  });
  assert.ok(triangles<3200);
  assert.equal(effect.state.stripWidth,0.42);
  assert.ok(effect.state.maxDisplacement<=0.012);
  effect.dispose();
});

test('normal room-style disposal frees both geometries and shader materials; re-entry gets fresh state',()=>{
  const first=fixture(), second=fixture();
  first.update(2,new THREE.Vector3(8,0,10));
  first.group.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.dispose();mesh.material.dispose();}});
  assert.equal(first.state.disposed,true);assert.equal(first.state.released,4);
  first.dispose(); assert.equal(first.state.released,4);
  first.update(1,new THREE.Vector3()); assert.equal(first.state.time,2);
  assert.equal(second.state.time,0);assert.equal(second.state.disposed,false);
  assert.notEqual(first.materials.cracks,second.materials.cracks);
  assert.notEqual(first.materials.cracks.uniforms,second.materials.cracks.uniforms);
  second.dispose();
});


test('maze shadow-pass ownership preserves visible materials and disposes once through normal mesh teardown',()=>{
  const actor=new THREE.Group();
  const visible=new THREE.MeshStandardMaterial({color:0x7755aa});
  const first=new THREE.Mesh(new THREE.BoxGeometry(),visible);
  const second=new THREE.Mesh(first.geometry,visible);actor.add(first,second);
  let previousCalled=0;first.dispose=()=>previousCalled++;
  const shadow=ownMazeShadowPass(actor);
  let disposed=0;shadow.addEventListener('dispose',()=>disposed++);
  assert.equal(first.material,visible);assert.equal(second.material,visible);
  assert.equal(first.customDepthMaterial,shadow);assert.equal(second.customDepthMaterial,shadow);
  first.dispose();second.dispose();
  assert.equal(disposed,1);assert.equal(previousCalled,1);
  visible.dispose();first.geometry.dispose();
});


test('future loop rosettes are sparse, neutral, floor-flat and aligned to open edges',()=>{
  const loop=[[0,0],[0,1],[0,2],[1,2],[2,2],[2,1],[2,0],[1,0]].map(([r,c])=>({r,c}));
  const marking=createMazeLoopMarkings({loops:[loop,loop.map(c=>({r:c.r+4,c:c.c})),loop.map(c=>({r:c.r+8,c:c.c}))],cellCenter:(r,c)=>new THREE.Vector3(c*4.5,0,r*4.5),cellSize:4.5});
  assert.equal(marking.userData.loopCount,3);assert.equal(marking.userData.animated,false);assert.equal(marking.userData.danger,false);
  assert.ok(marking.material.isMeshBasicMaterial);assert.ok(!marking.material.isShaderMaterial);
  assert.ok(marking.material.opacity<=0.5);assert.equal(marking.castShadow,false);
  assert.equal(marking.userData.style,'scalloped circus rosettes');
  assert.equal(marking.userData.placements.length,24);
  for(const placement of marking.userData.placements){
    const a=placement.from,b=placement.to,p=placement.position;
    assert.equal(Math.abs(a.r-b.r)+Math.abs(a.c-b.c),1);
    if(a.r===b.r){assert.ok(Math.abs(p[0]-(a.c+b.c)*4.5/2)<1e-6);assert.ok(Math.abs(p[2]-a.r*4.5)+placement.radius<2.25);}
    else{assert.ok(Math.abs(p[2]-(a.r+b.r)*4.5/2)<1e-6);assert.ok(Math.abs(p[0]-a.c*4.5)+placement.radius<2.25);}
  }
  marking.geometry.computeBoundingBox();
  assert.ok(Math.abs(marking.geometry.boundingBox.min.y-0.018)<0.000001);
  assert.ok(Math.abs(marking.geometry.boundingBox.max.y-0.018)<0.000001);
  assert.ok(marking.geometry.index.count/3<=1800);
  marking.geometry.dispose();marking.material.dispose();
});


test('active-route eye-level repeaters reuse the warning shader while floor bands remain floor-flat',()=>{
  const backdrop=new THREE.Group();
  const cells=[{r:0,c:0,walls:{left:true}},{r:0,c:1,walls:{top:true}},{r:1,c:1,walls:{right:true}}];
  const effect=createMazeShaderEffects({patrolCells:cells,cellCenter:(r,c)=>new THREE.Vector3(c*4.5,0,r*4.5),cellSize:4.5,jaxPosition:new THREE.Vector3(8,0,10),backdrop});
  const mesh=effect.group.getObjectByName('PatrolWarningStrips'),position=mesh.geometry.attributes.position;
  assert.ok(position.count>mesh.userData.floorVertexCount);
  for(let i=0;i<mesh.userData.floorVertexCount;i++)assert.ok(Math.abs(position.getY(i)-0.022)<0.000001);
  for(let i=mesh.userData.floorVertexCount;i<position.count;i++)assert.ok(position.getY(i)>1&&position.getY(i)<2.7);
  assert.equal(effect.group.children.length,2);assert.equal(mesh.material,effect.materials.patrol);
  effect.update(0.5,new THREE.Vector3());assert.equal(mesh.material.uniforms.uTime.value,0.5);effect.dispose();
});

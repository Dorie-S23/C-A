import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { generateMaze } from '../src/maze/generateMaze.js';
import { createSeededRandom } from '../src/maze/seededRandom.js';
import { shapeMazeEnvironment } from '../src/maze/mazeEnvironmentLayout.js';
import { createMazeOverhead } from '../src/rooms/mazeOverhead.js';

test('circus overheads preserve seeded graphs and keep all in-bounds vertices clear of the camera envelope',()=>{
  for(const seed of [0,42,123,12345,0xffffffff]){
    const maze=generateMaze(13,13,createSeededRandom(seed),0),layout=shapeMazeEnvironment(maze),before=JSON.stringify(maze);
    const overhead=createMazeOverhead({maze,layout,cellCenter:(r,c)=>new THREE.Vector3(-27+c*4.5,0,-27+r*4.5)});
    assert.equal(JSON.stringify(maze),before);
    let triangles=0,meshes=0,lights=0;
    overhead.traverse(object=>{
      if(object.isLight)lights++;
      if(!object.isMesh)return;
      meshes++;const position=object.geometry.attributes.position;
      triangles+=(object.geometry.index?.count??position.count)/3;
      for(let i=0;i<position.count;i++){
        const x=position.getX(i),y=position.getY(i),z=position.getZ(i);
        if(Math.abs(x)<=29.25&&Math.abs(z)<=29.25)assert.ok(y>=4.59,`seed ${seed}: low overhead at ${x},${y},${z}`);
      }
    });
    assert.equal(lights,0);assert.ok(meshes<=18,`overhead batches ${meshes}`);assert.ok(triangles<40000);
    assert.ok(overhead.userData.overheadStats.eaveHeight>=8);
    const geometries=new Set(),materials=new Set();overhead.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
});

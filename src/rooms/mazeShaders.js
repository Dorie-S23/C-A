import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createPatrolWarningMaterial } from '../shaders/patrolWarning.js';
import { createJaxDigitalCracksMaterial } from '../shaders/jaxDigitalCracks.js';

/** Two small transparent overlay batches, entirely independent of collision,
 * lighting and seeded placements. Standard room teardown disposes both mesh
 * geometries/materials; dispose() also supports isolated review/testing.
 */
export function createMazeShaderEffects({ patrolCells, cellCenter, cellSize, jaxPosition, backdrop }) {
  const group = new THREE.Group(); group.name = 'MazeShaderEffects';
  const stripParts = [];
  for (let i = 0; i < patrolCells.length - 1; i++) {
    const a = cellCenter(patrolCells[i].r, patrolCells[i].c);
    const b = cellCenter(patrolCells[i+1].r, patrolCells[i+1].c);
    const direction = b.clone().sub(a).normalize();
    const perpendicular = new THREE.Vector3(-direction.z,0,direction.x);
    for (const side of [-1,1]) {
      const centre = a.clone().add(b).multiplyScalar(0.5).addScaledVector(perpendicular,side*1.42).setY(0.022);
      const plane = new THREE.PlaneGeometry(0.42, cellSize - 0.38);
      plane.rotateX(-Math.PI/2);
      plane.rotateY(Math.atan2(-direction.x,-direction.z));
      plane.translate(centre.x,centre.y,centre.z); stripParts.push(plane);
    }
  }
  const floorVertexCount=stripParts.reduce((sum,part)=>sum+part.attributes.position.count,0);
  // Same custom shader, repeated in narrow wall inlays so a normal follow
  // camera can read the warning before its floor bands fill the foreground.
  const directions=[['top',0,1],['right',-1,0],['bottom',0,-1],['left',1,0]];
  for (const cell of [patrolCells[0],patrolCells.at(-1)]) {
    const side=directions.find(([wall])=>cell.walls?.[wall]);if(!side)continue;
    const centre=cellCenter(cell.r,cell.c),normal=new THREE.Vector3(side[1],0,side[2]);
    const plane=new THREE.PlaneGeometry(0.24,1.45);
    plane.rotateY(Math.atan2(normal.x,normal.z));
    plane.translate(centre.x-normal.x*(cellSize/2-0.25),1.9,centre.z-normal.z*(cellSize/2-0.25));
    stripParts.push(plane);
  }
  const patrolMaterial = createPatrolWarningMaterial(cellSize - 0.38);
  const patrolGeometry = mergeGeometries(stripParts);
  stripParts.forEach(part=>part.dispose());
  const patrol = new THREE.Mesh(patrolGeometry,patrolMaterial);
  patrol.name = 'PatrolWarningStrips'; patrol.userData.floorVertexCount=floorVertexCount; patrol.renderOrder = 2; group.add(patrol);

  const crackParts = [];
  backdrop.updateMatrixWorld(true);
  const surfaces = [
    {x:-1.08,y:1.82,width:0.94,height:1.65}, {x:1.08,y:1.82,width:0.94,height:1.65},
    {x:-1.56,y:1.58,width:0.22,height:2.36}, {x:1.56,y:1.58,width:0.22,height:2.36},
  ];
  surfaces.forEach(surface=>{
    const plane = new THREE.PlaneGeometry(surface.width,surface.height,16,24);
    plane.translate(surface.x,surface.y,0.278);
    plane.applyMatrix4(backdrop.matrixWorld); crackParts.push(plane);
  });
  const cracksMaterial = createJaxDigitalCracksMaterial();
  const cracksGeometry = mergeGeometries(crackParts);
  crackParts.forEach(part=>part.dispose());
  cracksGeometry.computeBoundingSphere(); cracksGeometry.boundingSphere.radius += 0.025;
  const cracks = new THREE.Mesh(cracksGeometry,cracksMaterial);
  cracks.name = 'JaxDigitalCrackPanels'; cracks.renderOrder = 3; group.add(cracks);

  const resources = [patrolGeometry,cracksGeometry,patrolMaterial,cracksMaterial];
  const released = new Set();
  const state = { time:0, near:0, disposed:false, released:0, drawCalls:2, stripWidth:0.42, maxDisplacement:0.012 };
  resources.forEach(resource=>resource.addEventListener('dispose',()=>{
    released.add(resource); state.released = released.size; state.disposed = released.size === resources.length;
  }));
  group.userData.shaderState = state;
  return {
    group, materials: { patrol:patrolMaterial, cracks:cracksMaterial }, state,
    update(deltaSeconds,playerPosition) {
      if (released.size || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      state.time += deltaSeconds;
      if (Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.z)) {
        const distance = Math.hypot(playerPosition.x-jaxPosition.x,playerPosition.z-jaxPosition.z);
        const target = 1-THREE.MathUtils.smoothstep(distance,3,14);
        state.near = THREE.MathUtils.lerp(state.near,target,1-Math.exp(-deltaSeconds*2.2));
      }
      patrolMaterial.uniforms.uTime.value = cracksMaterial.uniforms.uTime.value = state.time;
      cracksMaterial.uniforms.uNear.value = state.near;
    },
    dispose() { resources.forEach(resource=>{ if(!released.has(resource)) resource.dispose(); }); },
  };
}

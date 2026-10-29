import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createJaxDigitalCracksMaterial } from '../shaders/jaxDigitalCracks.js';

/** One small transparent overlay batch, entirely independent of collision,
 * lighting and seeded placements. Standard room teardown disposes the mesh
 * geometry/material; dispose() also supports isolated review/testing.
 */
export function createMazeShaderEffects({ jaxPosition, backdrop }) {
  const group = new THREE.Group(); group.name = 'MazeShaderEffects';

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

  const resources = [cracksGeometry,cracksMaterial];
  const released = new Set();
  const state = { time:0, near:0, disposed:false, released:0, drawCalls:1 };
  resources.forEach(resource=>resource.addEventListener('dispose',()=>{
    released.add(resource); state.released = released.size; state.disposed = released.size === resources.length;
  }));
  group.userData.shaderState = state;
  return {
    group, materials: { cracks:cracksMaterial }, state,
    update(deltaSeconds,playerPosition) {
      if (released.size || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
      state.time += deltaSeconds;
      if (Number.isFinite(playerPosition?.x) && Number.isFinite(playerPosition?.z)) {
        const distance = Math.hypot(playerPosition.x-jaxPosition.x,playerPosition.z-jaxPosition.z);
        const target = 1-THREE.MathUtils.smoothstep(distance,3,14);
        state.near = THREE.MathUtils.lerp(state.near,target,1-Math.exp(-deltaSeconds*2.2));
      }
      cracksMaterial.uniforms.uTime.value = state.time;
      cracksMaterial.uniforms.uNear.value = state.near;
    },
    dispose() { resources.forEach(resource=>{ if(!released.has(resource)) resource.dispose(); }); },
  };
}

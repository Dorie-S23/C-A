import * as THREE from 'three';
import { createDoorwayAperture } from './doorwayAperture.js';

/** Blocking from the real closed panel, never the slab group's origin. */
export function createRagathaBlocking(room, inward, side) {
  const panel = room.group.getObjectByName('Plane_1');
  const box = new THREE.Box3().setFromObject(panel);
  const center = box.getCenter(new THREE.Vector3());
  const floor = room.spawn.y;
  const at = (depth, offset = 0) => center.clone().addScaledVector(inward, depth)
    .addScaledVector(side, offset).setY(floor);
  const start = at(-1.2), threshold = at(.95, -.25), talk = at(2.55, -.6);
  const aperture = createDoorwayAperture(room, box);
  const backdrop = new THREE.Group(); backdrop.name = 'RagathaDoorVestibule';
  const width = box.getSize(new THREE.Vector3())[Math.abs(inward.z) > .5 ? 'x' : 'z'];
  const height = box.max.y - floor, depth = 2.3;
  const material = new THREE.MeshStandardMaterial({ color: 0x37233b, roughness: .9, side: THREE.DoubleSide });
  const add = (size, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.copy(position); mesh.receiveShadow = true; backdrop.add(mesh);
  };
  // A short closed passage beyond the real wall, not a second room or portal.
  // This model's measured door is on the Z wall; keep the assembly oriented
  // from its inward direction for consistency with the camera and route.
  add([width + .3, .06, depth], new THREE.Vector3(0, -.03, -depth / 2));
  add([width + .3, .06, depth], new THREE.Vector3(0, height + .03, -depth / 2));
  add([.08, height, depth], new THREE.Vector3(-width / 2 - .1, height / 2, -depth / 2));
  add([.08, height, depth], new THREE.Vector3(width / 2 + .1, height / 2, -depth / 2));
  add([width + .3, height, .06], new THREE.Vector3(0, height / 2, -depth));
  const light = new THREE.PointLight(0xffddba, 1.2, 4); light.position.set(0, height - .3, -1); backdrop.add(light);
  backdrop.position.copy(center).setY(floor);
  backdrop.rotation.y = Math.atan2(inward.x, inward.z);
  room.group.add(backdrop);
  backdrop.updateMatrixWorld(true);
  backdrop.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const box=new THREE.Box3().setFromObject(mesh);
    room.collisionMeshes.push({mesh,box,paddedBox:box.clone().expandByScalar(.35)});
  });
  backdrop.visible = false;
  return { start, threshold, talk, backdrop, aperture, measurements: {
    panelMin: box.min.toArray(), panelMax: box.max.toArray(), width, height,
    start: start.toArray(), threshold: threshold.toArray(), talk: talk.toArray(),
  } };
}

// Development-only visual review: actual room and production hinge, no game changes.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { loadPomniRoom } from '../src/rooms/pomniRoom.js';
import { createBedroomDoorHinge } from '../src/cinematics/bedroomDoor.js';
export async function createDoorReview() {
 const base=document.createElement('base');base.href='/';document.head.append(base);
 const room=await loadPomniRoom();
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a1a1d);
 const camera=new THREE.PerspectiveCamera(70,innerWidth/innerHeight,.1,500);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(1);
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 const environment=new THREE.PMREMGenerator(renderer);scene.environment=environment.fromScene(new RoomEnvironment(),.04).texture;environment.dispose();scene.environmentIntensity=.6;
 scene.add(new THREE.AmbientLight(0xffffff,.15));scene.add(room.group);room.lighting.attach(scene);
 const hinge=createBedroomDoorHinge({group:room.group,collisionMeshes:room.collisionMeshes,insidePoint:room.spawn});
 const center=new THREE.Box3().setFromObject(hinge.frame).getCenter(new THREE.Vector3());
 const inward=new THREE.Vector3().fromArray(hinge.measurements.inward),side=new THREE.Vector3().crossVectors(inward,new THREE.Vector3(0,1,0));
 // The existing entrance shot, kept unchanged for an apples-to-apples review.
 const target=center.clone().addScaledVector(inward,.35);target.y=1.45;
 camera.position.copy(center).addScaledVector(inward,2.5).addScaledVector(side,-1.15);camera.position.y=1.75;camera.lookAt(target);
 document.body.replaceChildren(renderer.domElement);document.body.style.cssText='margin:0;overflow:hidden;background:#1a1a1d';renderer.domElement.style.display='block';
 const label=document.createElement('div');label.style.cssText='position:fixed;bottom:18px;left:18px;padding:10px 14px;background:#171322ed;border:1px solid #ffd27a;border-radius:6px;color:#fff8e9;font:15px sans-serif';document.body.append(label);
 const frameMatrix=hinge.frame.matrixWorld.toArray();
 return {
  measurements:hinge.measurements,
  pose(fraction) {
   hinge.setOpenFraction(fraction);label.textContent=fraction===0?'Closed':fraction===1?'Fully open | inward 90 deg':'Halfway open | inward 45 deg';
   renderer.render(scene,camera);
   return {fraction,angle:hinge.pivot.rotation.y,hinge:hinge.pivot.getWorldPosition(new THREE.Vector3()).toArray(),handle:new THREE.Box3().setFromObject(hinge.handle).getCenter(new THREE.Vector3()).toArray(),slab:hinge.slab.matrixWorld.toArray(),frame:hinge.frame.matrixWorld.toArray(),originalFrame:frameMatrix,children:hinge.slab.children.map(o=>({name:o.name,parent:o.parent.name,matrix:o.matrix.toArray()}))};
  },
 };
}

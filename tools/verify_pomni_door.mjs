import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeBoundsTree } from 'three-mesh-bvh';
import { createBedroomDoorHinge } from '../src/cinematics/bedroomDoor.js';
globalThis.ProgressEvent ??= class {};
const bytes=fs.readFileSync('public/models/character rooms/pomnis-room-v3.glb'),length=bytes.readUInt32LE(12);
const data=JSON.parse(bytes.subarray(20,20+length));
data.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+length).toString('base64');
delete data.images;delete data.textures;data.materials=data.materials.map(m=>({name:m.name,doubleSided:m.doubleSided}));
const load=async()=>{const root=(await new GLTFLoader().parseAsync(JSON.stringify(data),'')).scene;root.updateMatrixWorld(true);return root;};
const root=await load(),slab=root.getObjectByName('Door_Slab024'),panel=root.getObjectByName('Plane_1'),handle=root.getObjectByName('Plane_2'),frame=root.getObjectByName('Door_Frame024');
const transforms={};for(const o of [slab,panel,handle,frame]){const box=new T.Box3().setFromObject(o);transforms[o.name]={position:o.getWorldPosition(new T.Vector3()).toArray(),quaternion:o.getWorldQuaternion(new T.Quaternion()).toArray(),scale:o.getWorldScale(new T.Vector3()).toArray(),min:box.min.toArray(),max:box.max.toArray()};}
const closed=slab.matrixWorld.clone(),frameMatrix=frame.matrixWorld.clone();
const moving=[];slab.traverse(o=>{if(o.isMesh)moving.push(o)});
const originalChildren=moving.map(o=>({mesh:o,local:o.matrix.clone()}));
const fixed=[];root.traverse(o=>{if(o.isMesh&&!moving.includes(o))fixed.push(o)});
const collisions=moving.map(mesh=>{const box=new T.Box3().setFromObject(mesh);return {mesh,box,paddedBox:box.clone().expandByScalar(.35)};});
const hinge=createBedroomDoorHinge({group:root,collisionMeshes:collisions,insidePoint:new T.Vector3(0,0,0)});
const h=new T.Vector3().fromArray(hinge.measurements.hinge),hp=new T.Vector3().fromArray(hinge.measurements.handle),pb=new T.Box3().setFromObject(panel);
assert.ok(hp.x<pb.getCenter(new T.Vector3()).x);assert.ok(Math.abs(h.x-pb.max.x)<1e-10);
assert.equal(hinge.measurements.openAngle,-Math.PI/2);assert.deepEqual(hinge.measurements.inward,[0,0,-1]);
assert.ok(h.distanceTo(new T.Vector3(2.053128242492676,1.1904298067092896,3.3230364322662354))>.08);
console.log('PASS Hinge is opposite actual low-X handle, derived from panel edge and raised trim, not group origin');
const compare=(a,b)=>a.elements.forEach((v,i)=>assert.ok(Math.abs(v-b.elements[i])<1e-8,`${i}: ${v} != ${b.elements[i]}`));
const expected=f=>new T.Matrix4().makeTranslation(h.x,h.y,h.z).multiply(new T.Matrix4().makeRotationY(-Math.PI/2*f)).multiply(new T.Matrix4().makeTranslation(-h.x,-h.y,-h.z)).multiply(closed);
for(let i=0;i<=90;i++){
 const f=i/90;hinge.setOpenFraction(f);compare(slab.matrixWorld,expected(f));compare(frame.matrixWorld,frameMatrix);
 assert.ok(hinge.pivot.getWorldPosition(new T.Vector3()).distanceTo(h)<1e-10);
 for(const {mesh,local} of originalChildren)compare(mesh.matrix,local);
 for(const e of collisions){assert.equal(e.dynamic,true);assert.ok(e.box.equals(new T.Box3().setFromObject(e.mesh)));const padded=e.box.clone().expandByScalar(.35);assert.ok(e.paddedBox.min.distanceTo(padded.min)<1e-9);assert.ok(e.paddedBox.max.distanceTo(padded.max)<1e-9);}
}
const open=slab.matrixWorld.clone();assert.ok(new T.Box3().setFromObject(handle).getCenter(new T.Vector3()).z<hp.z-1);
hinge.setOpenFraction(0);compare(slab.matrixWorld,closed);compare(frame.matrixWorld,frameMatrix);
console.log('PASS 91 closed-to-open transforms rotate rigidly inward; fixed hinge/frame, attached children, current padded child colliders');
for(const m of [...moving,...fixed])if(!m.geometry.boundsTree)computeBoundsTree.call(m.geometry);
function contacts(){const out=[];for(const m of moving){const mb=new T.Box3().setFromObject(m);for(const f of fixed){if(!mb.intersectsBox(new T.Box3().setFromObject(f)))continue;const segments=new T.Box3(),line=new T.Line3();let count=0;f.geometry.boundsTree.bvhcast(m.geometry.boundsTree,f.matrixWorld.clone().invert().multiply(m.matrixWorld),{intersectsTriangles(a,b){if(a.intersectsTriangle(b,line,true)){count++;segments.expandByPoint(line.start.clone().applyMatrix4(f.matrixWorld));segments.expandByPoint(line.end.clone().applyMatrix4(f.matrixWorld));}return false;}});if(count)out.push({moving:m.name,fixed:f.name,triangleContacts:count,min:segments.min.toArray(),max:segments.max.toArray()});}}return out;}
const angles=[...Array.from({length:46},(_,i)=>i*2),45].sort((a,b)=>a-b);
const samples=[];for(const degrees of angles){hinge.setOpenFraction(degrees/90);samples.push({degrees,contacts:contacts()});}
assert.ok(samples[0].contacts.length>0,'Record source closed-door contacts rather than hiding them');
const originalPartners=new Set(samples[0].contacts.map(c=>c.fixed));
for(const sample of samples)for(const c of sample.contacts)assert.ok(originalPartners.has(c.fixed),'New swing collision with '+c.fixed);
assert.equal(samples.at(-1).contacts.length,0);
console.log('PASS Fully-open door clears every other room mesh; entire sweep adds no contact with curtains, bed or other furniture');
console.log('LIMITATION Original closed-door jamb/header contacts persist during part of the swing; see exact triangle contact samples');
// Rotate the same real asset in memory: handle measurements must still decide the edge.
const rotated=await load();rotated.rotation.y=Math.PI/2;rotated.position.set(3,0,-2);rotated.updateMatrixWorld(true);
const rotatedInside=rotated.localToWorld(new T.Vector3());
const r=createBedroomDoorHinge({group:rotated,collisionMeshes:[],insidePoint:rotatedInside});
assert.equal(r.measurements.wideAxis,'z');
const rb=new T.Box3().setFromObject(r.panel),rc=rb.getCenter(new T.Vector3());
assert.ok((r.measurements.handle[2]-rc.z)*(r.measurements.hinge[2]-rc.z)<0);
console.log('PASS Rotated/translated real asset still hinges opposite the measured handle');
fs.mkdirSync('artifacts/pomni-door-hinge',{recursive:true});
fs.writeFileSync('artifacts/pomni-door-hinge/geometry-validation.json',JSON.stringify({pass:true,fullyOpenCollisionFree:samples.at(-1).contacts.length===0,collisionFreeSweep:samples.every(s=>s.contacts.length===0),measurements:hinge.measurements,sourceTransforms:transforms,closedWorldMatrix:closed.elements,openWorldMatrix:open.elements,samples,limitation:'Original source closed-door jamb/header contacts remain during part of the swing. Fully open is clear; no added collision partners.'},null,2));

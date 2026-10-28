import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** High theatrical envelope: the playable floor, wall boxes and camera remain
 * unchanged. No new fixture below 4.6m intrudes into a passage. Back-facing
 * canopy cloth reads from the game but stays open to the top-down review.
 */
export function createMazeOverhead({maze,layout,cellCenter}) {
  const root=new THREE.Group();root.name='MazeOverhead';
  const geo={box:new THREE.BoxGeometry(1,1,1),sphere:new THREE.IcosahedronGeometry(1,0),arch:new THREE.TorusGeometry(1,0.035,4,20,Math.PI)};
  const material=(color,emissiveIntensity=0.08)=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity,roughness:0.85});
  const silver=material(0xa9c4d6,0.07),magenta=material(0x9e397d,0.08);silver.metalness=0.25;silver.roughness=0.3;
  const gold=material(0xd4a75b,0.15),red=material(0x9d2b47),cream=material(0xf4ddb2),violet=material(0x584777);
  const bulb=new THREE.MeshBasicMaterial({color:0xffd99d});
  const cloth=[0xb75263,0xf0d4a3,0x65527f,0xf0d4a3].map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.30,roughness:0.95,side:THREE.BackSide}));
  const add=(g,m,p,s=[1,1,1],rz=0)=>{const mesh=new THREE.Mesh(g,m);mesh.position.fromArray(p);mesh.scale.fromArray(s);mesh.rotation.z=rz;root.add(mesh);return mesh;};
  // A tall, slotted big-top roof (8m eaves / 17m crown) fills the empty sky
  // without adding a low opaque ceiling or affecting the player's camera.
  for(let sector=0;sector<32;sector++){
    const vertices=[];
    const start=sector/32*Math.PI*2+0.006,end=(sector+1)/32*Math.PI*2-0.006;
    const point=(r,a)=>[Math.cos(a)*r,17-9*Math.pow(r/44,0.8),Math.sin(a)*r];
    for(let band=0;band<6;band++){
      const r1=band/6*44,r2=(band+1)/6*44;
      const a=point(r1,start),b=point(r2,start),c=point(r2,end),d=point(r1,end);
      // Outward/upward winding; only the cloth's inside is rendered.
      vertices.push(...a,...c,...b,...a,...d,...c);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();
    const panel=new THREE.Mesh(geometry,cloth[sector%4]);panel.name='BigTopCanopyPanel';root.add(panel);
    const points=Array.from({length:9},(_,i)=>new THREE.Vector3(...point(i/8*44,start-0.006)));
    const curve=new THREE.CatmullRomCurve3(points);
    add(new THREE.TubeGeometry(curve,20,0.035,5,false),gold,[0,0,0]);
  }
  const drumMaterial=new THREE.MeshStandardMaterial({color:0x514062,emissive:0x514062,emissiveIntensity:0.3,roughness:1,side:THREE.BackSide});
  const drum=add(new THREE.CylinderGeometry(44.2,44.2,5.2,64,1,true),drumMaterial,[0,5.4,0]);drum.name='DistantVelvetTentWall';
  // Real floor-plan openings determine where repeated structural ribs go.
  // Sparse two-cell rhythm avoids the look of unrelated floating ornaments.
  const ribAnchors=[];
  for(const row of maze.cells)for(const cell of row){
    if((cell.r+cell.c)%3!==0)continue;
    const openings=Object.values(cell.walls).filter(w=>!w).length;
    if(openings<2)continue;
    const alongZ=!cell.walls.top&&!cell.walls.bottom;
    const alongX=!cell.walls.left&&!cell.walls.right;
    if(!alongZ&&!alongX&&openings<3)continue;
    const p=cellCenter(cell.r,cell.c),yaw=alongZ?0:Math.PI/2;
    const frame=new THREE.Group();frame.position.copy(p);frame.rotation.y=yaw;root.add(frame);
    const rib=new THREE.Mesh(geo.arch,gold);rib.position.y=4.8;rib.scale.set(2.08,1.58,1);frame.add(rib);rib.castShadow=true;
    const inner=new THREE.Mesh(geo.arch,cell.r>6?violet:red);inner.position.set(0,4.8,0.04);inner.scale.set(1.96,1.46,1);frame.add(inner);
    for(const x of [-2.08,2.08]){
      const wx=p.x+Math.cos(yaw)*x,wz=p.z-Math.sin(yaw)*x,roofY=17-9*Math.pow(Math.hypot(wx,wz)/44,0.8);
      const hanger=new THREE.Mesh(geo.box,gold);hanger.position.set(x,(4.8+roofY)/2,0);hanger.scale.set(0.025,roofY-4.8,0.025);frame.add(hanger);
    }
    for(let i=0;i<7;i++){
      const a=i/6*Math.PI;
      const bead=new THREE.Mesh(geo.sphere,bulb);bead.position.set(Math.cos(a)*2.08,4.8+Math.sin(a)*1.58,0.08);bead.scale.setScalar(0.06);frame.add(bead);
    }
    // Broad cloth pennants form a readable band at the tops of the walls.
    for(let i=-2;i<=2;i++){
      const shape=new THREE.Shape();shape.moveTo(-0.25,0);shape.lineTo(0.25,0);shape.lineTo(0,-0.5);shape.closePath();
      geo.pennant??=new THREE.ShapeGeometry(shape);
      const flag=new THREE.Mesh(geo.pennant,i%2?cream:(cell.r>6?violet:red));flag.position.set(i*0.68,5.15+Math.abs(i)*0.09,0.06);flag.material.side=THREE.DoubleSide;frame.add(flag);
    }
    ribAnchors.push(p.toArray());
  }
  // One deliberate sculptural landmark per circuit, rather than floor clutter.
  layout.loops.forEach((loop,index)=>{
    const cell=loop.find(c=>Object.values(c.walls).filter(w=>!w).length>=3)??loop[0],p=cellCenter(cell.r,cell.c);
    const roofY=17-9*Math.pow(Math.hypot(p.x,p.z)/44,0.8);
    add(geo.box,gold,[p.x,(6.12+roofY)/2,p.z],[0.02,roofY-6.12,0.02]);
    if(index===0){
      add(new THREE.IcosahedronGeometry(0.38,1),gold,[p.x,5.5,p.z]);
      const ring=add(new THREE.TorusGeometry(0.57,0.025,5,24),gold,[p.x,5.5,p.z]);ring.rotation.y=Math.PI/4;
      for(let i=0;i<8;i++){const a=i/8*Math.PI*2;add(geo.sphere,bulb,[p.x+Math.cos(a)*0.65,5.5+Math.sin(a)*0.65,p.z],[0.055,0.055,0.055]);}
    }else if(index===1){
      add(new THREE.IcosahedronGeometry(0.42,1),silver,[p.x,5.5,p.z]);
      const ring=add(new THREE.TorusGeometry(0.63,0.025,5,24),gold,[p.x,5.5,p.z]);ring.rotation.x=0.5;ring.rotation.y=0.4;
    }else{
      add(new THREE.OctahedronGeometry(0.45),magenta,[p.x,5.5,p.z]);
      for(const x of [-0.45,0.45])add(geo.sphere,gold,[p.x+x,5.5,p.z],[0.08,0.08,0.08]);
    }
  });
  // Chamber-sized suspended crown rather than a wall-sized flat sign alone.
  const cx=layout.chamber.reduce((n,c)=>n+cellCenter(c.r,c.c).x,0)/layout.chamber.length;
  const cz=layout.chamber.reduce((n,c)=>n+cellCenter(c.r,c.c).z,0)/layout.chamber.length;
  const crown=add(new THREE.TorusGeometry(3.6,0.065,6,48),gold,[cx,6.3,cz]);crown.rotation.x=Math.PI/2;
  for(let i=0;i<16;i++){const a=i/16*Math.PI*2;add(geo.sphere,bulb,[cx+Math.cos(a)*3.6,6.28,cz+Math.sin(a)*3.6],[0.09,0.09,0.09]);}
  const stageCloth=new THREE.MeshStandardMaterial({color:0x573260,emissive:0x573260,emissiveIntensity:0.18,roughness:0.95,side:THREE.BackSide});
  const stageCeiling=add(new THREE.CircleGeometry(3.5,48),stageCloth,[cx,6.45,cz]);stageCeiling.rotation.x=-Math.PI/2;
  const valance=new THREE.CylinderGeometry(3.6,3.6,0.45,48,1,true);
  const skirt=add(valance,violet,[cx,6.04,cz]);skirt.material.side=THREE.DoubleSide;


  // Batch the repeated primitives. Unique roof panels keep their shared
  // materials; no per-frame animation or extra lights are introduced here.
  root.updateMatrixWorld(true);
  const repeated=new Map(),sources=[],originals=new Set();
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    const key=mesh.material.uuid+'/'+mesh.castShadow;
    if(!repeated.has(key))repeated.set(key,{material:mesh.material,castShadow:mesh.castShadow,parts:[]});
    const part=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
    if(!part.attributes.uv)part.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(part.attributes.position.count*2),2));
    part.applyMatrix4(mesh.matrixWorld);repeated.get(key).parts.push(part);sources.push(mesh);originals.add(mesh.geometry);
  });
  sources.forEach(mesh=>mesh.removeFromParent());
  for(const batch of repeated.values()){
    const geometry=mergeGeometries(batch.parts);batch.parts.forEach(part=>part.dispose());
    const mesh=new THREE.Mesh(geometry,batch.material);mesh.castShadow=batch.castShadow;mesh.receiveShadow=false;mesh.name='OverheadBatch';root.add(mesh);
  }
  originals.forEach(geometry=>geometry.dispose());
  root.userData.overheadStats={minPassageHeight:4.6,eaveHeight:8,crownHeight:17,ribs:ribAnchors.length,batches:repeated.size};
  return root;
}

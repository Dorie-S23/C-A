import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Sparse circus rosettes for future circulation loops: static ornament,
 * without directional arrows, continuous lane lines or danger animation. */
export function createMazeLoopMarkings({ loops, cellCenter, cellSize }) {
  const parts = [], placements = [], seen = new Set();
  const scallop = (radius, amplitude) => {
    const points=[];
    for(let i=0;i<32;i++) {
      const angle=i/32*Math.PI*2, r=radius+Math.cos(angle*8)*amplitude;
      points.push(new THREE.Vector2(Math.cos(angle)*r,Math.sin(angle)*r));
    }
    return points;
  };
  const shape=new THREE.Shape(scallop(0.39,0.045));
  shape.holes.push(new THREE.Path(scallop(0.30,0.035).reverse()));
  const diamond=new THREE.Shape();
  diamond.moveTo(0,0.16);diamond.lineTo(0.10,0);diamond.lineTo(0,-0.16);diamond.lineTo(-0.10,0);diamond.closePath();
  const templates=[new THREE.ShapeGeometry(shape),new THREE.ShapeGeometry(diamond)];
  const colors=[new THREE.Color(0x8b6394),new THREE.Color(0xc49e67)];
  for (let loopIndex=0;loopIndex<loops.length;loopIndex++) {
    const loop=loops[loopIndex];
    for(let edge=0;edge<loop.length;edge++) {
      const first=loop[edge],last=loop[(edge+1)%loop.length];
      const key=[`${first.r},${first.c}`,`${last.r},${last.c}`].sort().join(':');
      if(seen.has(key))continue;seen.add(key);
      const a=cellCenter(first.r,first.c),b=cellCenter(last.r,last.c);
      const direction=b.clone().sub(a).normalize();
      const perpendicular=new THREE.Vector3(-direction.z,0,direction.x);
      // One alternating, off-centre medallion per open edge. Never parallel
      // rows or dashes; retain generous clearance from either corridor wall.
      const position=a.clone().lerp(b,0.5).addScaledVector(perpendicular,(edge%2?1:-1)*Math.min(0.95,cellSize*0.22));
      templates.forEach((template,index)=>{
        const geometry=template.clone(),count=geometry.attributes.position.count;
        geometry.setAttribute('color',new THREE.Float32BufferAttribute(Array.from({length:count},()=>colors[index].toArray()).flat(),3));
        geometry.rotateX(-Math.PI/2);geometry.rotateY(Math.atan2(-direction.x,-direction.z));
        geometry.translate(position.x,0.018,position.z);parts.push(geometry);
      });
      placements.push({loopIndex,edge,from:{r:first.r,c:first.c},to:{r:last.r,c:last.c},position:[position.x,0.018,position.z],radius:0.435});
    }
  }
  const geometry=parts.length?mergeGeometries(parts):new THREE.BufferGeometry();
  parts.forEach(part=>part.dispose());templates.forEach(part=>part.dispose());
  const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:0.48,depthWrite:false,side:THREE.DoubleSide});
  material.name='QuietCircusRosettes';
  const mesh=new THREE.Mesh(geometry,material);mesh.name='FutureLoopInlays';mesh.renderOrder=1;
  mesh.userData={loopCount:loops.length,animated:false,danger:false,style:'scalloped circus rosettes',placements};
  return mesh;
}

import * as THREE from 'three';

/** A small personal-space enclosure, not a chamber gate. The pink stage,
 * wall graph and all original wall boxes remain unchanged. */
export function createJaxStageBoundary({ position, colliders, isUnlocked }) {
  const group=new THREE.Group();group.name='JaxStageBoundary';
  const half=0.82,height=2.9,thickness=0.055;
  const material=new THREE.MeshBasicMaterial({color:0x925cd0,transparent:true,opacity:0.075,depthWrite:false});
  const geometry=new THREE.BoxGeometry(1,1,1),boxes=[];
  for(const [x,z,w,d]of [[0,-half,half*2+thickness,thickness],[0,half,half*2+thickness,thickness],[-half,0,thickness,half*2],[half,0,thickness,half*2]]){
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(position.x+x,height/2,position.z+z);mesh.scale.set(w,height,d);mesh.name='JaxBoundaryPanel';group.add(mesh);
    mesh.updateMatrixWorld();boxes.push(new THREE.Box3().setFromObject(mesh));
  }
  const outlineBox=new THREE.BoxGeometry(half*2,height,half*2);
  const outline=new THREE.LineSegments(new THREE.EdgesGeometry(outlineBox),new THREE.LineBasicMaterial({color:0xc78ee9,transparent:true,opacity:0.5}));
  outlineBox.dispose();
  // Generic room teardown disposes meshes. Own the line-only resources
  // through a panel hook too, so re-entry never leaks an outline buffer.
  let outlineReleased=false;
  group.children[0].dispose=()=>{if(outlineReleased)return;outlineReleased=true;outline.geometry.dispose();outline.material.dispose();};
  outline.position.set(position.x,height/2,position.z);group.add(outline);
  let locked=null;
  function sync(){
    const next=!isUnlocked();if(next===locked)return;locked=next;group.visible=locked;
    if(locked)colliders.push(...boxes);
    else for(const box of boxes){const index=colliders.indexOf(box);if(index!==-1)colliders.splice(index,1);}
  }
  // Dev sprint can cross a thin panel in one frame. Sweep the player's
  // horizontal segment against this boundary only; never change the maze's
  // existing wall solver. Project the hit onto its safe face to allow sliding.
  function constrainMotion(from,to,radius=0.35){
    if(!locked)return;
    const extent=half+thickness/2+radius,limits={x:[position.x-extent,position.x+extent],z:[position.z-extent,position.z+extent]};
    const inside=['x','z'].every(axis=>from[axis]>limits[axis][0]&&from[axis]<limits[axis][1]);
    if(inside){
      const exits=['x','z'].flatMap(axis=>[0,1].map(side=>({axis,side,distance:Math.abs(from[axis]-limits[axis][side])}))).sort((a,b)=>a.distance-b.distance);
      const exit=exits[0];to[exit.axis]=limits[exit.axis][exit.side]+(exit.side?0.001:-0.001);return;
    }
    let enter=0,leave=1,hitAxis=null,hitSide=0;
    for(const axis of ['x','z']){
      const delta=to[axis]-from[axis],[low,high]=limits[axis];
      if(Math.abs(delta)<1e-9){if(from[axis]<low||from[axis]>high)return;continue;}
      let a=(low-from[axis])/delta,b=(high-from[axis])/delta,side=0;
      if(a>b){[a,b]=[b,a];side=1;}
      if(a>enter){enter=a;hitAxis=axis;hitSide=side;}
      leave=Math.min(leave,b);if(enter>leave)return;
    }
    if(hitAxis&&enter>=0&&enter<=1)to[hitAxis]=limits[hitAxis][hitSide]+(hitSide?0.001:-0.001);
  }
  sync();
  return {group,colliders:boxes,sync,constrainMotion,get locked(){return locked;},halfExtent:half+thickness/2};
}

import * as THREE from 'three';

/** A title-owned 3D control, rendered before the existing glove cursor pass. */
export function createTitleMusicButton(playMaterial, labelMaterial) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, .1, 200);
  camera.position.z = 100;
  scene.add(new THREE.AmbientLight(0xffffff, .07 * Math.PI));
  const sun = new THREE.DirectionalLight(0xffffff, 6.22);
  sun.position.set(.57, .532, .626).multiplyScalar(100);scene.add(sun);
  const group = new THREE.Group();group.name = 'TitleMusicButton';scene.add(group);
  const red = playMaterial.clone(), ink = labelMaterial.clone();
  const baseColor = red.color.clone();
  // Same authored material and title lighting as PLAY, with a circular silhouette.
  const body = new THREE.Mesh(new THREE.SphereGeometry(26, 40, 24), red);
  body.scale.z = .38;group.add(body);
  const note = new THREE.Group();note.position.z = 10;group.add(note);
  function extrude(shape) {
    const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, {
      depth: 1.2, bevelEnabled: true, bevelSize: .15, bevelThickness: .15, bevelSegments: 2, steps: 1,
    }), ink);note.add(mesh);
  }
  for(const [x,y] of [[-7,-8],[5,-5]]) {
    const head = new THREE.Shape();head.absellipse(x,y,4,2.8,0,Math.PI*2,false,.3);extrude(head);
  }
  const stem = new THREE.Shape();
  stem.moveTo(-4,-7);stem.lineTo(-4,8);stem.lineTo(8,11);stem.lineTo(8,-4);
  stem.lineTo(5,-4);stem.lineTo(5,5);stem.lineTo(-1,3);stem.lineTo(-1,-7);stem.closePath();extrude(stem);
  const slash = new THREE.Mesh(new THREE.BoxGeometry(3,29,1.6),ink);
  slash.rotation.z=Math.PI/4;slash.position.z=13;slash.visible=false;group.add(slash);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
  const context=canvas.getContext('2d'),gradient=context.createRadialGradient(32,32,9,32,32,32);
  gradient.addColorStop(0,'rgba(25,8,20,.35)');gradient.addColorStop(1,'rgba(25,8,20,0)');
  context.fillStyle=gradient;context.fillRect(0,0,64,64);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(76,76),new THREE.MeshBasicMaterial({
    map:new THREE.CanvasTexture(canvas),transparent:true,depthWrite:false,
  }));shadow.position.set(0,-6,-12);group.add(shadow);
  let hovered=false,hover=0,pressTime=1,width=56,height=56;
  return {
    scene,camera,
    resize(w,h){camera.right=w;camera.top=h;camera.updateProjectionMatrix();},
    setBounds(rect,viewportHeight){
      group.position.set(rect.x+rect.width/2,viewportHeight-rect.y-rect.height/2,0);
      width=rect.width;height=rect.height;
    },
    setMuted(muted){slash.visible=muted;red.color.copy(baseColor).multiplyScalar(muted?.72:1);},
    setHovered(value){hovered=value;},
    press(){pressTime=0;},
    update(dt,reducedMotion){
      hover=reducedMotion?(hovered?1:0):THREE.MathUtils.damp(hover,hovered?1:0,12,dt);
      pressTime=Math.min(1,pressTime+dt/.36);
      const bounce=reducedMotion?0:Math.sin(pressTime*Math.PI*3)*Math.exp(-pressTime*4)*(1-pressTime);
      const grow=reducedMotion?1:1+.08*hover;
      group.scale.set(width/56*grow*(1+bounce*.12),height/56*grow*(1-bounce*.18),1);
    },
  };
}

// Standalone local review tool. Not imported by the game or production entry.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { loadMazeRoom } from '../src/rooms/mazeRoom.js';
import { createMazeItems } from '../src/state/mazeItems.js';

if (!import.meta.env.DEV) throw new Error('The maze review tour is a local development tool.');
const status = document.getElementById('status');
const seed = Number(new URLSearchParams(location.search).get('mazeSeed') ?? 123);
document.getElementById('seed').textContent = seed;
document.getElementById('game').href = `/?dev=1&mazeSeed=${seed}`;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x171222);
scene.add(new THREE.AmbientLight(0xffffff, 0.15)); // same shared fill as the game
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.minDistance = 0.6; controls.maxDistance = 115;
const centre = cell => new THREE.Vector3(-27 + cell.c * 4.5, 0, -27 + cell.r * 4.5);
let room;
try {
  room = await loadMazeRoom(null, { seed, mazeItems: createMazeItems() });
  scene.add(room.group);
  const views = room.group.getObjectByName('MazeScenery').userData.reviewViews;
  const [patrolA,patrolB] = room.movers[0].waypoints;
  const patrolDirection = patrolB.clone().sub(patrolA).setY(0).normalize();
  const patrolSide = new THREE.Vector3(-patrolDirection.z,0,patrolDirection.x).multiplyScalar(0.72);
  const stops = [
    { id:'overview', title:'Full layout · top-down', position:[0,81,0.01], target:[0,0,0] },
    { id:'entrance', title:'Entrance & lobby arch', ...views.entrance },
    { id:'corridor', title:'Decorated corridors', ...views.corridor },
    { id:'patrol', title:'Animated patrol warning', position:patrolA.clone().addScaledVector(patrolDirection,-1).add(patrolSide).setY(1.7).toArray(), target:patrolB.clone().add(patrolSide).setY(0.15).toArray() },
    ...room.environmentLayout.loops.map((loop, i) => {
      const middle = loop.reduce((sum, cell) => sum.add(centre(cell)), new THREE.Vector3()).multiplyScalar(1 / loop.length);
      return { id:`loop${i}`, title:`Patrol loop ${i + 1} · overhead`, position:[middle.x,20,middle.z+0.01], target:middle.toArray() };
    }),
    { id:'bowling', title:'Bowling ball · search alcove', ...views.bowling },
    { id:'mug', title:'Hot chocolate · search alcove', ...views.mug },
    { id:'jax', title:'Jax chamber · far end', ...views.jax },
    { id:'exit', title:'Exit destination', position:centre(room.maze.exit).add(new THREE.Vector3(0,10,0.01)).toArray(), target:centre(room.maze.exit).toArray() },
  ];
  const markers = new THREE.Group(); scene.add(markers);
  const markerObjects = [];
  function marker(cell, label, id, color) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(64,64,51,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#fff0d0'; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = '#23182f'; ctx.font = 'bold 52px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label,64,65);
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest:false, depthWrite:false }));
    sprite.position.copy(centre(cell)).y = 4.5; sprite.scale.set(3.2,3.2,1); sprite.renderOrder=10; sprite.userData.stop=id;
    markers.add(sprite); markerObjects.push(sprite);
  }
  marker(room.maze.start,'E','entrance','#f4c46c');
  marker(room.maze.jax,'J','jax','#c4a2e8');
  marker(room.maze.exit,'X','exit','#8cdbb0');
  marker(room.environmentLayout.alcoves[0],'B','bowling','#8fd8e1');
  marker(room.environmentLayout.alcoves[1],'M','mug','#8fd8e1');
  room.environmentLayout.loops.forEach((loop,i)=>marker(loop[0],`${i+1}`,`loop${i}`,'#e9b856'));
  const buttons = new Map();
  function jump(id) {
    const stop = stops.find(item=>item.id===id);
    camera.position.fromArray(stop.position); controls.target.fromArray(stop.target);
    markers.visible = id==='overview' || id.startsWith('loop');
    // Reset damping so an earlier drag cannot pull the next camera off its stop.
    controls.reset(); camera.position.fromArray(stop.position); controls.target.fromArray(stop.target); controls.update(); controls.saveState();
    status.textContent = stop.title + (id==='overview' ? ' · Click a map marker to visit.' : ' · Drag to inspect this area.');
    renderer.domElement.dataset.stop = id;
    buttons.forEach((button,key)=>button.setAttribute('aria-pressed',String(key===id)));
  }
  stops.forEach(stop=>{
    const button=document.createElement('button'); button.type='button'; button.textContent=stop.title;
    button.addEventListener('click',()=>jump(stop.id)); buttons.set(stop.id,button); document.getElementById('stops').append(button);
  });
  let pointerDown;
  renderer.domElement.addEventListener('pointerdown',event=>{pointerDown=[event.clientX,event.clientY];});
  renderer.domElement.addEventListener('pointerup',event=>{
    if(!markers.visible || !pointerDown || Math.hypot(event.clientX-pointerDown[0],event.clientY-pointerDown[1])>5) return;
    const pointer=new THREE.Vector2(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);
    const ray=new THREE.Raycaster(); ray.setFromCamera(pointer,camera);
    const hit=ray.intersectObjects(markerObjects)[0]; if(hit) jump(hit.object.userData.stop);
  });
  jump('overview');
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(()=>{
    const dt=Math.min(clock.getDelta(),0.05); controls.update(); room.update(dt,camera.position); renderer.render(scene,camera);
  });
} catch(error) { status.textContent=`Could not load the review: ${error.message}`; console.error(error); }
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});

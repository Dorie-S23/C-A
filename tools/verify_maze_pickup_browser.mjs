import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const output='artifacts/jax-encounter';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],report={screenshots:[],saves:[],seeds:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.route('**/src/main.js*',async route=>{
 const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 renderer.setPixelRatio(0.8);
 let completionCalls=0;const actualEndLevel=endLevel;endLevel=(...args)=>{completionCalls++;return actualEndLevel(...args);};
 const lock=value=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:value?renderer.domElement:null});document.dispatchEvent(new Event('pointerlockchange'));};
 window.__lastAct={
 pickupView(index,distance=1.8){const c=currentRoomInfo.environmentLayout.alcoves[index],side=[['top',0,-1],['right',1,0],['bottom',0,1],['left',-1,0]].find(([wall])=>!c.walls[wall]);player.position.set(-27+c.c*4.5+side[1]*distance,1.7,-27+c.r*4.5+side[2]*distance);cameraYaw=Math.atan2(side[1],side[2]);cameraPitch=0.12;firstPerson=false;currentCameraDistance=CAMERA_DISTANCE;updateCamera(1);resetMoveState();},
 ready:()=>currentRoomKey==='maze'&&readyToPlay,
 lock,
 status:()=>({items:mazeItems.snapshot(),locked:currentRoomInfo?.jaxBoundary.locked,colliders:currentRoomInfo?.jaxBoundary.colliders.filter(box=>colliders.includes(box)).length,dialogue:dialogueUI.isActive,active:mazeEncounter?.active,armed:mazeEncounter?.armed,resume:mazeEncounter?.resumeAt,paused,complete:reachedExit,ready:readyToPlay,completionCalls,seed:currentRoomInfo?.mazeSeed,hud:document.getElementById('maze-objective-hud').textContent,hudHidden:document.getElementById('maze-objective-hud').hidden,pose:currentRoomInfo?.group.getObjectByName('Jax').getObjectByName('head_8_14')?.quaternion.toArray(),memory:{...renderer.info.memory},render:{...renderer.info.render}}),
 park(distance=3.5,eye=false){const room=currentRoomInfo,a=room.jaxAnchor,n=new THREE.Vector3(-27+room.maze.jaxNeighbor.c*4.5,0,-27+room.maze.jaxNeighbor.r*4.5),dir=n.sub(a).normalize();player.position.copy(a).addScaledVector(dir,distance).setY(1.7);firstPerson=eye;cameraYaw=Math.atan2(dir.x,dir.z);cameraPitch=eye?0.12:0.14;pomni.rotation.y=cameraYaw+Math.PI;currentCameraDistance=CAMERA_DISTANCE;updateCamera(1);resetMoveState();},
 boundaryProbe(){this.park(3.5);let minDistance=Infinity;move.forward=true;move.sprint=true;for(let frame=0;frame<180;frame++){jumpQueued=true;updateMovement(1/60);minDistance=Math.min(minDistance,Math.hypot(player.position.x-currentRoomInfo.jaxAnchor.x,player.position.z-currentRoomInfo.jaxAnchor.z));}resetMoveState();land();return {minDistance,dialogue:dialogueUI.isActive};},
 atSpawn(){player.position.copy(currentRoomInfo.spawn).setY(1.7);resetMoveState();},
 pickup(id){const label=MAZE_FINDABLES.find(item=>item.id===id).label,pickup=currentRoomInfo.interactables.find(i=>i.prompt()===('Pick up '+label));if(!pickup)throw Error('missing pickup '+id);pickup.interact();},
 cancel:()=>dialogueUI.cancel(),
 checkpoint(){takeCheckpoint();saveSlots.write(3,checkpoint);return saveSlots.read(3);},
 load:data=>loadGame(data),
 async reenter(){await selectRoom('maze');},
 checkExit(){const c=currentRoomInfo.maze.exit;player.position.set(-27+c.c*4.5,1.7,-27+c.r*4.5);checkTriggers(player);},
 newGame:()=>{startNewGame();return mazeItems.snapshot();},
 blockSight(value){if(value){const a=currentRoomInfo.jaxAnchor,n=player.position.clone().sub(a).setY(0).normalize(),p=a.clone().addScaledVector(n,1);this.testWall=new THREE.Box3(p.clone().add(new THREE.Vector3(-0.15,0,-0.15)),p.clone().add(new THREE.Vector3(0.15,3,0.15)));colliders.push(this.testWall);}else if(this.testWall){colliders.splice(colliders.indexOf(this.testWall),1);this.testWall=null;}},
 shaderCheck(){renderer.compile(scene,camera);const gl=renderer.getContext();return {links:renderer.info.programs.map(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),error:gl.getError()};},
 };
 `});});
 async function load(seed){await page.goto(`http://127.0.0.1:5174/?dev=1&mazeSeed=${seed}`,{waitUntil:'domcontentloaded'});await page.locator('button[data-room="maze"]').click();await page.waitForFunction(()=>window.__lastAct?.ready(),null,{timeout:90000});await page.evaluate(()=>window.__lastAct.lock(true));}
 const status=()=>page.evaluate(()=>window.__lastAct.status());
 async function shot(name){await page.waitForTimeout(140);await page.screenshot({path:`${output}/${name}.png`,timeout:60000});report.screenshots.push(name);}
 await load(123);await page.evaluate(()=>window.__lastAct.pickupView(1,4.6));await page.waitForTimeout(300);assert.equal(await page.locator('#prompt').isVisible(),false);
 await page.evaluate(()=>window.__lastAct.pickupView(1));await page.waitForFunction(()=>!document.getElementById('prompt').hidden&&document.getElementById('prompt').textContent.includes('mug'));
 await page.screenshot({path:`${output}/mug-larger-pickup-prompt.png`,timeout:60000});await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__lastAct.status().items.collected.includes('hot-chocolate-mug'));
 assert.equal((await status()).items.collected.length,1);await page.screenshot({path:`${output}/mug-collected-with-E.png`,timeout:60000});
 await page.evaluate(()=>window.__lastAct.pickupView(0));await page.waitForFunction(()=>!document.getElementById('prompt').hidden&&document.getElementById('prompt').textContent.includes('bowling ball'));
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>window.__lastAct.status().items.collected.length===2);assert.equal((await status()).locked,false);assert.deepEqual(errors,[]);console.log(JSON.stringify({nearbyPickupWithoutAiming:true,realKeyE:true,items:(await status()).items,errors}));
}finally{await browser.close();}

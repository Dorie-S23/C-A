import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const output='artifacts/jax-encounter';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],report={screenshots:[],saves:[],seeds:[]};
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultNavigationTimeout(90000);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.route('**/src/main.js',async route=>{
 const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 renderer.setPixelRatio(0.8);
 let completionCalls=0;const actualEndLevel=endLevel;endLevel=(...args)=>{completionCalls++;return actualEndLevel(...args);};
 const lock=value=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:value?renderer.domElement:null});document.dispatchEvent(new Event('pointerlockchange'));};
 window.__lastAct={
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
 await load(123);await page.evaluate(()=>window.__lastAct.park());await shot('01-locked-stage-hud-0');
 const physical=await page.evaluate(()=>window.__lastAct.boundaryProbe());assert.ok(physical.minDistance>1.15,'sprinting/jumping must not cross the stage boundary');assert.equal(physical.dialogue,false);report.physicalBoundary=physical;await page.evaluate(()=>window.__lastAct.park());
 let state=await status();assert.equal(state.locked,true);assert.equal(state.colliders,4);assert.ok(state.hud.includes('0/2'));const saved0=await page.evaluate(()=>window.__lastAct.checkpoint());
 await page.evaluate(()=>window.__lastAct.park(3.5,true));await shot('02-distressed-eye-height');
 await page.evaluate(()=>window.__lastAct.lock(false));const pose=(await status()).pose;await page.waitForTimeout(450);assert.deepEqual((await status()).pose,pose);await page.evaluate(()=>window.__lastAct.lock(true));
 await page.evaluate(()=>{window.__lastAct.checkExit();window.__lastAct.atSpawn();});assert.equal((await status()).complete,false);
 await page.evaluate(()=>{window.__lastAct.pickup('bowling-ball');window.__lastAct.park();});await shot('03-hud-1');state=await status();assert.equal(state.locked,true);assert.ok(state.hud.includes('1/2'));assert.equal(state.dialogue,false);const saved1=await page.evaluate(()=>window.__lastAct.checkpoint());
 await page.evaluate(()=>window.__lastAct.pickup('hot-chocolate-mug'));await shot('04-unlocked-hud-2');state=await status();assert.equal(state.locked,false);assert.equal(state.colliders,0);assert.ok(state.hud.includes('Find Jax'));assert.equal(state.dialogue,false);const saved2=await page.evaluate(()=>window.__lastAct.checkpoint());
 await page.evaluate(()=>{window.__lastAct.checkExit();window.__lastAct.park(3.5);});assert.equal((await status()).complete,false);assert.equal((await status()).completionCalls,0);
 // Wall in the actual line-of-sight query must prevent the automatic start.
 await page.evaluate(()=>{window.__lastAct.lock(false);window.__lastAct.park(2.1);window.__lastAct.blockSight(true);window.__lastAct.lock(true);});await page.waitForTimeout(250);assert.equal((await status()).dialogue,false);
 await page.evaluate(()=>window.__lastAct.blockSight(false));await page.waitForFunction(()=>window.__lastAct.status().dialogue,null,{timeout:15000});await shot('05-final-dialogue');assert.equal((await status()).items.jaxComplete,false);
 await page.evaluate(()=>window.__lastAct.cancel());await page.waitForTimeout(250);assert.equal((await status()).items.jaxComplete,false);assert.equal((await status()).dialogue,false);
 await page.evaluate(()=>window.__lastAct.park(3.5));await page.waitForFunction(()=>window.__lastAct.status().armed,null,{timeout:15000});await page.evaluate(()=>window.__lastAct.park(2.1));await page.waitForFunction(()=>window.__lastAct.status().dialogue,null,{timeout:15000});
 // Real keyboard advancement through all six provisional lines. First press
 // reveals the typed line; second advances. Never use skipToEnd for completion.
 for(let i=0;i<6;i++){await page.keyboard.press('Space');await page.waitForTimeout(60);await page.keyboard.press('Space');await page.waitForTimeout(100);}
 await page.waitForFunction(()=>window.__lastAct.status().items.jaxComplete,null,{timeout:15000});await page.evaluate(()=>window.__lastAct.park(3.5));await shot('06-reach-exit');state=await status();assert.ok(state.hud.includes('Reach the exit'));assert.equal(state.dialogue,false);const savedDone=await page.evaluate(()=>window.__lastAct.checkpoint());
 const legacySave={...saved0};delete legacySave.maze;
 for(const saved of [saved0,saved1,saved2,legacySave,savedDone]){
 await page.evaluate(data=>window.__lastAct.load(data),saved);await page.waitForFunction(()=>window.__lastAct.ready(),null,{timeout:90000});await page.evaluate(()=>window.__lastAct.lock(true));state=await status();assert.deepEqual(state.items,saved.maze??{collected:[],seed:123,jaxComplete:false});assert.equal(state.seed,123);assert.equal(state.locked,(saved.maze?.collected.length??0)<2);report.saves.push(state.items);
 }
 await page.evaluate(()=>window.__lastAct.park(2.1));await page.waitForTimeout(180);assert.equal((await status()).dialogue,false);
 await page.evaluate(()=>window.__lastAct.checkExit());assert.equal((await status()).complete,true);await page.evaluate(()=>window.__lastAct.checkExit());assert.equal((await status()).completionCalls,1);await shot('07-level-complete');
 await load(187);await page.evaluate(()=>window.__lastAct.park());state=await status();assert.equal(state.locked,true);assert.equal(state.seed,187);await shot('08-seed-187-boundary');const shader=await page.evaluate(()=>window.__lastAct.shaderCheck());assert.equal(shader.error,0);assert.ok(shader.links.every(Boolean));report.seeds.push({seed:187,shader});
 await page.evaluate(()=>window.__lastAct.pickup('hot-chocolate-mug'));assert.equal((await status()).locked,true);await page.evaluate(()=>window.__lastAct.pickup('bowling-ball'));assert.equal((await status()).locked,false);
 await page.setViewportSize({width:480,height:800});await shot('09-mobile-hud');assert.ok(await page.locator('#maze-objective-hud').isVisible());
 const reset=await page.evaluate(()=>window.__lastAct.newGame());assert.deepEqual(reset,{collected:[],seed:null,jaxComplete:false});await page.waitForFunction(()=>document.getElementById('maze-objective-hud').hidden);
 assert.deepEqual(errors,[]);report.errors=errors;fs.writeFileSync(`${output}/browser-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}

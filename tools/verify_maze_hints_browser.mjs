// Real rooms, native pointer lock, actual E pickups. Game-clock deltas are
// held between assertions so enemy movement cannot interrupt UI verification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const output='artifacts/maze-hints-six';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const empty={version:3,used:0};
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/src/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 renderer.setPixelRatio(.4);clock.getDelta=()=>0;
 window.__sixHints={ready:()=>currentRoomKey==='maze'&&readyToPlay,lock:()=>renderer.domElement.requestPointerLock(),
 state:()=>({open:mazeHints.isOpen,paused,locked:isLocked,items:mazeItems.snapshot(),hints:mazeHints.snapshot(),position:player.position.toArray(),time:mazeSearch.timeLeft}),
 markers:()=>[...document.querySelectorAll('[data-map-marker]')].map(g=>({id:g.dataset.mapItem,marker:g.dataset.mapMarker,x:+g.dataset.mapX,y:+g.dataset.mapY})),
 playerMap:()=>({x:(player.position.x-currentRoomInfo.bounds.min.x)/(currentRoomInfo.bounds.max.x-currentRoomInfo.bounds.min.x)*currentRoomInfo.maze.cols,y:(player.position.z-currentRoomInfo.bounds.min.z)/(currentRoomInfo.bounds.max.z-currentRoomInfo.bounds.min.z)*currentRoomInfo.maze.rows}),
 expectedJax:()=>({x:currentRoomInfo.maze.jax.c+.5,y:currentRoomInfo.maze.jax.r+.5}),
 atItem(index,offset=1.6){const c=currentRoomInfo.environmentLayout.alcoves[index],side=[['top',0,-1],['right',1,0],['bottom',0,1],['left',-1,0]].find(([wall])=>!c.walls[wall]);player.position.set(-27+c.c*4.5+side[1]*offset,1.7,-27+c.r*4.5+side[2]*offset);cameraYaw=Math.atan2(side[1],side[2]);pomni.rotation.y=cameraYaw+Math.PI;cameraPitch=.12;firstPerson=false;updateCamera(1);resetMoveState();},
 checkpoint(){takeCheckpoint();return structuredClone(checkpoint);},load:data=>loadGame(data),reenter:()=>selectRoom('maze'),resetHints:()=>mazeHints.reset(),
 newGame:()=>startNewGame(),home:()=>returnToHome(),
 webgl(){const gl=renderer.getContext(),priorErrors=[];for(let i=0;i<8;i++){const e=gl.getError();if(!e)break;priorErrors.push(e);}renderer.compile(scene,camera);renderer.render(scene,camera);return {priorErrors,linked:renderer.info.programs.every(p=>gl.getProgramParameter(p.program,gl.LINK_STATUS)),error:gl.getError()};},
 };
 `});});
 const state=()=>page.evaluate(()=>window.__sixHints.state());
 const markers=()=>page.evaluate(()=>window.__sixHints.markers());
 const next=()=>page.locator('[data-next-hint]');
 async function lock(){await page.evaluate(()=>window.__sixHints.lock());await page.waitForFunction(()=>window.__sixHints.state().locked&&!window.__sixHints.state().paused);}
 async function open(){await page.keyboard.press('KeyH');await page.waitForFunction(()=>window.__sixHints.state().open&&!window.__sixHints.state().locked);}
 async function back(){await page.keyboard.press('Escape');await page.waitForFunction(()=>!window.__sixHints.state().open);assert.equal((await state()).paused,true);}
 async function resume(){await page.locator('#btn-resume').click();await page.waitForFunction(()=>window.__sixHints.state().locked&&!window.__sixHints.state().paused);}
 async function request(number){await page.keyboard.press('KeyH');assert.equal(await next().textContent(),'Reveal Hint '+number);}
 async function reveal(number){assert.equal(await next().textContent(),'Reveal Hint '+number);await next().click();}
 async function pickup(index,count){await page.evaluate(i=>window.__sixHints.atItem(i),index);await page.waitForFunction(()=>!document.getElementById('prompt').hidden&&document.getElementById('prompt').textContent.includes('Pick up'));await page.keyboard.press('KeyE');await page.waitForFunction(count=>window.__sixHints.state().items.collected.length===count,count);}
 async function shot(name){await page.screenshot({path:output+'/'+name+'.png',timeout:90000});console.log('Captured '+name);}
 async function playerMarker(){const actual=(await markers()).find(m=>m.marker==='P'),expected=await page.evaluate(()=>window.__sixHints.playerMap());assert.ok(actual);assert.ok(Math.abs(actual.x-expected.x)<1e-6&&Math.abs(actual.y-expected.y)<1e-6);return actual;}
 async function checkMapLabels(){return page.evaluate(()=>{const map=document.querySelector('[data-map-drawing]').getBoundingClientRect(),rows=[...document.querySelectorAll('[data-map-legend] li')].map(li=>li.getBoundingClientRect()),overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return rows.every((r,i)=>!overlaps(r,map)&&rows.every((s,j)=>i===j||!overlaps(r,s)));});}
 for(const seed of [123,187]){
  await page.goto('http://127.0.0.1:5174/?dev=1&mazeSeed='+seed,{waitUntil:'domcontentloaded'});await page.locator('button[data-room="maze"]').click();await page.waitForFunction(()=>window.__sixHints?.ready());await lock();await open();
  assert.deepEqual((await state()).hints,empty);assert.equal(await page.locator('[data-hint]').count(),0);await reveal(1);const firstPlayer=await playerMarker();assert.deepEqual((await markers()).filter(m=>m.id).map(m=>m.id).sort(),['bowling-ball','hot-chocolate-mug']);assert.ok(!(await markers()).some(m=>m.marker==='J'));assert.equal(await checkMapLabels(),true);await shot('objects-map-1-'+seed);
  // Move to and collect one actual object; the next map must show the new
  // player location and only the still-missing item.
  await back();await resume();const order=seed===123?[1,0]:[0,1];await pickup(order[0],1);await open();assert.equal(await next().textContent(),'Reveal Hint 2');await reveal(2);const secondPlayer=await playerMarker();assert.notDeepEqual(secondPlayer,firstPlayer);
  const remaining=order[0]===1?'bowling-ball':'hot-chocolate-mug';assert.deepEqual((await markers()).filter(m=>m.id).map(m=>m.id),[remaining]);await shot('objects-map-remaining-'+seed);
  await request(3);assert.equal(await page.locator('[data-maze-map]').isVisible(),false);
  const saved=await page.evaluate(()=>window.__sixHints.checkpoint());assert.deepEqual(saved.mazeHints,{version:3,used:2});
  await page.evaluate(data=>window.__sixHints.load(data),saved);await page.waitForFunction(()=>window.__sixHints.ready());await lock();await open();assert.equal(await next().textContent(),'Reveal Hint 3');assert.deepEqual((await state()).hints,saved.mazeHints);await back();await resume();await pickup(order[1],2);await open();await reveal(3);const jaxPlayer1=await playerMarker();
  assert.deepEqual((await markers()).map(m=>m.marker),['E','J','P']);const j=(await markers()).find(m=>m.marker==='J');assert.deepEqual({x:j.x,y:j.y},await page.evaluate(()=>window.__sixHints.expectedJax()));await shot('jax-map-1-'+seed);
  await back();await resume();await page.evaluate(i=>window.__sixHints.atItem(i,.8),order[1]);await open();await reveal(4);const jaxPlayer2=await playerMarker();assert.notDeepEqual(jaxPlayer2,jaxPlayer1);await shot('jax-map-2-'+seed);await request(5);await reveal(5);await request(6);await reveal(6);assert.equal(await page.locator('[data-hints-count]').textContent(),'0 hints left');
  await page.keyboard.press('KeyH');assert.equal(await next().isVisible(),false);assert.equal(await page.locator('[data-maze-map]').isVisible(),false);assert.match(await page.locator('[data-hint-text]').textContent(),/used all/);
  const exhausted=await page.evaluate(()=>window.__sixHints.checkpoint());await page.evaluate(()=>window.__sixHints.reenter());await page.waitForFunction(()=>window.__sixHints.ready());await lock();await open();assert.deepEqual((await state()).hints,exhausted.mazeHints);assert.equal(await next().isVisible(),false);
  // All six unused hints can target Jax if both objects are already found.
  await page.evaluate(()=>window.__sixHints.resetHints());await page.keyboard.press('KeyH');await page.waitForFunction(()=>window.__sixHints.state().open);assert.equal(await next().textContent(),'Reveal Hint 1');assert.equal(await page.locator('[data-hints-count]').textContent(),'6 hints left');
  for(let n=1;n<=6;n++){if(n>1)await request(n);await reveal(n);assert.equal((await markers()).some(m=>m.marker==='J'),true);}await page.keyboard.press('KeyH');assert.equal(await next().isVisible(),false);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__sixHints.resetHints());await page.keyboard.press('KeyH');await reveal(1);assert.equal(await checkMapLabels(),true);await page.setViewportSize({width:1280,height:900});
  const gl=await page.evaluate(()=>window.__sixHints.webgl());assert.equal(gl.linked,true);assert.equal(gl.error,0);
  results.push({seed,realEPickupOrder:order,sixSlotCap:true,remainingObjectsOnly:true,freshPlayerMarkers:true,jaxAfterBoth:true,sharedBudgetAcrossGoals:true,saveAndReentry:true,labelsClear:true,webgl:gl});
 }
 await page.evaluate(()=>window.__sixHints.newGame());assert.deepEqual((await state()).hints,empty);await page.evaluate(()=>window.__sixHints.home());
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/report.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors}));
}finally{await browser.close();}

// Browser integration checks using installed Edge and native CDP, no npm install.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const output=path.resolve('artifacts/opening-choreography');fs.mkdirSync(output,{recursive:true});
const browserExecutable=process.env.CGV_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(browserExecutable,[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions',
 '--remote-debugging-port=9239','--window-size=800,600','--force-device-scale-factor=1',
 '--user-data-dir='+path.join(os.tmpdir(),'opening-choreography'),'about:blank',
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[];
async function until(fn,limit=90000){const t=Date.now();while(Date.now()-t<limit){try{const value=await fn();if(value)return value}catch{}await sleep(200)}throw Error('Browser condition timed out')}
const report={pass:false,browserExecutable,checks:[],snapshots:[],errors};
const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+r.exceptionDetails.exception?.description);return r.result.value};
const state=()=>evaluate("import('/src/main.js').then(m=>m.getOpeningDiagnostics())");
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const key=(code,type='keydown')=>evaluate(`window.dispatchEvent(new KeyboardEvent('${type}',{code:'${code}',key:'${code==='Escape'?'Escape':code}',bubbles:true,cancelable:true}))`);
const screenshot=async name=>{
 await evaluate("document.querySelector('#overlay').style.visibility='hidden'");
 const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));
 await evaluate("document.querySelector('#overlay').style.visibility=''");
};
const setLock=async locked=>evaluate(locked
 ? "Object.defineProperty(document,'pointerLockElement',{value:document.querySelector('canvas'),configurable:true});document.dispatchEvent(new Event('pointerlockchange'))"
 : "delete document.pointerLockElement;document.dispatchEvent(new Event('pointerlockchange'))");
const check=(name,run)=>{run();report.checks.push(name);console.log('PASS',name)};

try{
 const target=await until(async()=>{const list=await fetch('http://127.0.0.1:9239/json/list').then(r=>r.json());return list.find(t=>t.type==='page')});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Browser disconnected'));pending.clear()});
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);if(r.error)p?.reject(Error(JSON.stringify(r.error)));else p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params.args.map(a=>a.value??a.description).join(' '))});
 await command('Runtime.enable');await command('Page.enable');await command('Page.navigate',{url:'http://127.0.0.1:5173/'});
 await until(async()=>Boolean(await state()));await click('[data-story]');
 if(!process.argv.includes('--lifecycle-only')){
 const sleeping=await until(async()=>{const s=await state();return s.phase==='playing'&&s.openingElapsed<4.5&&s},20000);
 check('Five-second sleep starts without gameplay controls or early objective',()=>{assert.equal(sleeping.gameplayActorVisible,false);assert.equal(sleeping.ready,false);assert.equal(sleeping.objective,null)});
 const knocking=await until(async()=>{const s=await state();return s.openingElapsed>=5&&s.openingElapsed<5.6&&s});
 check('Three scheduled knocks precede waking movement',()=>{assert.ok(Math.abs(knocking.time-1.4)<1e-8);assert.equal(knocking.lighting,'SLEEPING');assert.equal(knocking.openingSounds.filter(s=>s.name.startsWith('TemporaryDoorKnock')).length,3)});
 const seated=await until(async()=>{const s=await state();return s.phase==='seated'&&s.dialogueActive&&s});
 await key('Space');await until(async()=> (await state()).dialogueActive && await evaluate("document.querySelector('#dialogue-text').textContent.startsWith('Another day trapped')"));
 await screenshot('seated-remark');const held=await state();await sleep(900);const stable=await state();
 check('Pomni and blanket hold at Sitting frame 119 during the reused self-directed remark',()=>{assert.ok(Math.abs(seated.time-118/30)<1e-8);assert.equal(stable.time,held.time);assert.deepEqual(stable.blanketWeights,held.blanketWeights);assert.deepEqual(stable.camera,held.camera);assert.equal(stable.gameplayActorVisible,false);assert.ok(stable.cinematicSkinMeshes>0)});
 await key('KeyP');await until(async()=> (await state()).paused);const pause=await state();await key('Space');await sleep(300);const frozen=await state();
 check('Seated pause freezes dialogue, blanket and camera without accepting advance input',()=>{assert.equal(frozen.dialogueText,pause.dialogueText);assert.equal(frozen.time,pause.time);assert.deepEqual(frozen.camera,pause.camera);assert.deepEqual(frozen.blanketWeights,pause.blanketWeights)});
 await key('KeyP');await until(async()=> !(await state()).paused);await key('Space');await key('Space');
 await until(async()=> (await state()).dialogueActive && await evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));const invited=await state();await screenshot('seated-invitation');
 check('Come in is still spoken seated, with no Ragatha entrance before acknowledgement',()=>{assert.equal(invited.phase,'seated');assert.equal(invited.time,held.time);assert.equal(invited.entranceStarted,false);assert.deepEqual(invited.blanketWeights,held.blanketWeights)});
 await evaluate(`(async()=>{const m=await import('/src/main.js');window.__choreographyFrames=[];window.__choreographyCapture=null;let count=0;function watch(){const s=m.getOpeningDiagnostics();window.__choreographyFrames.push({phase:s.phase,time:s.time,entrance:s.entrancePhase,stage:s.ragatha?.stage});if(s.entrancePhase==='entering'&&s.ragatha?.stage==='walking-in'&&s.phase==='playing'&&s.time>5.7&&s.time<7.5){window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true}));window.__choreographyCapture=m.getOpeningDiagnostics();return;}if(count++<1200&&!s.dialogueActive)requestAnimationFrame(watch);else if(s.phase==='seated'&&count<1200)requestAnimationFrame(watch)}requestAnimationFrame(watch)})()`);
 await key('Space');
 const entering=await until(()=>evaluate('window.__choreographyCapture'));
 await screenshot('entering-while-pomni-stands');await key('KeyP');
 check('Same R5 timeline resumes while Ragatha walks in, with a single Pomni and changing blanket',()=>{assert.equal(entering.openingCoordinated,true);assert.ok(entering.time>118/30);assert.equal(entering.gameplayActorVisible,false);assert.notDeepEqual(entering.blanketWeights,held.blanketWeights);assert.equal(entering.dialogueActive,false)});
 const conversation=await until(async()=>{const s=await state();return s.entrancePhase==='dialogue'&&s.dialogueActive&&s});await key('Space');const greetingText=(await state()).dialogueText;await screenshot('ready-to-converse');
 check('Conversation begins at Ragatha greeting only after both characters finish positioning',()=>{assert.equal(conversation.phase,'done');assert.equal(conversation.time,7.5);assert.equal(conversation.cinematicSkinMeshes,0);assert.equal(conversation.gameplayActorVisible,true);assert.ok(greetingText.startsWith('Morning'));assert.equal(conversation.objective,null)});
 const lines=[];for(let i=0;i<28;i++){const s=await state();if(s.jaxPass){await sleep(100);i--;continue}if(!s.dialogueActive)break;lines.push(s.dialogueText);await key('Space');await sleep(80)}
 assert.ok(lines.every(t=>!t.startsWith('Another day')));report.conversationLines=lines;
 const released=await until(async()=>{const s=await state();return s.entrancePhase==='done'&&s.ready&&s});
 check('Ragatha leaves, door remains open, Find Caine is active and player controls restore',()=>{assert.equal(released.ragatha.visible,false);assert.ok(Math.abs(released.doorAngle+Math.PI/2)<1e-8);assert.equal(released.objective.id,'find-caine')});
 await setLock(true);await until(async()=> (await state()).tutorialVisible);
 check('Controls tutorial unlocks only after successful morning conversation',()=>assert.equal(released.tutorial.unlocked,true));
 const aim=async p=>{const s=await state(),dx=p[0]-s.player[0],dz=p[2]-s.player[2],yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-p[1],Math.hypot(dx,dz));
 await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`);await sleep(150)};
 const route=released.ragatha.route,door=route.panelMin.map((v,i)=>(v+route.panelMax[i])/2);await aim(door);await key('KeyW');await sleep(220);await key('KeyW','keyup');await aim(door);
 await until(async()=> (await state()).focusedPrompt==='Exit to Hallway');await key('KeyE');
 const hall=await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready&&s});
 check('Normal E travel retains Find Caine and completes the controls tutorial',()=>{assert.equal(hall.objective.id,'find-caine');assert.equal(hall.tutorial.complete,true)});
 // Return through the actual anchored bedroom door to verify no replay.
 const returnDoor=hall.interactables.find(i=>i.prompt==="Enter Pomni's Room");await aim(returnDoor.center);await until(async()=> (await state()).focusedPrompt==="Enter Pomni's Room");await key('KeyE');
 const reentry=await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready&&s});
 check('Bedroom re-entry preserves settled blanket/objective without repeated invitation or Ragatha',()=>{assert.equal(reentry.phase,'done');assert.equal(reentry.entranceStarted,false);assert.equal(reentry.dialogueActive,false);assert.equal(reentry.ragathaCount,0);assert.equal(reentry.objective.id,'find-caine')});
 await click('#btn-home');await click('[data-story]');await until(async()=> (await state()).phase==='seated');await key('Escape');
 const cancelled=await until(async()=>{const s=await state();return s.ready&&s.phase==='done'&&s});
 check('Cancelling seated dialogue stands safely, awards no objective and keeps T retry available',()=>{assert.equal(cancelled.gameplayActorVisible,true);assert.equal(cancelled.objective,null);assert.equal(cancelled.morningDialoguePending,true);assert.equal(cancelled.dialogueActive,false);assert.equal(cancelled.tutorial.unlocked,false)});
 await setLock(true);await key('KeyT');await until(async()=> (await state()).dialogueActive);await key('Space');const retry=await state();assert.ok(retry.dialogueText.startsWith('Morning'));await key('Escape');
 await click('#btn-home');await click('[data-story]');await until(async()=> (await state()).phase==='seated');await key('KeyP');await click('#btn-home');await sleep(250);
 const disposed=await state();check('Home disposes a paused seated scene without delayed dialogue or resurrection',()=>{assert.equal(disposed.phase,null);assert.equal(disposed.dialogueActive,false);assert.equal(disposed.ready,false)});
 }else{
  await until(async()=> (await state()).phase==='playing');await click('#cinematic-skip');
  await until(async()=> (await state()).dialogueActive && await evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));
  const skipped=await state();
  check('Early Skip finishes R5 standing, retains final blanket and reaches standing invitation',()=>{assert.equal(skipped.time,7.5);assert.equal(skipped.gameplayActorVisible,true);assert.equal(skipped.cinematicSkinMeshes,0);assert.equal(skipped.objective,null)});
  await key('Escape');const cancelled=await until(async()=>{const s=await state();return s.ready&&s});
  check('Cancelling the skipped invitation retains a safe morning retry',()=>{assert.equal(cancelled.morningDialoguePending,true);assert.equal(cancelled.objective,null);assert.equal(cancelled.tutorial.unlocked,false)});
  await click('#btn-home');await click('[data-story]');await until(async()=> (await state()).phase==='playing');await click('#cinematic-skip');
  await until(async()=> (await state()).dialogueActive && await evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));await key('Space');
  await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');
  const greeting=await until(async()=>{const s=await state();return s.entrancePhase==='dialogue'&&s.dialogueActive&&s});
  check('Skipping entrance still gives one Ragatha and a standing Pomni before morning dialogue',()=>{assert.equal(greeting.phase,'done');assert.equal(greeting.ragathaCount,1);assert.equal(greeting.gameplayActorVisible,true);assert.equal(greeting.objective,null)});
  await key('Escape');await until(async()=> (await state()).entrancePhase==='exiting');await click('#cinematic-skip');
  const released=await until(async()=>{const s=await state();return s.ready&&s.entrancePhase==='done'&&s});
  check('Cancelled dialogue and skipped departure restore controls without premature objective/tutorial',()=>{assert.equal(released.morningDialoguePending,true);assert.equal(released.objective,null);assert.equal(released.tutorial.unlocked,false)});
  await click('#btn-home');
  ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Fetch.requestPaused')command('Fetch.failRequest',{requestId:r.params.requestId,errorReason:'Failed'}).catch(()=>{})});
  await command('Fetch.enable',{patterns:[{urlPattern:'*models/cinematics/*',requestStage:'Request'}]});await click('[data-story]');
  const failed=await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready&&s});
  check('Missing cinematic remains playable, with original cover and explicit morning retry',()=>{assert.equal(failed.phase,null);assert.equal(failed.staticCoverVisible,true);assert.equal(failed.gameplayActorVisible,true);assert.equal(failed.morningDialoguePending,true);assert.equal(failed.objective,null)});
  await command('Fetch.disable');await setLock(true);await key('KeyT');await until(async()=> (await state()).dialogueActive);
  for(let i=0;i<28&&(await state()).dialogueActive;i++){await key('Space');await sleep(75)}
  const recovered=await until(async()=>{const s=await state();return s.objective?.id==='find-caine'&&s});
  check('Morning retry after animation failure can complete and unlock Find Caine/tutorial',()=>{assert.equal(recovered.morningDialoguePending,false);assert.equal(recovered.tutorial.unlocked,true)});
 }
 assert.equal(errors.length,0,errors.join('\n'));report.pass=true;
}catch(error){report.failure=error.stack;try{report.lastState=await state();report.frameHistory=await evaluate('window.__choreographyFrames');await screenshot('failure')}catch{}console.error(error);console.log(JSON.stringify(report.lastState))}finally{
 fs.writeFileSync(path.join(output,process.argv.includes('--lifecycle-only')?'browser-lifecycle.json':'browser-verification.json'),JSON.stringify(report,null,2));
 if(ws?.readyState===1){try{await command('Browser.close')}catch{}ws.close()}browser.unref();
}
if(!report.pass)process.exitCode=1;

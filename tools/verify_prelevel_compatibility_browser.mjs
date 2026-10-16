// Native Chromium/CDP verification of the combined story; no test-only game controls.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const output=path.resolve('artifacts/prelevel-compatibility');fs.mkdirSync(output,{recursive:true});
const browser=spawn(process.env.CGV_BROWSER_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-background-networking',
 '--remote-debugging-port=9247','--window-size=1000,760','--force-device-scale-factor=1',
 '--user-data-dir='+path.join(os.tmpdir(),'prelevel-compatibility'),'about:blank',
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[];
const report={pass:false,checks:[],errors,optionalRequests:[]};
const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
async function evaluate(expression){const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value}
async function until(fn,limit=90000){const start=Date.now();while(Date.now()-start<limit){const value=await fn();if(value)return value;await sleep(100)}throw Error('Browser condition timed out')}
const state=()=>evaluate("import('/src/main.js').then(m=>m.getOpeningDiagnostics())");
const key=(code,type='keydown')=>evaluate(`window.dispatchEvent(new KeyboardEvent('${type}',{code:'${code}',key:'${code}',bubbles:true,cancelable:true}))`);
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const setLock=locked=>evaluate(locked?"Object.defineProperty(document,'pointerLockElement',{value:document.querySelector('canvas'),configurable:true});document.dispatchEvent(new Event('pointerlockchange'))":"delete document.pointerLockElement;document.dispatchEvent(new Event('pointerlockchange'))");
const check=(name,fn)=>{fn();report.checks.push(name);console.log('PASS',name)};
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'))}
async function aim(point){const s=await state(),dx=point[0]-s.player[0],dz=point[2]-s.player[2],yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-point[1],Math.hypot(dx,dz));await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`)}
async function finishDialogue(){for(let i=0;i<100;i++){const s=await state();if(s.jaxPass){await sleep(100);i--;continue}if(!s.dialogueActive)return;await key('Space');await sleep(60)}throw Error('Dialogue did not finish')}
async function verifySpeaking(){
 for(let i=0;i<10&&(await state()).dialogueSpeaker!=='pomni';i++){await key('Space');await sleep(70)}
 const a=await until(async()=>{const s=await state();return s.dialogueSpeaker==='pomni'&&s.pomniSpeaking.weight>.95&&s});
 await sleep(350);const b=await state();assert.ok(b.pomniSpeaking.joints.some((j,i)=>j.rotation.some((v,k)=>Math.abs(v-a.pomniSpeaking.joints[i].rotation[k])>.001)));
 await key('KeyP');await until(async()=> (await state()).paused);const frozen=(await state()).pomniSpeaking;await sleep(250);assert.deepEqual((await state()).pomniSpeaking,frozen);
 await key('KeyP');await until(async()=> !(await state()).paused);await screenshot('pomni-speaking');
 for(let i=0;i<8&&(await state()).dialogueSpeaker==='pomni';i++){await key('Space');await sleep(70)}
 await until(async()=> (await state()).pomniSpeaking.weight===0);
 check('Pomni gestures on her lines, pauses correctly and settles while Ragatha speaks',()=>{});
}
try{
 const target=await until(async()=>{try{return(await fetch('http://127.0.0.1:9247/json/list').then(r=>r.json())).find(t=>t.type==='page')}catch{return null}});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p?.reject(Error(r.error.message)):p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);else if(r.method==='Network.responseReceived'&&r.params.response.status>=400){const response=r.params.response,detail=response.status+' '+response.url;(new URL(response.url).pathname==='/favicon.ico'&&response.status===404?report.optionalRequests:errors).push(detail)}});
 await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Page.navigate',{url:'http://127.0.0.1:5173/'});
 await until(async()=> Boolean(await state()));
 // Observe in the render loop: external CDP polling can miss brief opening phases.
 await evaluate(`(async()=>{const m=await import('/src/main.js');window.__openingCaptions=[];
  function watch(){const s=m.getOpeningDiagnostics(),c=document.querySelector('#action-caption');
   if(c&&!c.hidden&&window.__openingCaptions.at(-1)?.text!==c.textContent)window.__openingCaptions.push({text:c.textContent,elapsed:s.openingElapsed});
   if(s.phase!=='seated')requestAnimationFrame(watch);
  }requestAnimationFrame(watch)})()`);
 await click('[data-story]');await until(async()=> (await state()).phase==='seated');
 report.openingCaptions=await evaluate('window.__openingCaptions');
 check('Opening keeps the short synchronized snoring and knocking captions',()=>{
  assert.ok(report.openingCaptions.some(c=>c.text==='Snoring…'&&c.elapsed<5));
  assert.ok(report.openingCaptions.some(c=>c.text==='Knock, knock, knock.'&&c.elapsed>=5));
 });
 await screenshot('seated-opening');await until(async()=> (await state()).dialogueActive);
 for(let i=0;i<8&&!(await state()).entranceStarted;i++){await key('Space');await sleep(70)}
 const arrival=await until(async()=>{const s=await state();return s.entrancePhase&&s});
 if(arrival.entrancePhase==='entering')await click('#cinematic-skip');
 const morning=await until(async()=>{const s=await state();return s.entrancePhase==='dialogue'&&s.dialogueActive&&s});
 check('Ragatha enters with the real hallway visible; no premature objective',()=>{assert.equal(morning.ragathaCount,1);assert.equal(morning.hallPreview.visible,true);assert.equal(morning.objective,null)});
 await verifySpeaking();
 await evaluate(`(async()=>{const m=await import('/src/main.js');window.__jaxReview=null;
  function watch(){const s=m.getOpeningDiagnostics();if(s.jaxPass?.visible&&s.jaxPass.elapsed>=1.1){
   window.__jaxReview={state:s,caption:document.querySelector('#action-caption').textContent};
   window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true}));return;
  }requestAnimationFrame(watch)}requestAnimationFrame(watch)})()`);
 for(let i=0;i<20&&!(await state()).jaxPass;i++){await key('Space');await sleep(70)}
 const capture=await until(()=>evaluate('window.__jaxReview'));const paused=await state();
 check('Jax uses the pocket-style strut and short caption with the conversation camera fixed',()=>{assert.equal(capture.caption,'Jax storms past.');assert.equal(capture.state.jaxPass.style,'sly');assert.deepEqual(paused.camera,morning.camera);assert.equal(paused.doorAngle,morning.doorAngle)});
 await key('KeyP');await screenshot('jax-storms-past');await until(async()=> (await state()).dialogueActive&&!(await state()).jaxPass);
 await finishDialogue();const leaving=await until(async()=>{const s=await state();return (s.entrancePhase==='exiting'||s.ready)&&s});
 if(leaving.entrancePhase==='exiting')await click('#cinematic-skip');
 const ready=await until(async()=>{const s=await state();return s.ready&&s});await setLock(true);
 check('Successful morning retains Find Caine and the existing controls tutorial',()=>{assert.equal(ready.objective.id,'find-caine');assert.equal(ready.tutorial.unlocked,true)});
 const bedroomDoor=ready.interactables.find(i=>i.prompt==='Exit to Hallway');await aim(bedroomDoor.center);await key('KeyW');await sleep(450);await key('KeyW','keyup');
 await aim(bedroomDoor.center);await until(async()=> (await state()).focusedPrompt==='Exit to Hallway');await key('KeyE');
 const hall=await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready&&s});await setLock(true);
 check('Teammate E travel enters Dorm Hall with delayed Caine, not a standing talk target',()=>{assert.equal(hall.objective.id,'find-caine');assert.equal(hall.tutorial.complete,true);assert.equal(hall.caineCount,0);assert.ok(hall.caineArrivalIn>0);assert.equal(hall.interactables.some(i=>i.prompt==='Talk to Caine'),false)});
 await setLock(false);const counter=(await state()).caineArrivalIn;await sleep(350);assert.equal((await state()).caineArrivalIn,counter);await setLock(true);
 await until(async()=>{const s=await state();return s.cutsceneActive&&s.dialogueActive&&s.dialogueSpeaker==='caine'});
 const warning=await state();await screenshot('teammate-caine-warning');
 check('Caine flies in and starts his warning automatically with a single model',()=>{assert.equal(warning.room,'dorm');assert.equal(warning.caineCount,1);assert.equal(warning.objective.id,'find-caine')});
 await key('Escape');await until(async()=> !(await state()).cutsceneActive);
 const cancelled=await state();check('Cancelling preserves Find Caine and schedules the teammate retry',()=>{assert.equal(cancelled.objective.id,'find-caine');assert.equal(cancelled.caineCount,0);assert.ok(cancelled.caineArrivalIn>0)});
 await until(async()=>{const s=await state();return s.cutsceneActive&&s.dialogueActive&&s.dialogueSpeaker==='caine'});await finishDialogue();
 const mission=await until(async()=>{const s=await state();return !s.cutsceneActive&&s.objective?.id==='find-ribbit'&&s.interactables.some(i=>i.prompt==='Knock')&&s});await screenshot('teammate-level1-handoff');
 check('Completing the warning starts Find Ribbit and Level 1 Knock in the same hall',()=>{assert.equal(mission.room,'dorm');assert.equal(mission.caineCount,0);assert.equal(mission.caineWarningComplete,true)});
 const back=mission.interactables.find(i=>i.prompt==="Enter Pomni's Room");await aim(back.center);await until(async()=> (await state()).focusedPrompt==="Enter Pomni's Room");await key('KeyE');
 const reentry=await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready&&s});
 check('Bedroom re-entry preserves Find Ribbit without repeating the opening or Ragatha',()=>{assert.equal(reentry.phase,'done');assert.equal(reentry.entranceStarted,false);assert.equal(reentry.ragathaCount,0);assert.equal(reentry.objective.id,'find-ribbit')});
 await click('#btn-home');await click('[data-story]');const fresh=await until(async()=>{const s=await state();return ['playing','seated'].includes(s.phase)&&s});
 check('New Game resets story state without duplicate captions or stale gestures',()=>{assert.equal(fresh.objective,null);assert.equal(fresh.pomniSpeaking.weight,0);assert.equal(fresh.caineCount,0)});
 assert.equal(await evaluate("document.querySelectorAll('#action-caption').length"),1);assert.deepEqual(errors,[]);report.pass=true;
}catch(error){report.failure=error.stack;try{report.lastState=await state();await screenshot('failure')}catch{}console.error(error)}
finally{fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(report,null,2));ws?.close();browser.kill();if(!report.pass)process.exitCode=1}

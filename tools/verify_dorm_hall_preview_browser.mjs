// Browser integration checks using installed Edge and native CDP, no npm install.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const output=path.resolve('artifacts/dorm-hall-preview');fs.mkdirSync(output,{recursive:true});
const browserExecutable=process.env.CGV_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(browserExecutable,[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions',
 '--remote-debugging-port=9241','--window-size=800,600','--force-device-scale-factor=1',
 '--user-data-dir='+path.join(os.tmpdir(),'dorm-hall-preview'),'about:blank',
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
 await evaluate("(()=>{const o=document.querySelector('#overlay');if(o)o.style.visibility='hidden'})()");
 const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'));
 await evaluate("(()=>{const o=document.querySelector('#overlay');if(o)o.style.visibility=''})()");
};
const setLock=async locked=>evaluate(locked
 ? "Object.defineProperty(document,'pointerLockElement',{value:document.querySelector('canvas'),configurable:true});document.dispatchEvent(new Event('pointerlockchange'))"
 : "delete document.pointerLockElement;document.dispatchEvent(new Event('pointerlockchange'))");
const check=(name,run)=>{run();report.checks.push(name);console.log('PASS',name)};

const settleInvitation=async()=>{
 const s=await until(async()=>{const s=await state();return ['playing','seated','blending','done'].includes(s.phase)&&s});
 if(s.phase==='playing')await click('#cinematic-skip');
 if(s.phase==='seated'){await key('Space');await key('Space');await key('Space')}
 await until(async()=> (await state()).dialogueActive&&await evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));
};
const finishConversation=async()=>{for(let i=0;i<28;i++){const s=await state();if(s.jaxPass){await sleep(100);i--;continue}if(!s.dialogueActive)break;await key('Space');await sleep(70)}};
const bench=async()=>evaluate(`new Promise(resolve=>{const stamps=[];let start;function frame(t){if(start===undefined)start=t;stamps.push(t);if(t-start<5000){requestAnimationFrame(frame);return}const d=stamps.slice(1).map((v,i)=>v-stamps[i]).sort((a,b)=>a-b);resolve({frames:d.length,seconds:(t-start)/1000,fps:d.length*1000/(t-start),medianMs:d[Math.floor(d.length*.5)],p95Ms:d[Math.floor(d.length*.95)]})}requestAnimationFrame(frame)})`);
const navigate=async suffix=>{await command('Page.navigate',{url:'http://127.0.0.1:5173/'+suffix});await until(async()=>Boolean(await state()))};
try{
 const target=await until(async()=>{const list=await fetch('http://127.0.0.1:9241/json/list').then(r=>r.json());return list.find(t=>t.type==='page')});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Browser disconnected'));pending.clear()});
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);if(r.error)p?.reject(Error(JSON.stringify(r.error)));else p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params.args.map(a=>a.value??a.description).join(' '))});
 await command('Runtime.enable');await command('Page.enable');
 if(!process.argv.includes('--review-only')&&!process.argv.includes('--fallback-only')&&!process.argv.includes('--perf-only')&&!process.argv.includes('--in-game-perf-only')){
 // Same story, camera and mirrors, with only the optional view disabled.
 await navigate('?hallPreview=0');await click('[data-story]');await settleInvitation();await key('Space');
 await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');await until(async()=> (await state()).entrancePhase==='dialogue');await sleep(800);
 report.baseline={state:await state(),frameTiming:await bench()};check('Fallback baseline retains bedroom mirrors and staged entrance',()=>{assert.equal(report.baseline.state.hallPreview,null);assert.ok(report.baseline.state.bedroomMirrorCount>=2)});
 await navigate('');const loadStart=Date.now();await click('[data-story]');await settleInvitation();
 const closed=await state();report.initialLoad={wallMilliseconds:Date.now()-loadStart,metrics:closed.hallPreview};
 check('Real preview loads within budget at native scale with local geometry only',()=>{assert.ok(closed.hallPreview,closed.hallPreviewError);assert.equal(closed.hallPreview.sourceBytes,30115128);assert.ok(closed.hallPreview.triangles<55000);assert.equal(closed.hallPreview.visible,false)});
 await screenshot('door-closed');
 // Capture a real rendered crossing using the supported pause input.
 await evaluate(`(async()=>{const m=await import('/src/main.js');window.__hallCrossing=null;function watch(){const s=m.getOpeningDiagnostics();if(s.entrancePhase==='entering'&&s.ragatha?.stage==='walking-in'&&s.ragatha.position[2]<3.55&&s.ragatha.position[2]>2.9){window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true}));window.__hallCrossing=m.getOpeningDiagnostics();return}if(!s.entranceStarted||s.entrancePhase==='entering')requestAnimationFrame(watch)}requestAnimationFrame(watch)})()`);
 await key('Space');const crossing=await until(()=>evaluate('window.__hallCrossing'));await screenshot('ragatha-crossing');
 check('Ragatha crosses the original opening with real hall visible and no duplicate actor',()=>{assert.equal(crossing.hallPreview.visible,true);assert.equal(crossing.ragathaCount,1);assert.ok(Math.abs(crossing.doorAngle+Math.PI/2)<1e-8)});
 await key('KeyP');await until(async()=> (await state()).entrancePhase==='dialogue');await key('Space');await screenshot('door-open-hallway');await sleep(800);
 report.preview={state:await state(),frameTiming:await bench()};
 check('Bedroom mirror count and original objective/dialogue gating are preserved',()=>{assert.equal(report.preview.state.bedroomMirrorCount,report.baseline.state.bedroomMirrorCount);assert.equal(report.preview.state.objective,null);assert.equal(report.preview.state.ready,false)});
 await finishConversation();const released=await until(async()=>{const s=await state();return s.ready&&s.entrancePhase==='done'&&s});
 check('Door stays open after Ragatha leaves, with Find Caine and normal gameplay restored',()=>{assert.equal(released.hallPreview.visible,true);assert.equal(released.objective.id,'find-caine');assert.equal(released.ragatha.visible,false)});
 await setLock(true);
 const aim=async p=>{const s=await state(),dx=p[0]-s.player[0],dz=p[2]-s.player[2],yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-p[1],Math.hypot(dx,dz));await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`);await sleep(150)};
 const route=released.ragatha.route,door=route.panelMin.map((v,i)=>(v+route.panelMax[i])/2);
 await aim(door);await key('KeyW');await sleep(700);await key('KeyW','keyup');const boundary=await state();
 check('Player remains inside bedroom bounds until E travel',()=>{assert.equal(boundary.room,'pomni');assert.ok(boundary.player[2]<=3.134)});
 await aim(door);await until(async()=> (await state()).focusedPrompt==='Exit to Hallway');await key('KeyE');
 const hall=await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready&&s});await screenshot('gameplay-dorm-hall');
 check('One E loads real playable Dorm Hall with Caine and preserved objective',()=>{assert.equal(hall.hallPreview,null);assert.equal(hall.objective.id,'find-caine');assert.ok(hall.interactables.some(i=>i.prompt==='Talk to Caine'))});
 const targetDoor=hall.interactables.find(i=>i.prompt==="Enter Pomni's Room");await aim(targetDoor.center);await until(async()=> (await state()).focusedPrompt==="Enter Pomni's Room");await key('KeyE');
 const reentry=await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready&&s});
 check('Re-entry keeps settled R5 and Find Caine without replaying entrance',()=>{assert.equal(reentry.phase,'done');assert.equal(reentry.entranceStarted,false);assert.equal(reentry.ragathaCount,0);assert.equal(reentry.objective.id,'find-caine')});
 // Render/load/unload the same setup three times, after an initial warm-up.
 report.reloads=[];
 for(let i=0;i<3;i++){
  await click('#btn-home');await click('[data-story]');await settleInvitation();await key('Space');await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');await until(async()=> (await state()).entrancePhase==='dialogue');await sleep(500);report.reloads.push(await state());
 }
 check('Repeated rendered previews do not accumulate GPU geometries/textures or duplicate Ragatha',()=>{const a=report.reloads[1],b=report.reloads[2];assert.equal(a.memory.geometries,b.memory.geometries);assert.equal(a.memory.textures,b.memory.textures);assert.equal(b.ragathaCount,1)});
 }
 if(process.argv.includes('--fallback-only')){
  await navigate('');
  ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.method==='Fetch.requestPaused')command('Fetch.failRequest',{requestId:r.params.requestId,errorReason:'Failed'}).catch(()=>{})});
  await command('Fetch.enable',{patterns:[{urlPattern:'*models/world/dorm-hall-v7.glb',requestStage:'Request'}]});
  await click('[data-story]');await settleInvitation();const failed=await state();await command('Fetch.disable');
  assert.equal(failed.hallPreview,null);assert.ok(failed.hallPreviewError);
  await key('Space');await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');await until(async()=> (await state()).entrancePhase==='dialogue');await screenshot('fallback-vestibule');
  await finishConversation();await until(async()=> (await state()).entrancePhase==='exiting');await click('#cinematic-skip');const recovered=await until(async()=>{const s=await state();return s.ready&&s});
  check('Optional hall download failure restores the original vestibule and completes story/objective normally',()=>{assert.equal(recovered.objective.id,'find-caine');assert.equal(recovered.ragathaCount,1);assert.equal(recovered.hallPreview,null)});
 }else if(process.argv.includes('--in-game-perf-only')){
  await navigate('');await click('[data-story]');await settleInvitation();await key('Space');await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');await until(async()=> (await state()).entrancePhase==='dialogue');await key('Space');
  report.sameSceneBenchmarks=[];
  for(const enabled of [false,true,false,true]){
   assert.equal(await evaluate(`import('/src/main.js').then(m=>m.setDormHallPreviewForReview(${enabled}))`),true);
   await sleep(1000);const timing=await bench();const s=await state();report.sameSceneBenchmarks.push({enabled,...timing,memory:s.memory,mirrors:s.bedroomMirrorCount});console.log('PERF',JSON.stringify(report.sameSceneBenchmarks.at(-1)));
  }
  check('Same live conversation and two mirrors measured with preview off/on twice',()=>{assert.equal(report.sameSceneBenchmarks.length,4);assert.ok(report.sameSceneBenchmarks.every(s=>s.mirrors===2))});
 }else{
 // Deterministic closed/half/open/closed review with the real room, aperture and hinge.
 await navigate('');await click('#btn-home');await click('#btn-room-previews');
 await evaluate("import('/tools/pomniDoorReview.js').then(async m=>{window.__doorReview=await m.createDoorReview()})");
 report.doorPoses=[];for(const [name,fraction] of [['review-closed',0],['door-halfway',.5],['review-open',1],['review-reclosed',0]]){
  const pose=await evaluate(`window.__doorReview.pose(${fraction})`);report.doorPoses.push(pose);await screenshot(name);
 }
 check('Original door closes to its original transform after half/full opening with frame stationary',()=>{assert.deepEqual(report.doorPoses[0].slab,report.doorPoses[3].slab);for(const p of report.doorPoses)assert.deepEqual(p.frame,report.doorPoses[0].frame)});
 await evaluate('window.__doorReview.pose(1)');
 const viewpoints=[];for(const [name,offset] of [['hall-left',-1.6],['hall-right',1.6]]){viewpoints.push(await evaluate(`window.__doorReview.view(${offset})`));await screenshot(name)}
 check('Actual 3D hallway supports distinct oblique viewpoints through the original aperture',()=>assert.notDeepEqual(viewpoints[0],viewpoints[1]));
 }
 if(process.argv.includes('--perf-only')){
  await evaluate('window.__doorReview.cameraPose([1.8008427858,2.2,-2.6268147945],[-.124578,1.2,.1215183])');
  report.sameSceneBenchmarks=[];
  for(const enabled of [false,true,false,true]){
   const result=await evaluate(`new Promise(resolve=>{const samples=[];let first,warm=0;function frame(t){window.__doorReview.renderPreview(${enabled});if(warm++<15){requestAnimationFrame(frame);return}if(first===undefined)first=t;samples.push(t);if(t-first<5000){requestAnimationFrame(frame);return}const d=samples.slice(1).map((v,i)=>v-samples[i]).sort((a,b)=>a-b);resolve({enabled:${enabled},frames:d.length,seconds:(t-first)/1000,fps:d.length*1000/(t-first),medianMs:d[Math.floor(d.length*.5)],p95Ms:d[Math.floor(d.length*.95)]})}requestAnimationFrame(frame)})`);
   report.sameSceneBenchmarks.push(result);console.log('PERF',JSON.stringify(result));
  }
 }
 assert.equal(errors.length,0,errors.join('\n'));report.pass=true;
}catch(error){report.failure=error.stack;try{report.lastState=await state();await screenshot('failure')}catch{}console.error(error)}finally{
 fs.writeFileSync(path.join(output,process.argv.includes('--in-game-perf-only')?'browser-in-game-performance.json':process.argv.includes('--perf-only')?'browser-performance.json':process.argv.includes('--fallback-only')?'browser-fallback-validation.json':process.argv.includes('--review-only')?'browser-review-validation.json':'browser-validation.json'),JSON.stringify(report,null,2));
 if(ws?.readyState===1){try{await command('Browser.close')}catch{}ws.close()}browser.unref();
}
if(!report.pass)process.exitCode=1;

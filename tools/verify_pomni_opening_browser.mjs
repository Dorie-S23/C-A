// Browser integration checks using installed Edge and native CDP, no npm install.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const output=path.resolve('artifacts/pomni-opening');fs.mkdirSync(output,{recursive:true});
const browserExecutable=process.env.CGV_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(browserExecutable,[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions',
 '--remote-debugging-port=9235','--window-size=800,600','--force-device-scale-factor=1',
 '--user-data-dir='+path.join(os.tmpdir(),'pomni-opening-integration'),'about:blank',
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
let entranceVisits=0;
const invitation=async()=>{
 await until(async()=>{const s=await state();return s.phase==='done'&&s.dialogueActive});
 await until(()=>evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));
 const line=await evaluate("({text:document.querySelector('#dialogue-text').textContent,speaker:document.querySelector('#dialogue-name').textContent})");
 check('Standing Pomni displays Come in through the existing dialogue UI',()=>{assert.equal(line.text,'Come in.');assert.equal(line.speaker,'Pomni')});
 await key('Space');
 await until(async()=> (await state()).entrancePhase==='entering');
 entranceVisits++;
 if(entranceVisits===1){
  await until(async()=>{const s=await state();return s.entranceElapsed>1.15&&s.entranceElapsed<2.8});
  await key('Escape');const entering=await state();report.snapshots.push({stage:'entrance-paused',...entering});await screenshot('ragatha-door-paused');
  await key('KeyW');await key('KeyE');await sleep(500);await key('KeyW','keyup');const frozenEntrance=await state();
  check('Entrance pause freezes door, clock, player and temporary audio',()=>{assert.equal(entering.ready,false);assert.equal(entering.paused,true);assert.ok(Math.abs(entering.doorAngle)>0);assert.equal(frozenEntrance.entranceElapsed,entering.entranceElapsed);assert.equal(frozenEntrance.doorAngle,entering.doorAngle);assert.deepEqual(frozenEntrance.player,entering.player);assert.equal(frozenEntrance.room,'pomni');assert.ok(frozenEntrance.entranceSounds.every(s=>!s.playing))});
  await click('#btn-resume');
  await until(async()=>{const s=await state();return s.ragatha?.stage==='walking-in'&&s.ragatha.position[2]<3.1&&s.ragatha.position[2]>1.7});
  const walkingIn=await state();report.snapshots.push({stage:'ragatha-entering',...walkingIn});
  check('One real Ragatha walks through the measured doorway before dialogue',()=>{assert.equal(walkingIn.ragathaCount,1);assert.equal(walkingIn.ragatha.visible,true);assert.equal(walkingIn.dialogueActive,false);assert.equal(walkingIn.ready,false);assert.ok(walkingIn.doorAngle<-1.5)});
  await screenshot('ragatha-3d-entering');
 }else await click('#cinematic-skip');
 await until(async()=>{const s=await state();return s.entrancePhase==='dialogue'&&s.dialogueActive});
 const morning=await state();
 check('3D arrival launches morning dialogue after greeting with controls blocked',()=>{assert.equal(morning.objective,null);assert.equal(morning.objectiveVisible,false);assert.equal(morning.ready,false);assert.ok(Math.abs(morning.doorAngle+Math.PI/2)<1e-8);assert.ok(morning.entranceSounds.every(s=>!s.playing));assert.equal(morning.ragathaCount,1);assert.equal(morning.ragatha.visible,true);assert.equal(morning.ragatha.stage,'greeting')});
 if(entranceVisits===1){
  await until(()=>evaluate("document.querySelector('#dialogue-text').textContent==='Another day trapped in a nightmare circus run by a sentient cartoon. Same as yesterday.'"));
  await key('Space');
  await until(()=>evaluate("document.querySelector('#dialogue-name').textContent==='Ragatha'"));
  const portrait=await evaluate("document.querySelector('#dialogue-portrait-right img')?.getAttribute('src')");
  check('Ragatha uses her registered portrait in the existing dialogue UI',()=>assert.ok(portrait?.endsWith('Ragatha.webp')));
  await screenshot('ragatha-morning-dialogue');
  await screenshot('ragatha-3d-talking');
 }
 if(entranceVisits===2){
  await key('Escape');
  const cancelledMorning=await state();
  check('Cancelling morning dialogue begins safe 3D departure',()=>{assert.equal(cancelledMorning.dialogueActive,false);assert.equal(cancelledMorning.entrancePhase,'exiting');assert.equal(cancelledMorning.ready,false)});
 }else{
  for(let i=0;i<24&&(await state()).dialogueActive;i++){await key('Space');await sleep(65)}
 }
 if(entranceVisits===1){
  await until(async()=>{const s=await state();return s.ragatha?.stage==='walking-out'&&s.ragatha.position[2]>1.7&&s.ragatha.position[2]<3.1});
  await key('Escape');const departing=await state();await screenshot('ragatha-3d-leaving');report.snapshots.push({stage:'ragatha-leaving',...departing});await sleep(450);
  const frozenDeparture=await state();check('Ragatha departure pauses with the door and retains camera ownership',()=>{assert.equal(departing.ready,false);assert.equal(departing.entrancePhase,'exiting');assert.deepEqual(frozenDeparture.ragatha.position,departing.ragatha.position);assert.equal(frozenDeparture.doorAngle,departing.doorAngle);assert.ok(frozenDeparture.entranceSounds.every(s=>!s.playing))});
  await click('#btn-resume');
 }
 const released=await until(async()=>{const s=await state();return s.entrancePhase==='done'&&s.ready&&s});
 check('Ragatha leaves before gameplay restoration and is no longer visible',()=>{assert.equal(released.ragatha.visible,false);assert.equal(released.ragathaCount,1)});
 check('Conversation releases camera and leaves the E door open',()=>{if(entranceVisits===2){assert.equal(released.objective,null);assert.equal(released.morningDialoguePending,true)}else{assert.equal(released.objective?.id,'find-caine');assert.equal(released.morningDialoguePending,false)}assert.equal(released.dialogueActive,false);assert.ok(Math.abs(released.doorAngle+Math.PI/2)<1e-8);assert.equal(released.entranceSounds.length,0)});
};
try{
 const target=await until(async()=>{const list=await fetch('http://127.0.0.1:9235/json/list').then(r=>r.json());return list.find(t=>t.type==='page')});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Browser disconnected'));pending.clear()});
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);if(r.error)p?.reject(Error(JSON.stringify(r.error)));else p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params.args.map(a=>a.value??a.description).join(' '))});
 await command('Runtime.enable');await command('Page.enable');await command('Page.navigate',{url:'http://127.0.0.1:5173/'});
 await until(async()=>Boolean(await state()));
 await evaluate("window.__invitationCount=0;window.addEventListener('pomni:invitation-complete',()=>window.__invitationCount++)");
 report.gpu=await evaluate(`(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'Unavailable'})()`);
 // The same New Game handler is used by PLAY and the fallback preview menu.
 await evaluate(`new MutationObserver(function(_,observer){if(!document.querySelector('#cinematic-skip').hidden){observer.disconnect();window.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',key:'Escape'}))}}).observe(document.querySelector('#cinematic-skip'),{attributes:true,attributeFilter:['hidden']})`);
 await click('[data-story]');
 await until(async()=>{const s=await state();return s.phase==='playing'&&s.paused&&s});
 const sleeping=await state();report.snapshots.push({stage:'sleeping',...sleeping});await screenshot('sleeping-paused');
 check('Sleeping uses R5 only, with static cover hidden and controls blocked',()=>{assert.equal(sleeping.caineWarningComplete,false);assert.equal(sleeping.objective,null);assert.equal(sleeping.objectiveVisible,false);assert.equal(sleeping.phase,'playing');assert.equal(sleeping.lighting,'SLEEPING');assert.equal(sleeping.gameplayActorVisible,false);assert.equal(sleeping.staticCoverVisible,false);assert.equal(sleeping.cinematicSkinMeshes,24);assert.equal(sleeping.ready,false);assert.equal(sleeping.paused,true)});
 await key('KeyW');await key('KeyE');await sleep(5500);await key('KeyW','keyup');const frozen=await state();check('Long pause freezes animation/player and stops all scheduled sounds',()=>{assert.equal(frozen.time,sleeping.time);assert.deepEqual(frozen.player,sleeping.player);assert.equal(frozen.room,'pomni');assert.ok(frozen.openingSounds.every(s=>!s.playing))});
 await click('#btn-resume');
 const audible=await until(async()=>{const s=await state();return s.openingElapsed>1&&s.openingElapsed<5&&s});
 check('Temporary audio resumes after a long pause with three door-positioned knocks',()=>{
  assert.equal(audible.audioContextState,'running');assert.equal(audible.openingSounds.length,4);assert.ok(audible.openingSounds[0].playing);
  const knocks=audible.openingSounds.slice(1);assert.ok(knocks.every(s=>s.playing));assert.ok(Math.abs(knocks[1].scheduledAt-knocks[0].scheduledAt-.22)<1e-6);assert.ok(Math.abs(knocks[2].scheduledAt-knocks[0].scheduledAt-.44)<1e-6);
  assert.deepEqual(knocks[0].position,audible.interactables[0].center);
 });
 const waking=await until(async()=>{const s=await state();return s.openingElapsed>=5.75&&s.phase==='playing'&&s});report.snapshots.push({stage:'after-knocks',...waking});
 if(waking.audioContextTime>=waking.openingSounds[0].scheduledAt+5.1){
  check('Native audio ends snoring at the knock',()=>assert.equal(waking.openingSounds[0].playing,false));
 }else{
  report.audioLimitation='Headless native audio clock did not advance with rendering. Exact stop/scheduling is covered by the deterministic Audio tests; audible playback needs an interactive browser.';
  console.log('LIMITATION',report.audioLimitation);
 }
 check('Waking uses original source timing and lighting',()=>{assert.equal(waking.lighting,'WAKING');assert.ok(Math.abs(waking.time-(1.4+waking.openingElapsed-5))<1e-8)});
 await until(async()=>{const s=await state();return s.phase==='playing'&&s.time>=3.4});
 await key('Escape');report.snapshots.push({stage:'sitting',...await state()});await screenshot('sitting-paused');await click('#btn-resume');
 await invitation();
 const natural=await until(async()=>{const s=await state();return s.phase==='done'&&s.ready&&s});report.snapshots.push({stage:'natural',...natural});await screenshot('gameplay-handoff');
 const invitationCount=await evaluate('window.__invitationCount');
 check('Invitation hook fires once on acknowledgement',()=>assert.equal(invitationCount,1));
 check('Natural endpoint restores gameplay actor and retains only final blanket',()=>{assert.equal(natural.completed,true);assert.equal(natural.cinematicSkinMeshes,0);assert.equal(natural.gameplayActorVisible,true);assert.equal(natural.staticCoverVisible,false);assert.equal(natural.lighting,'GAMEPLAY');assert.ok(Math.abs(natural.player[0]+1.05000058)<1e-5);assert.ok(Math.abs(natural.actorYaw-Math.PI/2)<1e-6)});
 // Exercise real pointer-lock movement after the handoff.
 report.pointer_lock='Headless Edge rejected native pointer capture; a synthetic ownership event exercises the game input branches. Real mouse capture still requires interactive browser confirmation.';
 await setLock(true);await until(async()=> (await state()).locked);
 const activeObjective=await until(async()=>{const s=await state();return s.objectiveVisible&&s});
 await until(async()=> (await state()).tutorialVisible);
 const initialTips=await state();await sleep(1100);const idleTips=await state();
 check('Tutorial begins at gameplay handoff and idle time teaches no inputs',()=>{assert.equal(initialTips.tutorial.unlocked,true);assert.equal(initialTips.tutorial.moved,false);assert.equal(initialTips.tutorial.looked,false);assert.deepEqual(idleTips.tutorial,initialTips.tutorial)});
 await command('Emulation.setDeviceMetricsOverride',{width:320,height:700,deviceScaleFactor:1,mobile:false});await sleep(200);
 const tipsLayout=await evaluate("(()=>{const t=document.querySelector('#tutorial-hud').getBoundingClientRect(),o=document.querySelector('#objective-hud').getBoundingClientRect();return {inside:t.left>=0&&t.right<=innerWidth&&t.bottom<=innerHeight,overlap:!(t.right<=o.left||t.left>=o.right||t.bottom<=o.top||t.top>=o.bottom),text:document.querySelector('[data-tutorial-lines]').textContent}})()");
 check('Small-screen tutorial is readable and separate from the objective',()=>{assert.equal(tipsLayout.inside,true);assert.equal(tipsLayout.overlap,false);assert.ok(tipsLayout.text.includes('WASD'));assert.ok(tipsLayout.text.includes('Mouse'))});
 await screenshot('tutorial-bedroom-narrow');await command('Emulation.clearDeviceMetricsOverride');
 check('Find Caine appears only after successful morning dialogue and gameplay begins',()=>{assert.equal(activeObjective.objective.title,'Find Caine');assert.equal(activeObjective.entrancePhase,'done')});
 await screenshot('objective-bedroom');
 await click('#controls-btn');await sleep(150);
 await evaluate("(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:80});document.dispatchEvent(e)})()");
 const menuTips=await state();check('Controls overlay hides tips and ignores mouse learning',()=>{assert.equal(menuTips.tutorialVisible,false);assert.equal(menuTips.tutorial.looked,false)});
 const controlsObjective=await state();check('Controls menu hides the objective without clearing it',()=>{assert.equal(controlsObjective.objectiveVisible,false);assert.equal(controlsObjective.objective.id,'find-caine')});await click('#controls-close');
 await key('Escape');const pausedObjective=await state();
 // Synthetic pointer ownership is released explicitly, matching native Escape.
 await setLock(false);await until(async()=> !(await state()).objectiveVisible);
 const pausedHUD=await state();check('Pause hides objective while preserving progress',()=>{assert.equal(pausedObjective.objective.id,'find-caine');assert.equal(pausedHUD.objectiveVisible,false);assert.equal(pausedHUD.paused,true)});
 assert.equal(pausedHUD.tutorialVisible,false);
 await setLock(true);await until(async()=> (await state()).objectiveVisible);
 const startMove=await state();await key('KeyW');await sleep(345);await key('KeyW','keyup');const moved=await state();
 check('Movement works after the camera handoff',()=>assert.ok(Math.hypot(moved.player[0]-startMove.player[0],moved.player[2]-startMove.player[2])>.1));
 check('Actual walking completes only the movement lesson',()=>{assert.equal(moved.tutorial.moved,true);assert.equal(moved.tutorial.looked,false);assert.equal(moved.tutorial.ran,false)});
 await evaluate("(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:60});document.dispatchEvent(e)})()");await sleep(100);
 const runTips=await state();const runText=await evaluate("document.querySelector('[data-tutorial-lines]').textContent");
 check('Accepted mouse-look introduces running after movement',()=>{assert.equal(runTips.tutorial.looked,true);assert.equal(runTips.tutorial.ran,false);assert.ok(runText.includes('Hold Shift'))});
 await screenshot('tutorial-run');
 const aimDoor=async()=>{
  const s=await state(),p=s.interactables[0].center,dx=p[0]-s.player[0],dz=p[2]-s.player[2];
  const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-p[1],Math.hypot(dx,dz));
  await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`);
  await until(()=>evaluate("!document.querySelector('#prompt').hidden"),10000);
 };
 await aimDoor();await sleep(100);
 const doorTips=await evaluate("document.querySelector('[data-tutorial-lines]').textContent");
 check('Door hint takes priority while running remains optional',()=>{assert.ok(doorTips.includes('Press E'));assert.equal(runTips.tutorial.ran,false)});
 await screenshot('tutorial-door');await key('KeyE');const dorm=await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready&&s},120000);
 check('One normal E enters Dorm, finishes tutorial without running and retains Find Caine',()=>{assert.equal(dorm.tutorial.complete,true);assert.equal(dorm.tutorial.interacted,true);assert.equal(dorm.tutorial.ran,false);assert.equal(dorm.tutorialVisible,false);assert.equal(dorm.objective.id,'find-caine')});
 check('Existing E door travels from the bedroom into the Dorm Hall',()=>{assert.equal(dorm.phase,null);assert.equal(dorm.objective?.id,'find-caine')});
 await until(async()=> (await state()).objectiveVisible);
 const hudLayout=await evaluate("(()=>{const h=document.querySelector('#objective-hud').getBoundingClientRect(),m=document.querySelector('#minimap').getBoundingClientRect();return {hud:h.toJSON(),map:m.toJSON(),overlap:!(h.right<=m.left||h.left>=m.right||h.bottom<=m.top||h.top>=m.bottom)}})()");
 check('Dorm Hall keeps the objective visible beside its minimap',()=>assert.equal(hudLayout.overlap,false));
 await screenshot('objective-dorm-hall');
 await command('Emulation.setDeviceMetricsOverride',{width:500,height:700,deviceScaleFactor:1,mobile:false});await sleep(250);
 const narrowLayout=await evaluate("(()=>{const h=document.querySelector('#objective-hud').getBoundingClientRect(),m=document.querySelector('#minimap').getBoundingClientRect();return {inside:h.left>=0&&h.right<=innerWidth,below:h.top>=m.bottom}})()");
 check('Narrow-screen objective remains readable below the minimap',()=>{assert.equal(narrowLayout.inside,true);assert.equal(narrowLayout.below,true)});
 await screenshot('objective-dorm-narrow');await command('Emulation.clearDeviceMetricsOverride');
 // Story Caine uses the teammate's delayed arrival, not a waiting E target.
 const aimCaine=async()=>{
  const s=await state(),a=s.interactables.find(i=>i.prompt==='Talk to Caine').anchor;
  const dx=a[0]-s.player[0],dz=a[2]-s.player[2],yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-(a[1]+1.35),Math.hypot(dx,dz));
  await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`);await sleep(200);
 };
 check('Story hall has no waiting Talk to Caine target',()=>assert.equal(dorm.interactables.some(i=>i.prompt==='Talk to Caine'),false));
 await until(async()=> (await state()).dialogueActive);const speaking=await state();
 await key('KeyE');await key('KeyE');await key('KeyW');
 await evaluate("(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:120});Object.defineProperty(e,'movementY',{value:60});document.dispatchEvent(e)})()");
 await sleep(400);await key('KeyW','keyup');const frozenCaine=await state();
 check('Caine arrives automatically; warning stays in Dorm Hall with movement/look/E blocked',()=>{assert.equal(frozenCaine.room,'dorm');assert.equal(frozenCaine.dialogueActive,true);assert.equal(frozenCaine.cutsceneActive,true);assert.equal(frozenCaine.objectiveVisible,false);assert.deepEqual(frozenCaine.player,speaking.player);assert.equal(frozenCaine.cameraYaw,speaking.cameraYaw);assert.equal(frozenCaine.cameraPitch,speaking.cameraPitch);assert.equal(frozenCaine.caineWarningComplete,false)});
 const cainePortrait=await evaluate("document.querySelector('#dialogue-portrait-right img')?.getAttribute('src')");assert.ok(cainePortrait.endsWith('Caine.webp'));await screenshot('caine-warning-dialogue');
 await key('Escape');await until(async()=> !(await state()).dialogueActive && !(await state()).cutsceneActive);const cancelledCaine=await state();
 check('Cancelling Caine preserves Find Caine and permits retry',()=>{assert.equal(cancelledCaine.objective.id,'find-caine');assert.equal(cancelledCaine.caineConversationBusy,false);assert.equal(cancelledCaine.caineWarningComplete,false);assert.equal(cancelledCaine.ready,true)});
 await until(async()=> (await state()).dialogueActive && (await state()).dialogueSpeaker==='caine');
 for(let i=0;i<32&&(await state()).dialogueActive;i++){await key('Space');await sleep(65)}
 const mission=await until(async()=>{const s=await state();return s.objective?.id==='find-ribbit'&&s.objectiveVisible&&s});
 report.snapshots.push({stage:'caine-mission',...mission});
 check('Completing Caine warning starts Level 1 at Ribbit’s door',()=>{assert.equal(mission.caineWarningComplete,true);assert.equal(mission.cutsceneActive,false);assert.equal(mission.room,'dorm');assert.ok(mission.interactables.some(i=>i.prompt==='Knock'))});
 await screenshot('find-ribbit-objective');
 await aimDoor();await key('KeyE');const returned=await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready&&s},120000);
 report.snapshots.push({stage:'dorm-return',...returned});
 check('Bedroom re-entry preserves finished tutorial',()=>{assert.equal(returned.tutorial.complete,true);assert.equal(returned.tutorialVisible,false)});
 check('Dorm return preserves the settled blanket and does not replay R5',()=>{assert.equal(returned.phase,'done');assert.equal(returned.cinematicSkinMeshes,0);assert.deepEqual(returned.blanketWeights,natural.blanketWeights);assert.equal(returned.lighting,'GAMEPLAY');assert.equal(returned.entranceStarted,false);assert.equal(returned.entrancePhase,null);assert.equal(returned.objective?.id,'find-ribbit')});
 await aimDoor();await key('KeyE');await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready});
 const revisit=await state();check('Dorm reload preserves Find Ribbit and contains one disabled Caine target',()=>{assert.equal(revisit.objective.id,'find-ribbit');assert.equal(revisit.caineWarningComplete,true);assert.equal(revisit.interactables.filter(i=>i.prompt==='Talk to Caine').length,1);assert.equal(revisit.interactables.find(i=>i.prompt==='Talk to Caine').enabled,false)});
 await aimCaine();await key('KeyE');assert.equal((await state()).dialogueActive,false);await aimDoor();await until(async()=> (await state()).focusedPrompt==="Enter Pomni's Room");await key('KeyE');await until(async()=>{const s=await state();return s.room==='pomni'&&s.ready});
 await setLock(false);await until(async()=>(await state()).paused);
 await click('#btn-home');await click('[data-story]');await until(async()=> ['playing','blending','done'].includes((await state()).phase));await click('#cinematic-skip');
 await invitation();
 const skipped=await until(async()=>{const s=await state();return s.phase==='done'&&s.ready&&s});report.snapshots.push({stage:'skip',...skipped});
 check('New game resets tutorial; cancelled morning never unlocks it',()=>{assert.equal(skipped.tutorial.unlocked,false);assert.equal(skipped.tutorial.complete,false);assert.equal(skipped.tutorial.dismissed,false);assert.equal(skipped.tutorialVisible,false)});
 check('Skip returns the identical safe state as natural completion',()=>{assert.deepEqual(skipped.blanketWeights,natural.blanketWeights);assert.deepEqual(skipped.player,natural.player);assert.equal(skipped.actorYaw,natural.actorYaw);assert.equal(skipped.staticCoverVisible,false);assert.equal(skipped.cinematicSkinMeshes,0)});
 // Cancelled morning conversation is recoverable without replaying any cinematic.
 await setLock(true);await key('KeyT');await until(async()=> (await state()).dialogueActive);
 const retry=await state();check('T retries cancelled morning dialogue without awarding an objective or replaying entrance',()=>{assert.equal(retry.objective,null);assert.equal(retry.objectiveVisible,false);assert.equal(retry.entrancePhase,'done')});
 await key('Escape');await until(async()=> !(await state()).dialogueActive);
 const retryCancelled=await state();check('Repeated cancellation leaves gameplay and retry available',()=>{assert.equal(retryCancelled.ready,true);assert.equal(retryCancelled.morningDialoguePending,true);assert.equal(retryCancelled.objective,null)});
 await key('KeyT');await until(async()=> (await state()).dialogueActive);
 for(let i=0;i<24&&(await state()).dialogueActive;i++){await key('Space');await sleep(65)}
 const retrySuccess=await until(async()=>{const s=await state();return s.objectiveVisible&&s});
 check('Completing a retry activates Find Caine exactly once',()=>{assert.equal(retrySuccess.objective.id,'find-caine');assert.equal(retrySuccess.morningDialoguePending,false);assert.equal(retrySuccess.entrancePhase,'done')});
 await until(async()=> (await state()).tutorialVisible);
 await key('KeyW');await sleep(345);await key('KeyW','keyup');
 await evaluate("(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:60});document.dispatchEvent(e)})()");
 await key('ShiftLeft');await key('KeyS');await sleep(250);await key('KeyS','keyup');await key('ShiftLeft','keyup');await sleep(100);
 const learnedRun=await state();check('Actual Shift movement completes optional run lesson',()=>assert.equal(learnedRun.tutorial.ran,true));
 await key('KeyX');await sleep(100);const dismissedTips=await state();
 check('X dismisses tips without changing objective or gameplay',()=>{assert.equal(dismissedTips.tutorial.dismissed,true);assert.equal(dismissedTips.tutorialVisible,false);assert.equal(dismissedTips.objective.id,'find-caine');assert.equal(dismissedTips.ready,true)});
 await setLock(false);
 const memories=[skipped.memory];
 for(let i=0;i<3;i++){
  await click('#btn-home');await click('[data-story]');await until(async()=> ['playing','blending','done'].includes((await state()).phase));await click('#cinematic-skip');
  await invitation();
  const s=await until(async()=>{const v=await state();return v.phase==='done'&&v.ready&&v});memories.push(s.memory);
 }
 report.memory_cycles=memories;
 check('Warmed repeated room loads release cinematic GPU geometries and textures',()=>{
  // The first Home visit can upload the persistent title scene for the first
  // time. Compare three subsequent warmed cycles, retaining all raw counters.
  const warmed=memories.slice(-3);
  assert.ok(Math.max(...warmed.map(m=>m.geometries))-Math.min(...warmed.map(m=>m.geometries))<=2);
  assert.ok(Math.max(...warmed.map(m=>m.textures))-Math.min(...warmed.map(m=>m.textures))<=2);
 });
 // Cancel during the staged entrance; no stale dialogue or audio may survive.
 await click('#btn-home');await click('[data-story]');await until(async()=> ['playing','blending','done'].includes((await state()).phase));await click('#cinematic-skip');
 await until(()=>evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));await key('Space');
 await until(async()=> (await state()).entrancePhase==='entering');await key('Escape');await click('#btn-home');await sleep(4500);
 const abandoned=await state();check('Home disposes entrance without delayed dialogue, audio or room resurrection',()=>{assert.equal(abandoned.entrancePhase,null);assert.equal(abandoned.dialogueActive,false);assert.equal(abandoned.entranceSounds.length,0);assert.equal(abandoned.ready,false);assert.equal(abandoned.objective,null);assert.equal(abandoned.objectiveVisible,false)});
 // Cancel during a loaded cinematic, then cancel a load still in flight.
 await click('#btn-home');await click('[data-story]');await until(async()=> (await state()).phase==='playing');await key('Escape');await click('#btn-home');await sleep(400);
 const afterCancel=await state();check('Home cancels the cinematic without a delayed completion',()=>{assert.equal(afterCancel.ready,false);assert.equal(afterCancel.phase,null)});
 await click('[data-story]');await click('#btn-title');await sleep(1500);const late=await state();check('Loading cancellation cannot resurrect a room',()=>{assert.equal(late.ready,false);assert.equal(late.phase,null)});
 // Developer dialogue previews must not advance the real game's objectives.
 await click('[data-dialogue="preLevel1"]');await until(async()=> (await state()).dialogueActive);
 for(let i=0;i<24&&(await state()).dialogueActive;i++){await key('Space');await sleep(65)}
 const preview=await state();check('Completing a dialogue preview never awards a story objective',()=>{assert.equal(preview.objective,null);assert.equal(preview.preLevel1Session,false);assert.equal(preview.morningDialoguePending,false)});
 await setLock(true);await sleep(150);assert.equal((await state()).objectiveVisible,false);await setLock(false);await click('#btn-home');
 assert.equal(errors.length,0,errors.join('\n'));report.pass=true;
}catch(error){report.failure=error.stack;console.error(error);if(ws?.readyState===1){try{report.failureState=await state();report.failureOverlay=await evaluate("({title:document.querySelector('#overlay-title').textContent,subtitle:document.querySelector('#overlay-subtitle').textContent})")}catch{}}}finally{
 fs.writeFileSync(path.join(output,'browser-verification.json'),JSON.stringify(report,null,2));
 if(ws?.readyState===1){try{await command('Browser.close')}catch{}ws.close()}
 browser.unref();
}
if(!report.pass)process.exitCode=1;

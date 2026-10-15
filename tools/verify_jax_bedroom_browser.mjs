import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const output=path.resolve('artifacts/jax-bedroom-pass');fs.mkdirSync(output,{recursive:true});
const browser=spawn(process.env.CGV_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',[
  '--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions',
  '--remote-debugging-port=9243','--window-size=960,720','--force-device-scale-factor=1',
  '--user-data-dir='+path.join(os.tmpdir(),'jax-bedroom-pass'),'about:blank',
],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),errors=[];
const report={pass:false,checks:[],errors};
async function until(fn,limit=90000){const start=Date.now();while(Date.now()-start<limit){const value=await fn();if(value)return value;await sleep(100)}throw Error('Browser condition timed out')}
const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value};
const state=()=>evaluate("import('/src/main.js').then(m=>m.getOpeningDiagnostics())");
const key=code=>evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'${code}',key:'${code}',bubbles:true,cancelable:true}))`);
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
async function screenshot(name){const r=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(r.data,'base64'))}
function check(name,fn){fn();report.checks.push(name);console.log('PASS',name)}
try {
  const target=await until(async()=>{try{return(await fetch('http://127.0.0.1:9243/json/list').then(r=>r.json())).find(t=>t.type==='page')}catch{return null}});
  ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
  ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p?.reject(Error(r.error.message)):p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text)});
  await command('Page.enable');await command('Runtime.enable');await command('Page.navigate',{url:'http://127.0.0.1:5173/'});
  await until(async()=>Boolean(await state()));await click('#btn-new-game');
  await until(async()=>['playing','seated'].includes((await state()).phase));
  await until(async()=> (await state()).phase==='seated');
  for(let i=0;i<4;i++)await key('Space');
  await until(async()=> (await state()).entrancePhase==='dialogue');
  const before=await state();check('Real Jax preloaded, open doorway and no premature objective',()=>{assert.equal(before.jaxLoaded,true);assert.equal(before.hallPreview.visible,true);assert.equal(before.objective,null);assert.equal(before.doorAngle,-Math.PI/2)});
  await screenshot('before-jax');
  // Capture an actual rendered crossing, not a seeked actor pose.
  await evaluate(`(async()=>{const m=await import('/src/main.js');window.__jaxCapture=null;window.__jaxTexts=[];function watch(){const s=m.getOpeningDiagnostics();if(s.dialogueActive)window.__jaxTexts.push(s.dialogueText);if(s.jaxPass?.visible&&s.jaxPass.elapsed>=1.05){window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyP',bubbles:true,cancelable:true}));window.__jaxCapture=m.getOpeningDiagnostics();return}requestAnimationFrame(watch)}requestAnimationFrame(watch)})()`);
  for(let i=0;i<12;i++){if((await state()).jaxPass)break;await key('Space');await sleep(70)}
  const crossing=await until(()=>evaluate('window.__jaxCapture'));report.crossing=crossing;
  // Hide just the pause overlay to review the frozen, already-rendered scene.
  await evaluate("document.querySelector('#overlay').style.visibility='hidden'");await screenshot('jax-crossing');await evaluate("document.querySelector('#overlay').style.visibility=''");
  await key('Space');await sleep(250);const held=await state();
  check('Pass keeps conversation framing; pause freezes actor/camera and original door is unchanged',()=>{assert.equal(crossing.dialogueActive,false);assert.equal(crossing.ready,false);assert.equal(crossing.paused,true);assert.deepEqual(crossing.camera,before.camera);assert.deepEqual(crossing.cameraDirection,before.cameraDirection);assert.deepEqual(held.jaxPass.position,crossing.jaxPass.position);assert.deepEqual(held.camera,crossing.camera);assert.equal(held.doorAngle,before.doorAngle);assert.equal(held.objective,null)});
  await key('KeyP');
  const resumed=await until(async()=>{const s=await state();return !s.jaxPass&&s.dialogueActive&&s});await key('Space');
  const after=await state();await screenshot('after-jax');
  check('Conversation resumes at exact next line, actor hidden and camera restored',()=>{assert.equal(after.dialogueText,"...He's been like that for days now.");assert.equal(after.entrancePhase,'dialogue');assert.deepEqual(after.camera,before.camera);assert.equal(after.doorAngle,before.doorAngle)});
  assert.ok(!(await evaluate('window.__jaxTexts')).some(t=>t.includes('storms past in the background')));
  for(let i=0;i<18&&(await state()).dialogueActive;i++){await key('Space');await sleep(50)}
  await until(async()=> (await state()).entrancePhase==='exiting');await click('#cinematic-skip');
  const done=await until(async()=>{const s=await state();return s.ready&&s});
  check('Existing departure, Find Caine and tutorial resume after complete conversation',()=>{assert.equal(done.objective.id,'find-caine');assert.equal(done.tutorial.unlocked,true);assert.equal(done.entrancePhase,'done');assert.equal(done.doorAngle,before.doorAngle)});
  // Restart and dispose during a second pass: no stale continuation may survive.
  await click('#btn-home');await click('#btn-new-game');await until(async()=> (await state()).phase==='playing');await click('#cinematic-skip');
  await until(async()=> (await state()).dialogueActive);await key('Space');await key('Space');await until(async()=> (await state()).entrancePhase==='entering');await click('#cinematic-skip');
  await until(async()=> (await state()).dialogueActive);
  for(let i=0;i<12;i++){if((await state()).jaxPass)break;await key('Space');await sleep(70)}
  await until(async()=> (await state()).jaxPass?.visible);await click('#btn-home');await sleep(3200);
  const home=await state();check('New Game resets pass; disposal does not restart dialogue or award objectives',()=>{assert.equal(home.jaxPass,null);assert.equal(home.dialogueActive,false);assert.equal(home.objective,null);assert.equal(home.jaxLoaded,false);assert.equal(home.hallPreview,null);assert.equal(home.ready,false)});
  assert.equal(errors.length,0,errors.join('\n'));report.pass=true;
} catch(error) {report.failure=error.stack;try{report.lastState=await state();await screenshot('failure')}catch{}console.error(error)}
finally {fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(report,null,2));ws?.close();browser.kill();if(!report.pass)process.exitCode=1}

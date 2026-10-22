// Browser integration checks using installed Edge and native CDP, no npm install.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const output=path.resolve('artifacts/ragatha-3d');fs.mkdirSync(output,{recursive:true});
const browserExecutable=process.env.CGV_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(browserExecutable,[
 '--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions',
 '--remote-debugging-port=9238','--window-size=800,600','--force-device-scale-factor=1',
 '--user-data-dir='+path.join(os.tmpdir(),'ragatha-door-open'),'about:blank',
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
 const target=await until(async()=>{const list=await fetch('http://127.0.0.1:9238/json/list').then(r=>r.json());return list.find(t=>t.type==='page')});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Browser disconnected'));pending.clear()});
 ws.addEventListener('message',event=>{const r=JSON.parse(event.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);if(r.error)p?.reject(Error(JSON.stringify(r.error)));else p?.resolve(r.result)}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);else if(r.method==='Runtime.consoleAPICalled'&&r.params.type==='error')errors.push(r.params.args.map(a=>a.value??a.description).join(' '))});
 await command('Runtime.enable');await command('Page.enable');await command('Page.navigate',{url:'http://127.0.0.1:5173/'});

 await until(async()=>Boolean(await state()));await click('#btn-new-game');
 const loaded=await until(async()=>{const s=await state();return ['playing','blending','done'].includes(s.phase)&&s});
 if(loaded.phase!=='done')await click('#cinematic-skip');
 await until(()=>evaluate("document.querySelector('#dialogue-text').textContent==='Come in.'"));await key('Space');
 const conversation=await until(async()=>{const s=await state();return s.entrancePhase==='dialogue'&&s.dialogueActive&&s});
 check('Door is fully open throughout the live morning conversation',()=>{assert.ok(Math.abs(conversation.doorAngle+Math.PI/2)<1e-8);assert.equal(conversation.ragatha.visible,true);assert.equal(conversation.ready,false)});
 await sleep(800);assert.ok(Math.abs((await state()).doorAngle+Math.PI/2)<1e-8);await screenshot('door-open-conversation');
 const shot=await state();
 const framing=await evaluate(`(async()=>{const T=await import('/node_modules/three/build/three.module.js');const s=${JSON.stringify(shot)};
 const c=new T.PerspectiveCamera(s.cameraFov,s.cameraAspect,.1,500);c.position.fromArray(s.camera);c.lookAt(c.position.clone().add(new T.Vector3().fromArray(s.cameraDirection)));c.updateMatrixWorld(true);
 return {Pomni:new T.Vector3(s.player[0],s.player[1]-.3,s.player[2]).project(c).toArray(),Ragatha:new T.Vector3(...s.ragatha.position).add(new T.Vector3(0,1.5,0)).project(c).toArray(),Door:new T.Vector3(1.4,1.5,3.32).project(c).toArray()};})()`);
 check('Conversation frames both characters and doorway above dialogue UI',()=>{for(const [name,p] of Object.entries(framing))assert.ok(Math.abs(p[0])<.9&&p[1]>-.2&&p[1]<.9,name)});
 report.framing=framing;
 for(let i=0;i<24;i++){const s=await state();if(s.jaxPass){await sleep(100);i--;continue}if(!s.dialogueActive)break;await key('Space');await sleep(80)}
 const released=await until(async()=>{const s=await state();return s.entrancePhase==='done'&&s.ready&&s});
 check('Door remains open after Ragatha leaves and Find Caine/gameplay are restored',()=>{assert.ok(Math.abs(released.doorAngle+Math.PI/2)<1e-8);assert.equal(released.ragatha.visible,false);assert.equal(released.objective.id,'find-caine')});
 await setLock(true);
 const aimOpening=async()=>{const s=await state(),a=s.ragatha.route,p=a.panelMin.map((v,i)=>(v+a.panelMax[i])/2),dx=p[0]-s.player[0],dz=p[2]-s.player[2],yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(s.player[1]-.3-p[1],Math.hypot(dx,dz));
 await evaluate(`(()=>{const e=new MouseEvent('mousemove');Object.defineProperty(e,'movementX',{value:${(s.cameraYaw-yaw)/.0025}});Object.defineProperty(e,'movementY',{value:${(pitch-s.cameraPitch)/.0025}});document.dispatchEvent(e)})()`);await sleep(150);};
 await aimOpening();await key('KeyW');await sleep(220);await key('KeyW','keyup');await aimOpening();
 await until(async()=> (await state()).focusedPrompt==='Exit to Hallway');await screenshot('open-door-gameplay');await key('KeyE');
 const hall=await until(async()=>{const s=await state();return s.room==='dorm'&&s.ready&&s});
 check('One E through the open doorway still enters Dorm Hall with Find Caine',()=>assert.equal(hall.objective.id,'find-caine'));
 assert.equal(errors.length,0,errors.join('\n'));report.pass=true;
}catch(error){report.failure=error.stack;console.error(error)}finally{
 fs.writeFileSync(path.join(output,'door-open-browser.json'),JSON.stringify(report,null,2));
 if(ws?.readyState===1){try{await command('Browser.close')}catch{}ws.close()}browser.unref();
}
if(!report.pass)process.exitCode=1;

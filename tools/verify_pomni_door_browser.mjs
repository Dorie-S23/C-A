import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const output=path.resolve('artifacts/pomni-door-hinge');fs.mkdirSync(output,{recursive:true});
const executable=process.env.CGV_BROWSER_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser=spawn(executable,['--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-extensions','--remote-debugging-port=9236','--window-size=900,720','--force-device-scale-factor=1','--user-data-dir='+path.join(os.tmpdir(),'pomni-door-review'),'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0;const pending=new Map(),report={pass:false,browser:executable,errors:[],poses:[]};
const command=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}))});
const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
async function until(fn){const end=Date.now()+90000;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch{}await sleep(200);}throw Error('Door browser timeout');}
try{
 const target=await until(async()=>{const tabs=await fetch('http://127.0.0.1:9236/json/list').then(r=>r.json());return tabs.find(t=>t.type==='page');});
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);pending.delete(r.id);r.error?p?.reject(Error(JSON.stringify(r.error))):p?.resolve(r.result);}else if(r.method==='Runtime.exceptionThrown')report.errors.push(r.params.exceptionDetails.exception?.description||r.params.exceptionDetails.text);});
 ws.addEventListener('close',()=>{for(const p of pending.values())p.reject(Error('Browser closed'));pending.clear()});
 await command('Runtime.enable');await command('Page.enable');
 // Navigate to the served JS text, then import it as a module. This avoids
 // starting a second title/game session while reviewing the real room.
 await command('Page.navigate',{url:'http://127.0.0.1:5173/tools/pomniDoorReview.js'});
 await until(()=>evaluate("location.pathname==='/tools/pomniDoorReview.js'"));
 report.measurements=await evaluate("import('/tools/pomniDoorReview.js').then(m=>m.createDoorReview()).then(r=>{window.doorReview=r;return r.measurements})");
 for(const [name,fraction] of [['closed',0],['halfway-open',.5],['fully-open',1]]){
  const pose=await evaluate(`window.doorReview.pose(${fraction})`);await sleep(300);await evaluate(`window.doorReview.pose(${fraction})`);
  assert.ok(Math.abs(pose.angle+Math.PI/2*fraction)<1e-9);assert.deepEqual(pose.frame,pose.originalFrame);assert.deepEqual(pose.hinge,report.measurements.hinge);
  assert.ok(pose.children.every(c=>c.parent==='Door_Slab024'));
  const png=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(png.data,'base64'));
  report.poses.push({name,...pose});console.log('PASS',name,'angle',pose.angle);
 }
 const closed=report.poses[0],open=report.poses[2];assert.ok(open.handle[2]<closed.handle[2]-1);
 assert.deepEqual(open.children.map(c=>c.matrix),closed.children.map(c=>c.matrix));
 const restored=await evaluate('window.doorReview.pose(0)');restored.slab.forEach((v,i)=>assert.ok(Math.abs(v-closed.slab[i])<1e-8));
 assert.equal(report.errors.length,0);report.pass=true;console.log('PASS Browser hinge, inward handle arc, child attachment, stationary frame and closed restoration');
}catch(error){report.failure=error.stack;console.error(error);}finally{
 fs.writeFileSync(path.join(output,'browser-validation.json'),JSON.stringify(report,null,2));
 if(ws?.readyState===1){try{await command('Browser.close')}catch{}ws.close();}browser.unref();
}
if(!report.pass)process.exitCode=1;

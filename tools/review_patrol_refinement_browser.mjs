import { chromium } from 'playwright';
import fs from 'node:fs';
const stage=process.argv.find(arg=>arg.startsWith('--stage='))?.slice(8)??'after';
const output=`artifacts/patrol-refinement/${stage}`;fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1100,height:780}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.route('**/src/main.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
    renderer.setPixelRatio(0.8);
    window.__patrolReview={
      ready:()=>currentRoomKey==='maze'&&readyToPlay,
      view(kind){
        const room=currentRoomInfo;
        let a,b;
        if(kind.startsWith('loop')){const loop=room.environmentLayout.loops[Number(kind.slice(4))];a=new THREE.Vector3(-27+loop[0].c*4.5,0,-27+loop[0].r*4.5);b=new THREE.Vector3(-27+loop[1].c*4.5,0,-27+loop[1].r*4.5);}
        else [a,b]=room.movers[0].waypoints;
        const direction=b.clone().sub(a).setY(0).normalize(),side=new THREE.Vector3(-direction.z,0,direction.x);
        player.position.copy(a).addScaledVector(direction,kind==='third-person'?1.1:-0.9).addScaledVector(side,0.72).setY(1.7);
        cameraYaw=Math.atan2(-direction.x,-direction.z);cameraPitch=kind==='third-person'?0.24:0.28;
        firstPerson=kind!=='third-person';player.visible=true;updateCamera(1);
        overlay.classList.add('hidden');hint.style.display='none';document.getElementById('objective-hud').style.display='none';
        renderer.render(scene,camera);
        return {camera:camera.position.toArray(),firstPerson,patrol:room.shaderEffects.state};
      },
      async record(){
        const mime='video/webm;codecs=vp8';
        if(!MediaRecorder.isTypeSupported(mime))throw new Error('WebM recording unsupported');
        // Copy actual WebGL renders into a capture canvas: this avoids empty
        // headless WebGL streams and gives both comparisons the same clock.
        const capture=document.createElement('canvas');capture.width=renderer.domElement.width;capture.height=renderer.domElement.height;
        const context=capture.getContext('2d'),stream=capture.captureStream(0),chunks=[];
        const track=stream.getVideoTracks()[0];
        const wasPaused=paused;paused=true;
        const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2400000});
        const done=new Promise(resolve=>recorder.onstop=resolve);
        recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
        recorder.start();
        for(let frame=0;frame<72;frame++){
          roomUpdate(1/18,player.position);updateMovers(1/18);
          renderer.render(scene,camera);context.drawImage(renderer.domElement,0,0);track.requestFrame();
          await new Promise(resolve=>setTimeout(resolve,56));
        }
        recorder.stop();await done;paused=wasPaused;
        stream.getTracks().forEach(track=>track.stop());
        return Array.from(new Uint8Array(await new Blob(chunks,{type:mime}).arrayBuffer()));
      }
    };
  `});
 });
 await page.goto('http://127.0.0.1:5174/?dev=1&mazeSeed=123',{waitUntil:'domcontentloaded'});
 await page.locator('button[data-room="maze"]').click();
 await page.waitForFunction(()=>window.__patrolReview?.ready(),null,{timeout:90000});
 const info=await page.evaluate(()=>window.__patrolReview.view('patrol'));
 await page.waitForTimeout(300);
 await page.screenshot({path:`${output}/player-height.png`,timeout:60000});
 const video=await page.evaluate(()=>window.__patrolReview.record());if(video.length<5000)throw new Error('Recording produced no usable video frames');fs.writeFileSync(`${output}/patrol.webm`,Buffer.from(video));
 for(const kind of ['third-person','loop0','loop1','loop2']){
  await page.evaluate(kind=>window.__patrolReview.view(kind),kind);await page.waitForTimeout(120);
  await page.screenshot({path:`${output}/${kind}.png`,timeout:60000});
 }
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({stage,videoBytes:video.length,...info,errors}));
}finally{await browser.close();}

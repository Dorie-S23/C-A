// Real WebGL checks and matched shader captures. Run with Vite on port 5174.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
const output='artifacts/maze-step5';
fs.mkdirSync(`${output}/comparison-before`,{recursive:true});
fs.mkdirSync(`${output}/comparison-after`,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[], report={seeds:[],reentry:[],performance:{}};
try {
  const page=await browser.newPage({viewport:{width:1100,height:780}});
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{ if(m.type()==='error' && /shader|WebGLProgram|GL_INVALID/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/src/main.js',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:await response.text()+`
      renderer.setPixelRatio(0.8);
      const realRender=renderer.render.bind(renderer);
      let shaderCamera=null;
      renderer.render=(s,c)=>realRender(s,shaderCamera??c);
      const effects=()=>currentRoomInfo.shaderEffects;
      const lock=value=>{
        Object.defineProperty(document,'pointerLockElement',{configurable:true,value:value?renderer.domElement:null});
        document.dispatchEvent(new Event('pointerlockchange'));
      };
      window.__shaderReview={
        ready:()=>currentRoomKey==='maze'&&readyToPlay,
        status:()=>({...effects().state,paused,seed:currentRoomInfo.mazeSeed,
          patrolTime:effects().materials.patrol.uniforms.uTime.value,
          cracksTime:effects().materials.cracks.uniforms.uTime.value,
          cracksNear:effects().materials.cracks.uniforms.uNear.value}),
        lock,
        park(near){
          const c=currentRoomInfo.maze.jax, n=currentRoomInfo.maze.jaxNeighbor;
          const p=near ? new THREE.Vector3(-27+c.c*4.5,1.7,-27+c.r*4.5).add(new THREE.Vector3(n.c-c.c,0,n.r-c.r)) : currentRoomInfo.spawn.clone().setY(1.7);
          player.position.copy(p);
        },
        frame(name,visible=true){
          let view=currentRoomInfo.group.getObjectByName('MazeScenery').userData.reviewViews[name];
          if(name==='patrol'){
            const [a,b]=currentRoomInfo.movers[0].waypoints;
            const direction=b.clone().sub(a).setY(0).normalize();
            const side=new THREE.Vector3(-direction.z,0,direction.x).multiplyScalar(0.85);
            view={position:a.clone().addScaledVector(direction,-1).add(side).setY(1.7).toArray(),target:b.clone().add(side).setY(0.15).toArray()};
          }else if(name==='overview')view={position:[0,81,0.01],target:[0,0,0]};
          shaderCamera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.1,200);
          shaderCamera.position.fromArray(view.position);if(name!=='overview')shaderCamera.position.y=1.7;
          shaderCamera.lookAt(new THREE.Vector3().fromArray(view.target));
          player.visible=false;effects().group.visible=visible;
          overlay.classList.add('hidden');hint.style.display='none';document.getElementById('objective-hud').style.display='none';
          realRender(scene,shaderCamera);return view;
        },
        compile(){
          renderer.compile(scene,shaderCamera??camera);
          realRender(scene,shaderCamera??camera);
          const gl=renderer.getContext();
          const links=renderer.info.programs.map(program=>gl.getProgramParameter(program.program,gl.LINK_STATUS));
          return {links,error:gl.getError(),shaderMaterials:effects().group.children.map(mesh=>mesh.material.isShaderMaterial)};
        },
        pixels(){
          realRender(scene,shaderCamera??camera);
          const gl=renderer.getContext(), data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);
          let hash=2166136261;for(let i=0;i<data.length;i+=4){hash=Math.imul(hash^data[i],16777619);hash=Math.imul(hash^data[i+1],16777619);hash=Math.imul(hash^data[i+2],16777619);}
          return hash>>>0;
        },
        animateOnly(dt){effects().update(dt,player.position);},
        performance(){
          const gl=renderer.getContext(), samples={disabled:[],enabled:[]}, result={};
          for(let i=0;i<15;i++)for(const enabled of i%2?[true,false]:[false,true]){
            effects().group.visible=enabled;const start=performance.now();
            realRender(scene,shaderCamera??camera);gl.finish();
            const key=enabled?'enabled':'disabled';
            if(i>=3)samples[key].push(performance.now()-start);
            result[key]={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,memory:{...renderer.info.memory}};
          }
          for(const key of ['disabled','enabled']){samples[key].sort((a,b)=>a-b);result[key].medianMs=samples[key][Math.floor(samples[key].length/2)];result[key].samples=samples[key].length;}
          return result;
        },
        async reenter(){
          const previous=effects();await selectRoom('maze');realRender(scene,shaderCamera??camera);
          return {previous:{...previous.state},fresh:{...effects().state},memory:{...renderer.info.memory}};
        }
      };
    `});
  });
  async function load(seed){
    await page.goto(`http://127.0.0.1:5174/?dev=1&mazeSeed=${seed}`,{waitUntil:'domcontentloaded'});
    await page.locator('button[data-room="maze"]').click();
    await page.waitForFunction(()=>window.__shaderReview?.ready(),null,{timeout:90000});
    await page.evaluate(()=>window.__shaderReview.lock(false));
  }
  await load(123);
  let compile=await page.evaluate(()=>window.__shaderReview.compile());
  assert.ok(compile.links.every(Boolean));assert.equal(compile.error,0);assert.deepEqual(compile.shaderMaterials,[true,true]);
  await page.evaluate(()=>{window.__shaderReview.park(false);window.__shaderReview.lock(true);});
  await page.waitForTimeout(350);
  const running=await page.evaluate(()=>window.__shaderReview.status());
  await page.evaluate(()=>window.__shaderReview.lock(false));
  const frozen=await page.evaluate(()=>window.__shaderReview.status());
  await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(()=>window.__shaderReview.status()),frozen,'pause must freeze both animation clocks and proximity');
  await page.evaluate(()=>window.__shaderReview.lock(true));
  await page.waitForFunction(time=>window.__shaderReview.status().time>time+0.02,frozen.time,{timeout:15000});
  const resumed=await page.evaluate(()=>window.__shaderReview.status());
  assert.ok(resumed.time>frozen.time);assert.ok(resumed.time-frozen.time<1,'no wall-clock catch-up');
  assert.equal(resumed.patrolTime,resumed.cracksTime);
  await page.evaluate(()=>window.__shaderReview.park(true));
  await page.waitForFunction(()=>window.__shaderReview.status().near>0.6,null,{timeout:30000});
  const near=await page.evaluate(()=>window.__shaderReview.status());
  assert.ok(near.near>running.near+0.5);
  await page.evaluate(()=>window.__shaderReview.lock(false));
  report.pause={running:running.time,frozen:frozen.time,resumed:resumed.time,far:running.near,near:near.near};
  for(const name of ['patrol','jax']){
    const view=await page.evaluate(name=>window.__shaderReview.frame(name,false),name);
    const before=await page.evaluate(()=>window.__shaderReview.pixels());
    await page.screenshot({path:`${output}/comparison-before/${name}-123.png`,timeout:60000});
    await page.evaluate(name=>window.__shaderReview.frame(name,true),name);
    const after=await page.evaluate(()=>window.__shaderReview.pixels());assert.notEqual(after,before,`${name} effect must render visible pixels`);
    await page.screenshot({path:`${output}/comparison-after/${name}-123.png`,timeout:60000});
    const timeHash=await page.evaluate(()=>window.__shaderReview.pixels());
    await page.evaluate(()=>window.__shaderReview.animateOnly(1.25));
    assert.notEqual(await page.evaluate(()=>window.__shaderReview.pixels()),timeHash,`${name} GLSL must visibly animate`);
    report.seeds.push({seed:123,view:name,compilation:compile.links.every(Boolean),rendered:true,animated:true,camera:view});
  }
  await page.evaluate(()=>window.__shaderReview.frame('overview',false));
  report.performance=await page.evaluate(()=>window.__shaderReview.performance());
  assert.equal(report.performance.enabled.calls-report.performance.disabled.calls,2);
  assert.ok(report.performance.enabled.triangles-report.performance.disabled.triangles<3200);
  for(let i=0;i<3;i++){
    const entry=await page.evaluate(()=>window.__shaderReview.reenter());
    assert.equal(entry.previous.disposed,true);assert.equal(entry.previous.released,4);assert.equal(entry.fresh.disposed,false);
    assert.ok(entry.fresh.time<0.2);report.reentry.push(entry);
  }
  const memories=report.reentry.map(entry=>entry.memory);
  assert.deepEqual(memories.at(-1),memories[0],'GPU resource counts must stay stable across re-entry');
  for(const seed of [0,42]){
    await load(seed);
    for(const name of ['patrol','jax']){
      await page.evaluate(name=>window.__shaderReview.frame(name,false),name);
      const before=await page.evaluate(()=>window.__shaderReview.pixels());
      await page.evaluate(name=>window.__shaderReview.frame(name,true),name);
      const checked=await page.evaluate(()=>window.__shaderReview.compile());
      assert.ok(checked.links.every(Boolean));assert.equal(checked.error,0);
      assert.notEqual(await page.evaluate(()=>window.__shaderReview.pixels()),before);
    }
    report.seeds.push({seed,compilation:true,rendered:true});
  }
  assert.deepEqual(errors,[]);report.errors=errors;
  fs.writeFileSync(`${output}/webgl-report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser.close();}

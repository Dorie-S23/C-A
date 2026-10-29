import fs from 'node:fs';
import { chromium } from 'playwright';
const stage=process.argv.find(arg=>arg.startsWith('--stage='))?.slice(8)??'after';
const requestedViews=process.argv.find(arg=>arg.startsWith('--views='))?.slice(8).split(',');
const output=`artifacts/maze-polish/${stage}`;fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],poses={};
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/shader|WebGLProgram|GL_INVALID/i.test(m.text()))errors.push(m.text());});
 await page.route('**/src/main.js',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
    renderer.setPixelRatio(0.8);
    window.__polish={
      ready:()=>currentRoomKey==='maze'&&readyToPlay,
      view(name){
        paused=true;resetMoveState();firstPerson=name.endsWith('-eye');
        const room=currentRoomInfo, center=c=>new THREE.Vector3(-27+c.c*4.5,1.7,-27+c.r*4.5);
        let position,target;
        if(name.startsWith('loop')){const loop=room.environmentLayout.loops[Number(name[4])],a=center(loop[0]),b=center(loop[1]),dir=b.clone().sub(a).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);position=a.clone().addScaledVector(dir,-0.9).addScaledVector(side,0.72);target=b;}
        else if(name.startsWith('entrance')){position=room.spawn.clone().add(new THREE.Vector3(2.25,1.7,3.8));target=room.spawn.clone().add(new THREE.Vector3(2.25,1.7,-2));}
        else if(name.startsWith('bowling')||name.startsWith('mug')){const cell=room.environmentLayout.alcoves[name.startsWith('bowling')?0:1],entry=[['top',0,-1],['right',1,0],['bottom',0,1],['left',-1,0]].find(([wall])=>!cell.walls[wall]);target=center(cell);position=target.clone().add(new THREE.Vector3(entry[1]*3.5,0,entry[2]*3.5));}
        else if(name.startsWith('jax')){const c=center(room.maze.jax),n=center(room.maze.jaxNeighbor);position=c.clone().addScaledVector(n.clone().sub(c).normalize(),3.6);target=c;}
        else if(name.startsWith('intersection')){const v=room.group.getObjectByName('MazeScenery').userData.reviewViews.corridor;position=new THREE.Vector3().fromArray(v.position).setY(1.7);target=new THREE.Vector3().fromArray(v.target).setY(1.7);}
        else{const [a,b]=room.movers[0].waypoints,dir=b.clone().sub(a).setY(0).normalize(),side=new THREE.Vector3(-dir.z,0,dir.x);position=a.clone().addScaledVector(dir,0.8).addScaledVector(side,0.7).setY(1.7);target=b.clone().setY(1.7);}
        player.position.copy(position);const dir=target.clone().sub(position).setY(0).normalize();cameraYaw=Math.atan2(-dir.x,-dir.z);cameraPitch=name.endsWith('-eye')?0.20:0.14;
        pomni.rotation.y=cameraYaw+Math.PI;player.visible=true;currentCameraDistance=CAMERA_DISTANCE;updateCamera(1);
        overlay.classList.add('hidden');hint.style.display='none';document.getElementById('objective-hud').style.display='none';
        room.shaderEffects.update(0.01,player.position);room.shaderEffects.materials.patrol.uniforms.uTime.value=2;room.shaderEffects.materials.cracks.uniforms.uTime.value=2;
        renderer.render(scene,camera);
        return {player:player.position.toArray(),camera:camera.position.toArray(),yaw:cameraYaw,pitch:cameraPitch,firstPerson,stats:renderer.info.render};
      }
    };
  `});
 });
 await page.goto('http://127.0.0.1:5174/?dev=1&mazeSeed=123',{waitUntil:'domcontentloaded'});await page.locator('button[data-room="maze"]').click();
 await page.waitForFunction(()=>window.__polish?.ready(),null,{timeout:90000});
 for(const name of requestedViews??['entrance','corridor','intersection','loop0','loop1','loop2','jax','corridor-eye','jax-eye']){
  poses[name]=await page.evaluate(name=>window.__polish.view(name),name);await page.waitForTimeout(120);
  await page.screenshot({path:`${output}/${name}.png`,timeout:60000});
 }
 if(errors.length)throw new Error(errors.join('\n'));const previous=fs.existsSync(`${output}/poses.json`)?JSON.parse(fs.readFileSync(`${output}/poses.json`)):{};fs.writeFileSync(`${output}/poses.json`,JSON.stringify({...previous,...poses},null,2));console.log(JSON.stringify({stage,views:Object.keys(poses),errors}));
}finally{await browser.close();}

import { chromium } from 'playwright';
import fs from 'node:fs';
const output = process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? 'artifacts/maze-step3';
const selectedViews = process.argv.find(arg => arg.startsWith('--views='))?.slice(8).split(',');
const withPlayer = process.argv.includes('--with-player');
const playerHeight = process.argv.includes('--player-height');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage({viewport:{width:1100,height:780}});
 const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/src/main.js',async route=>{
  const response=await route.fetch();
  await route.fulfill({response,body:await response.text()+`
    renderer.setPixelRatio(0.8);
    const normalRender = renderer.render.bind(renderer);
    let reviewCamera = null;
    renderer.render = (s,c) => normalRender(s,reviewCamera ?? c);
    window.__mazeReview = {
      ready: () => currentRoomKey === 'maze' && readyToPlay,
      capture(name) {
        if (name === 'player') {
          reviewCamera = null; player.visible = true; document.getElementById('overlay').classList.add('hidden');
          normalRender(scene,camera); return { view: 'normal gameplay camera', lighting: currentRoomInfo.group.getObjectByName('MazeLighting').userData.lightingBudget };
        }
        const scenery = currentRoomInfo.group.getObjectByName('MazeScenery');
        let view = scenery.userData.reviewViews[name];
        if (name === 'patrol') {
          const [a,b] = currentRoomInfo.movers[0].waypoints;
          const direction = b.clone().sub(a).setY(0).normalize();
          view = { position: a.clone().addScaledVector(direction,-1).setY(1.7).toArray(), target: b.clone().setY(0.15).toArray() };
        }
        reviewCamera = new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.1,150);
        reviewCamera.position.fromArray(view.position); if (${playerHeight}) reviewCamera.position.y = 1.7; reviewCamera.lookAt(new THREE.Vector3().fromArray(view.target));
        player.visible=false;
        document.getElementById('overlay').classList.add('hidden');
        document.getElementById('hint').style.display='none';
        document.getElementById('objective-hud').style.display='none';
        normalRender(scene,reviewCamera);
        return { view, stats:scenery.userData.sceneryStats };
      }
    };
  `});
 });
 await page.goto('http://127.0.0.1:5174/?dev=1&mazeSeed=123',{waitUntil:'domcontentloaded'});
 await page.locator('button[data-room="maze"]').click();
 await page.waitForFunction(()=>window.__mazeReview?.ready(),null,{timeout:90000});
 fs.mkdirSync(output,{recursive:true});
 for(const name of selectedViews ?? ['entrance','corridor','bowling','mug','jax', ...(withPlayer ? ['player'] : [])]) {
   const data=await page.evaluate(name=>window.__mazeReview.capture(name),name);
   await page.waitForTimeout(300);
   await page.screenshot({path:`${output}/${name}-123.png`,timeout:60000});
   console.log(JSON.stringify({name,...data}));
 }
 console.log(JSON.stringify({errors}));
 if(errors.length) process.exitCode=1;
} finally { await browser.close(); }

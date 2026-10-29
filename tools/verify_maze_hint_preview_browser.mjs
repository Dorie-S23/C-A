import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/src/main.js*',async route=>{const response=await route.fetch();await route.fulfill({response,body:await response.text()+`
 renderer.setPixelRatio(.4);window.__hintPreview={state:()=>({open:mazeHints.isOpen,paused,hints:mazeHints.snapshot(),gloinks:currentRoomInfo?.gloinkChases.length}),checkpoint:()=>{takeCheckpoint();return checkpoint;},jaxSample(){mazeHints.hide();mazeItems.collect('hot-chocolate-mug');mazeItems.collect('bowling-ball');mazeHints.reset();player.position.copy(currentRoomInfo.spawn).setY(1.7);player.position.z+=4.5;resetMoveState();pauseRoomForMenu();mazeHints.open(currentRoomInfo);}};
 `});});
 fs.mkdirSync('artifacts/maze-hints-six',{recursive:true});
 for(const seed of [123,187]){await page.goto('http://127.0.0.1:5174/?dev=1&mazeSeed='+seed+'&hintPreview=3');await page.waitForFunction(()=>window.__hintPreview?.state().open,null,{timeout:120000});const state=await page.evaluate(()=>window.__hintPreview.state());assert.equal(state.paused,true);assert.ok(state.gloinks>0);assert.deepEqual(state.hints,{version:3,used:0});assert.equal(await page.locator('[data-map-marker="P"]').count(),1);assert.equal(await page.locator('[data-map-marker="J"]').count(),0);assert.deepEqual((await page.evaluate(()=>window.__hintPreview.checkpoint())).mazeHints,state.hints);await page.screenshot({path:'artifacts/maze-hints-six/preview-'+seed+'.png',timeout:90000});await page.evaluate(()=>window.__hintPreview.jaxSample());await page.locator('[data-next-hint]').click();assert.equal(await page.locator('[data-hints-count]').textContent(),'5 hints left');assert.equal(await page.locator('[data-map-marker="J"]').count(),1);await page.screenshot({path:'artifacts/maze-hints-six/jax-map-review-'+seed+'.png',timeout:90000});}
 assert.deepEqual(errors,[]);console.log('PASS object preview stays read-only; player and target markers render correctly');
}finally{await browser.close();}

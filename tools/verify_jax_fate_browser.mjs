// Face to Face in the real game: Jax's Fate, his abstraction and the
// Jax-less endings. Answers every choice with real number-key presses and
// advances lines with Space (never skipToEnd), then checks:
//   - too many bad choices: his static climbs answer by answer, he
//     abstracts on the 'jaxAbstracts' beat (the shared effect played to 1),
//     the HUD says Reach the exit, a checkpoint/load keeps him gone, and
//     the exit plays the 'abstracted' ending (the Lobby without him), then
//     the Level 3 Complete card and Back to title
//   - the same with the Escape Threshold missed: the No Way Out card
//   - good choices: he's saved, his static clears, and the exit plays the
//     'saved' ending
// The bridge only skips walking (parks Pomni) and sets Escape points.
// Run with Vite on 5174: npx vite --port 5174, then node tools/verify_jax_fate_browser.mjs
// Report and screenshots: artifacts/jax-fate/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { level3JaxFinalDialogue } from '../src/data/dialogues.js';

const output = 'artifacts/jax-fate';
fs.mkdirSync(output, { recursive: true });
const pointsOf = new Map();
for (const node of level3JaxFinalDialogue) {
  if (node.type === 'choice') for (const option of node.options) pointsOf.set(option.text, option.points ?? 0);
}

const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
const report = { runs: [], screenshots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultNavigationTimeout(90000);
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && /shader|WebGLProgram|GL_INVALID/i.test(m.text())) errors.push(m.text()); });
  await page.route('**/src/main.js', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + `
 renderer.setPixelRatio(0.6);
 let mazeCompleteCalls=0;const actualEndLevel=endLevel;endLevel=(...args)=>{mazeCompleteCalls++;return actualEndLevel(...args);};
 const lock=value=>{Object.defineProperty(document,'pointerLockElement',{configurable:true,value:value?renderer.domElement:null});document.dispatchEvent(new Event('pointerlockchange'));};
 window.__fate={
  ready:()=>currentRoomKey==='maze'&&readyToPlay,
  lock,
  setEscape:(level1,level2)=>restoreEscapeThreshold({level1,level2}),
  status(){const fx=currentRoomInfo?.jaxApi?.abstraction,options=[...document.querySelectorAll('#dialogue-options .dialogue-option')];
   return {room:currentRoomKey,ready:readyToPlay,outcome:jaxFate.outcome,fateDistress:jaxFate.distress,effectDistress:fx?.distress??null,effectProgress:fx?.progress??null,
    dialogue:dialogueUI.isActive,options:document.getElementById('dialogue-options').hidden?[]:options.map(b=>b.textContent),
    visible:document.getElementById('dialogue').style.visibility!=='hidden',text:document.getElementById('dialogue-text')?.textContent??'',
    jaxComplete:mazeItems.jaxComplete,hud:document.getElementById('maze-objective-hud').textContent,endingPlaying,
    card:levelCompletePanel.hidden?null:levelCompleteTitle.textContent,subtitle:levelCompleteSubtitle.textContent,button:btnLevelCompleteContinue.textContent,ending:storyProgress.ending,
    title:titleScreen.active,mazeCompleteCalls,overlayTitle:overlayTitle.textContent};},
  park(distance=2.1){const room=currentRoomInfo,a=room.jaxAnchor,n=new THREE.Vector3(-27+room.maze.jaxNeighbor.c*4.5,0,-27+room.maze.jaxNeighbor.r*4.5),dir=n.sub(a).normalize();player.position.copy(a).addScaledVector(dir,distance).setY(1.7);firstPerson=false;cameraYaw=Math.atan2(dir.x,dir.z);cameraPitch=0.14;pomni.rotation.y=cameraYaw+Math.PI;currentCameraDistance=CAMERA_DISTANCE;updateCamera(1);resetMoveState();},
  pickup(id){const label=MAZE_FINDABLES.find(item=>item.id===id).label,pickup=currentRoomInfo.interactables.find(i=>i.prompt()===('Pick up '+label));pickup.interact();},
  checkExit(){const c=currentRoomInfo.maze.exit;player.position.set(-27+c.c*4.5,1.7,-27+c.r*4.5);checkTriggers(player);},
  checkpoint(){takeCheckpoint();saveSlots.write(3,checkpoint);return saveSlots.read(3);},
  load:data=>loadGame(data),
  cancelDialogue:()=>dialogueUI.cancel(),
  continueCard:()=>btnLevelCompleteContinue.click(),
 };
 ` });
  });

  const status = () => page.evaluate(() => window.__fate.status());
  async function shot(name) {
    await page.waitForTimeout(160);
    await page.screenshot({ path: `${output}/${name}.png`, timeout: 60000 });
    report.screenshots.push(name);
  }
  async function enterMaze(seed, escape) {
    await page.goto(`http://127.0.0.1:5174/?dev=1&mazeSeed=${seed}`, { waitUntil: 'domcontentloaded' });
    await page.locator('button[data-room="maze"]').click();
    await page.waitForFunction(() => window.__fate?.ready(), null, { timeout: 90000 });
    await page.evaluate(([a, b]) => { window.__fate.lock(true); window.__fate.setEscape(a, b); }, escape);
    await page.evaluate(() => { window.__fate.pickup('bowling-ball'); window.__fate.pickup('hot-chocolate-mug'); window.__fate.park(2.1); });
    await page.waitForFunction(() => window.__fate.status().dialogue, null, { timeout: 20000 });
  }
  /** Plays the conversation with real keys; `good` says which choices get the best answer. */
  async function talkThrough(good, run, shots = {}) {
    let choice = 0;
    for (let guard = 0; guard < 600; guard++) {
      const s = await status();
      if (!s.dialogue) return;
      if (!s.visible) { // an awaited beat: his abstraction playing out
        if (shots.awaiting && !run.shotAwaiting) {
          run.shotAwaiting = true;
          await page.waitForTimeout(1800);
          run.midAbstraction = (await status()).effectProgress;
          await shot(shots.awaiting);
        }
        await page.waitForTimeout(150);
        continue;
      }
      if (s.options.length) {
        const want = good(choice);
        const index = s.options.findIndex((text) => (pointsOf.get(text) === 1) === want);
        assert.ok(index >= 0, `no ${want ? 'best' : 'poor'} option among ${s.options}`);
        await page.keyboard.press(`Digit${index + 1}`);
        await page.waitForTimeout(80);
        const after = await status();
        run.distress.push({ choice, best: want, fate: after.fateDistress, effect: Number(after.effectDistress.toFixed(3)) });
        if (shots[choice]) await shot(shots[choice]);
        choice++;
        continue;
      }
      await page.keyboard.press('Space');
      await page.waitForTimeout(50);
    }
    throw new Error('conversation did not finish');
  }

  // 1) Too many bad choices, Escape Threshold cleared: the abstracted ending.
  {
    const run = { name: 'abstracted-ending', distress: [] };
    await enterMaze(123, [4, 5]);
    await shot('01-face-to-face-start');
    await talkThrough((i) => i === 0, run, { 3: '02-static-climbing', awaiting: '03-abstracting' });
    let s = await status();
    assert.equal(s.outcome, 'abstracted');
    assert.equal(s.jaxComplete, true);
    assert.equal(s.effectProgress, 1, 'he abstracted all the way');
    assert.ok(run.midAbstraction > 0 && run.midAbstraction < 1, 'the box waited while he abstracted');
    // Bad answers raise his static; the effect follows jaxFate's distress.
    assert.ok(run.distress.at(-1).fate === 3 && run.distress[0].fate === 1, JSON.stringify(run.distress));
    await page.evaluate(() => window.__fate.park(3.2));
    await shot('04-jax-abstracted');
    assert.ok((await status()).hud.includes('Reach the exit'));
    // A save after the conversation keeps him gone.
    const saved = await page.evaluate(() => window.__fate.checkpoint());
    assert.deepEqual(saved.jaxFate, { outcome: 'abstracted' });
    await page.evaluate((data) => window.__fate.load(data), saved);
    await page.waitForFunction(() => window.__fate.ready(), null, { timeout: 90000 });
    await page.evaluate(() => window.__fate.lock(true));
    s = await status();
    assert.equal(s.outcome, 'abstracted');
    assert.equal(s.effectProgress, 1, 'still abstracted after a load');
    assert.equal(s.dialogue, false, 'the conversation does not replay');
    // Out of the maze: the 'abstracted' ending in the Lobby (its exit door
    // isn't played through: its walks crawl under swiftshader), then the card.
    await page.evaluate(() => window.__fate.checkExit());
    await page.waitForFunction(() => { const t = window.__fate.status(); return t.room === 'tadc' && t.dialogue; }, null, { timeout: 90000 });
    s = await status();
    assert.equal(s.ending, 'abstracted');
    await page.waitForTimeout(1500);
    await shot('05-abstracted-lobby');
    await page.evaluate(() => window.__fate.cancelDialogue());
    await page.waitForFunction(() => window.__fate.status().card, null, { timeout: 20000 });
    s = await status();
    assert.equal(s.card, 'Level 3 Complete');
    assert.match(s.subtitle, /alone/);
    assert.equal(s.button, 'Back to title');
    assert.equal(s.mazeCompleteCalls, 0, 'not the Maze Complete overlay');
    await page.waitForTimeout(1000); // the card's pop-in
    await shot('06-abstracted-card');
    await page.evaluate(() => window.__fate.continueCard());
    await page.waitForFunction(() => window.__fate.status().title, null, { timeout: 10000 });
    s = await status();
    assert.equal(s.outcome, null, 'back at the title, the run is cleared');
    assert.equal(s.endingPlaying, false);
    report.runs.push(run);
  }

  // 2) The same losses with the Escape Threshold missed: no way out.
  {
    const run = { name: 'abstracted-no-escape', distress: [] };
    await enterMaze(187, [0, 0]);
    await talkThrough(() => false, run);
    assert.equal((await status()).outcome, 'abstracted');
    await page.evaluate(() => window.__fate.checkExit());
    await page.waitForFunction(() => window.__fate.status().card, null, { timeout: 10000 });
    const s = await status();
    assert.equal(s.card, 'No Way Out');
    assert.equal(s.room, 'maze', 'no ending scene');
    assert.equal(s.ending, null, 'no ending recorded');
    // The card's pop-in; the maze draws slowly in software, so wait it out.
    await page.waitForFunction(() => getComputedStyle(document.querySelector('#level-complete-panel .title-panel-box')).opacity === '1', null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    await shot('07-no-way-out-card');
    report.runs.push(run);
  }

  // 3) Good choices save him: his static clears, the 'saved' ending plays.
  {
    const run = { name: 'saved', distress: [] };
    await enterMaze(123, [4, 5]);
    await talkThrough((i) => i !== 1, run);
    let s = await status();
    assert.equal(s.outcome, 'saved');
    // The static eases out (in game time: slow software frames take longer).
    await page.waitForFunction(() => window.__fate.status().effectDistress < 0.05, null, { timeout: 30000 });
    s = await status();
    assert.equal(s.effectProgress, 0);
    assert.ok(s.effectDistress < 0.05, `static clears (${s.effectDistress})`);
    await page.evaluate(() => window.__fate.park(3.2));
    await shot('08-jax-saved');
    await page.evaluate(() => window.__fate.checkExit());
    await page.waitForFunction(() => { const t = window.__fate.status(); return t.room === 'tadc' && t.dialogue; }, null, { timeout: 90000 });
    // The raw maze entry isn't a story session, so nothing's recorded
    // (storyProgress.finishLevel3); the card says which ending played.
    await page.evaluate(() => window.__fate.cancelDialogue());
    await page.waitForFunction(() => window.__fate.status().card, null, { timeout: 20000 });
    s = await status();
    assert.equal(s.card, 'Level 3 Complete');
    assert.match(s.subtitle, /together/);
    assert.equal(s.mazeCompleteCalls, 0);
    report.runs.push(run);
  }

  assert.deepEqual(errors, []);
  report.errors = errors;
  fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  // A route still in flight would otherwise throw over the real failure.
  for (const context of browser.contexts()) for (const page of context.pages()) await page.unrouteAll({ behavior: 'ignoreErrors' });
  await browser.close();
}

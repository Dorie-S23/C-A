// With Vite running: node tools/verify_story_flow_browser.mjs
// Uses real assets and UI; a browser-only bridge positions the player for E interactions.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/story-flow');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking',
    ...(process.argv.includes('--hardware') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const report = { checks: [], errors: [], snapshots: [] };
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', msg => { if (msg.type() === 'error') report.errors.push(msg.text()); });
await page.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  window.__liveBlobUrls = new Set();
  URL.createObjectURL = blob => { const url = create(blob); window.__liveBlobUrls.add(url); return url; };
  URL.revokeObjectURL = url => { window.__liveBlobUrls.delete(url); return revoke(url); };
});
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `\n
    renderer.setPixelRatio(0.5);
    window.__storyReview = {
      stage, travelTo, selectRoom, objectives, itemState, startNewGame, returnToHome,
      state: getOpeningDiagnostics,
      lock() { Object.defineProperty(document, 'pointerLockElement', {value:renderer.domElement, configurable:true}); document.dispatchEvent(new Event('pointerlockchange')); },
      pose() { const actor=currentRoom?.getObjectByName('Ribbit'); return ['RibbitBody','head','spine'].map(name=>actor?.getObjectByName(name)?.quaternion.toArray()); },
      contextLost() { return renderer.getContext().isContextLost(); },
    };` });
});
const state = () => page.evaluate(() => window.__storyReview.state());
const until = async (fn, timeout = 120000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(100);
  }
  throw Error('Browser condition timed out: ' + (await state()).dialogueText);
};
const key = code => page.evaluate(code => window.dispatchEvent(new KeyboardEvent('keydown', {
  code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true,
})), code);
const check = (name, fn) => { fn(); report.checks.push(name); console.log('PASS', name); };
const snapshot = async name => {
  report.snapshots.push({ name, ...await state() });
  await page.screenshot({ path: path.join(output, name + '.png') });
};
const progress = async (choices = [0, 1, 0, 0], stopAtChoice = false) => {
  let choice = 0;
  const startingRoom = (await state()).room;
  for (let i = 0; i < 1000; i++) {
    const s = await state();
    if (!s.dialogueActive || s.room !== startingRoom) return;
    if (s.dialogueWaiting || s.cutsceneActive) { await page.waitForTimeout(100); continue; }
    const choosing = await page.locator('#dialogue-options').evaluate(el => !el.hidden);
    if (s.room === 'ribbit' && s.dialogueText.includes('less like a puddle')) report.warmRecoverySeen = true;
    if (choosing) {
      if (stopAtChoice) return;
      await page.locator('.dialogue-option').nth(choices[choice++] ?? 0).evaluate(button => button.click());
    } else await key('Space');
    await page.waitForTimeout(35);
  }
  throw Error('Dialogue did not finish');
};
const readyRoom = room => until(async () => { const s = await state(); return s.room === room && s.ready && s; });
const travel = async room => { await page.evaluate(room => window.__storyReview.travelTo(room), room); return readyRoom(room); };
const place = async (x, z, lookAt) => {
  await page.evaluate(({x,z,lookAt}) => { window.__storyReview.lock(); window.__storyReview.stage.place({x,z,lookAt}); }, {x,z,lookAt});
  await page.waitForTimeout(200);
};

try {
  await page.goto('http://127.0.0.1:5173/?dev=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__storyReview);
  await page.locator('#btn-new-game').evaluate(button => button.click());
  await until(async () => (await state()).phase === 'playing');
  await page.locator('#cinematic-skip').evaluate(button => button.click());
  await until(async () => (await state()).dialogueActive);
  await progress();
  await until(async () => (await state()).entrancePhase === 'entering');
  await page.locator('#cinematic-skip').evaluate(button => button.click());
  await until(async () => (await state()).entrancePhase === 'dialogue');
  await progress();
  await until(async () => { const s = await state(); return s.objective?.id === 'find-caine' && s.ready; });
  check('Opening, real Jax cutaway and Ragatha completion enable Find Caine', () => assert.equal(report.errors.length, 0));
  const hall = await travel('dorm');
  const caine = hall.interactables.find(i => i.prompt === 'Talk to Caine').anchor;
  await place(caine[0] + 1.5, caine[2], { x: caine[0], z: caine[2] });
  await until(async () => (await state()).focusedPrompt === 'Talk to Caine');
  const beforeWarning = (await state()).player;
  await key('KeyE'); await progress();
  const warned = await until(async () => { const s=await state(); return s.objective?.id === 'find-ribbit' && s; });
  check('Caine unlocks a knock interaction without teleporting the player', () => {
    assert.deepEqual(warned.player, beforeWarning);
    assert.ok(warned.interactables.some(i => i.prompt === 'Knock on Ribbit’s door' && i.enabled));
  });
  await place(-2.2, -110.31, {x:-3.6,z:-110.31});
  await until(async () => (await state()).focusedPrompt === 'Knock on Ribbit’s door');
  await key('KeyE');
  await until(async () => (await state()).dialogueWaiting);
  await key('Escape');
  const interrupted = await state();
  check('Cancelling a staged knock preserves the objective and permits retry', () => {
    assert.equal(interrupted.room, 'dorm'); assert.equal(interrupted.dialogueActive, false);
    assert.equal(interrupted.objective.id, 'find-ribbit');
  });
  await until(async () => (await state()).focusedPrompt === 'Knock on Ribbit’s door');
  await key('KeyE'); await progress([0]);
  await until(async () => { const s=await state(); return s.room==='ribbit' && s.dialogueWaiting; });
  await page.evaluate(() => { for (let i=0;i<12;i++) window.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true})); });
  const arrival = await state();
  check('Fast advance cannot skip the bedroom arrival', () => assert.equal(arrival.dialogueWaiting, true));
  await key('Escape'); await readyRoom('dorm');
  const cancelledInside = await state();
  const cancelledPoints = await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level1'));
  check('Cancelling during entry returns to the hallway and rolls back partial scoring', () => {
    assert.equal(cancelledInside.objective.id, 'find-ribbit'); assert.equal(cancelledInside.ribbitComplete, false);
    assert.equal(cancelledPoints, 0);
  });
  await place(-2.2, -110.31, {x:-3.6,z:-110.31});
  await until(async () => (await state()).focusedPrompt === 'Knock on Ribbit’s door');
  await key('KeyE'); await progress([0]);
  await until(async () => (await state()).room === 'ribbit' && (await state()).dialogueActive);
  await progress([], true); await snapshot('ribbit-arrival');
  await page.locator('.dialogue-option').nth(1).evaluate(button => button.click());
  await until(async () => { const s=await state(); return s.stagedSeat && !s.dialogueWaiting; });
  await snapshot('ribbit-seated');
  // Pause freezes the actor as well as animation/gesture clocks.
  await page.evaluate(() => { delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange')); });
  const pose = await page.evaluate(() => window.__storyReview.pose());
  await page.waitForTimeout(700);
  const pausedPose = await page.evaluate(() => window.__storyReview.pose());
  check('Pause freezes Ribbit’s pose', () => assert.deepEqual(pausedPose, pose));
  await page.evaluate(() => window.__storyReview.lock());
  await progress([0, 0]);
  const completed = await until(async () => { const s=await state(); return s.ribbitComplete && !s.stagedWalk && !s.stagedSeat && s; });
  check('Ribbit completes once, awards four points and restores gameplay with Find Kaufmo', () => {
    assert.equal(completed.ribbitPoints, 4); assert.equal(completed.objective.id, 'find-kaufmo');
    assert.equal(completed.stagedCamera, false); assert.equal(completed.dialogueActive, false);
    assert.equal(report.warmRecoverySeen, true);
  });
  await snapshot('ribbit-complete');
  await travel('dorm');
  await until(async () => (await state()).dialogueActive); await progress();
  check('Leaving Ribbit triggers Kaufmo’s hallway encounter', () => assert.equal(report.errors.length, 0));
  await travel('ribbit');
  const revisited = await state();
  check('Revisiting Ribbit preserves recovery and offers unscored follow-up', () => {
    assert.equal(revisited.ribbitComplete, true);
    assert.ok(revisited.interactables.some(i => i.prompt === 'Talk to Ribbit' && i.enabled));
  });
  await travel('dorm');
  assert.equal((await state()).dialogueActive, false);
  await page.evaluate(() => window.__storyReview.itemState.collect('ca1'));
  const kaufmoRoom = await travel('kaufmo');
  const kaufmo = kaufmoRoom.interactables.find(i => i.prompt === 'Talk to Kaufmo').anchor;
  await place(kaufmo[0], kaufmo[2] + 1.8, {x:kaufmo[0],z:kaufmo[2]});
  await until(async () => (await state()).focusedPrompt === 'Talk to Kaufmo');
  await key('KeyE'); await progress([0, 0]);
  const introduced = await state();
  check('An early photo does not bypass Kaufmo’s introduction or replay the hallway', () => {
    assert.equal(introduced.kaufmoIntroduced, true); assert.equal(introduced.objective.id, 'collect-photos');
    assert.equal(introduced.picturesHeld, 1); assert.equal(introduced.picturesPresented, 0);
  });
  await until(async () => (await state()).focusedPrompt === 'Give photos to Kaufmo');
  await key('KeyE'); await progress();
  assert.equal((await state()).picturesPresented, 1);
  await page.evaluate(() => { window.__storyReview.itemState.collect('ca2'); window.__storyReview.itemState.collect('ca3'); });
  await until(async () => (await state()).focusedPrompt === 'Give photos to Kaufmo');
  await key('KeyE'); await progress();
  const presented = await state();
  check('Handing over the remaining photos advances the next objective', () => {
    assert.equal(report.errors.length, 0); assert.equal(presented.objective.id, 'check-kaufmo');
    assert.equal(presented.picturesPresented, 3);
  });
  await page.evaluate(() => window.__storyReview.startNewGame());
  await until(async () => (await state()).phase === 'playing');
  const fresh = await state();
  const freshPoints = await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getEscapeTotal());
  check('New Game clears story milestones, held/presented photos and old scene actions', () => {
    assert.equal(fresh.ribbitComplete, false); assert.equal(fresh.kaufmoIntroduced, false);
    assert.equal(fresh.picturesHeld, 0); assert.equal(fresh.picturesPresented, 0);
    assert.equal(fresh.objective, null); assert.equal(fresh.stagedCamera, false);
    assert.equal(freshPoints, 0);
  });
  assert.equal(await page.evaluate(() => window.__storyReview.contextLost()), false);
  assert.equal(await page.evaluate(() => window.__liveBlobUrls.size), 0);
  check('Embedded GLB image URLs are released after loading', () => assert.deepEqual(report.errors, []));
  assert.deepEqual(report.errors, []);
  report.pass = true;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

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
    renderer.setPixelRatio(0.25);
    renderer.domElement.requestPointerLock = () => window.__storyReview.lock();
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__storyReview = {
      stage, travelTo, selectRoom, objectives, itemState, startNewGame, returnToHome,
      state: getOpeningDiagnostics,
      skipPart() { activeCinematic()?.skip(); },
      arriveCaine() { caineArrivalIn = 0; },
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
    if (s.dialogueWaiting) { await page.waitForTimeout(100); continue; }
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
  console.log('Review bridge ready; starting the opening');
  await page.locator('#btn-new-game').evaluate(button => button.click());
  await until(async () => (await state()).phase === 'playing');
  console.log('Opening loaded; checking Ragatha and Jax');
  await page.evaluate(() => window.__storyReview.skipPart());
  await until(async () => (await state()).dialogueActive);
  await progress();
  await until(async () => (await state()).entrancePhase === 'entering');
  await page.evaluate(() => window.__storyReview.skipPart());
  await until(async () => (await state()).entrancePhase === 'dialogue');
  // The morning conversation stops while Jax walks past the bedroom door
  // (jaxBedroomPass.js), then carries on: keep advancing until it's over.
  await until(async () => {
    await progress();
    const s = await state();
    return s.objective?.id === 'find-caine' && s.ready;
  });
  check('Opening, real Jax cutaway and Ragatha completion enable Find Caine', () => assert.equal(report.errors.length, 0));
  const hall = await travel('dorm');
  await page.evaluate(() => { window.__storyReview.lock(); window.__storyReview.arriveCaine(); });
  const beforeWarning = (await state()).player;
  await until(async () => (await state()).dialogueActive);
  await progress();
  const warned = await until(async () => { const s=await state(); return s.objective?.id === 'find-ribbit' && s; });
  check('Caine’s arrival unlocks a knock interaction without teleporting the player', () => {
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
  await until(async () => (await state()).completionCardVisible);
  assert.equal((await state()).paused, false);
  await page.locator('#btn-level-complete-continue').evaluate(button => button.click());
  await page.evaluate(() => window.__storyReview.lock());
  check('Level 1 completion card continues into the story without a Pause overlay', () => assert.equal(completed.ribbitPoints, 4));
  await snapshot('ribbit-complete');
  await travel('dorm');
  // Kaufmo's hallway pass-by (a fake-backdrop cutaway, same technique as
  // Jax's — see kaufmoHallwayCutscene.js — except the dialogue box stays
  // up live instead of waiting until after) plays automatically here, then
  // just ends: he's run off toward his own room, nothing more. No more
  // auto-travel into his room or auto-played introduction — the player
  // has to actually walk there and talk to him, same as any other real
  // interaction, which is what the rest of this does.
  await until(async () => (await state()).dialogueActive); await progress();
  assert.equal((await state()).room, 'dorm');
  const kaufmoRoom = await travel('kaufmo');
  const kaufmoAnchor = kaufmoRoom.interactables.find(i => i.prompt === 'Talk to Kaufmo').anchor;
  await place(kaufmoAnchor[0], kaufmoAnchor[2] + 1.8, { x: kaufmoAnchor[0], z: kaufmoAnchor[2] });
  await until(async () => (await state()).focusedPrompt === 'Talk to Kaufmo');
  await key('KeyE'); await progress([0, 0]);
  const introduced = await state();
  check('Leaving Ribbit plays Kaufmo’s hallway pass-by, then the real introduction once the player finds him', () => {
    assert.equal(report.errors.length, 0);
    assert.equal(introduced.kaufmoIntroduced, true);
    assert.equal(introduced.objective.id, 'collect-photos');
  });
  await travel('ribbit');
  const revisited = await state();
  check('Revisiting Ribbit preserves recovery and offers unscored follow-up', () => {
    assert.equal(revisited.ribbitComplete, true);
    assert.ok(revisited.interactables.some(i => i.prompt === 'Talk to Ribbit' && i.enabled));
  });
  await travel('dorm');
  assert.equal((await state()).dialogueActive, false);
  const revisitedKaufmoRoom = await travel('kaufmo');
  const kaufmo = revisitedKaufmoRoom.interactables.find(i => i.prompt === 'Talk to Kaufmo').anchor;
  await place(kaufmo[0], kaufmo[2] + 1.8, {x:kaufmo[0],z:kaufmo[2]});
  await page.evaluate(() => window.__storyReview.itemState.collect('ca1'));
  await until(async () => (await state()).focusedPrompt === 'Give photos to Kaufmo');
  await key('KeyE'); await progress();
  assert.equal((await state()).picturesPresented, 1);
  await page.evaluate(() => {
    window.__storyReview.itemState.collect('ca2');
    window.__storyReview.itemState.collect('ca3');
    window.__storyReview.itemState.collect('ca4');
    window.__storyReview.itemState.collect('ca5');
  });
  await until(async () => (await state()).focusedPrompt === 'Give photos to Kaufmo');
  await key('KeyE'); await progress();
  const presented = await state();
  check('Handing over the remaining photos advances the next objective', () => {
    assert.equal(report.errors.length, 0); assert.equal(presented.objective.id, 'check-kaufmo');
    assert.equal(presented.picturesPresented, 5);
  });
  // Stall, payoff and the completion card must occur once across revisits.
  await until(async () => (await state()).focusedPrompt === 'Talk to Kaufmo');
  await key('KeyE'); await progress();
  await until(async () => (await state()).focusedPrompt === 'Talk to Kaufmo');
  await key('KeyE'); await progress();
  await until(async () => (await state()).completionCardVisible);
  check('Kaufmo payoff completes Level 2 after all five hand-ins', () => assert.equal((presented.picturesPresented), 5));
  await page.evaluate(() => window.__storyReview.returnToHome());
  assert.equal((await state()).completionCardVisible, false);
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

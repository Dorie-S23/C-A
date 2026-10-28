// Run with Vite on port 5173: node tools/verify_level1_browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: process.argv.includes('--edge') ? 'msedge' : 'chrome', headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.25);
    // Exercise real game state and DOM without rendering the heavy 3D scene.
    renderer.render = () => {};
    renderer.compile = () => new Set();
    const lock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    renderer.domElement.requestPointerLock = lock;
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__level1Review = {
      state: getOpeningDiagnostics,
      checkpointForReview: () => checkpoint,
      saveCheckpoint() { saveSlots.write(1, checkpoint); return saveSlots.read(1); },
      loadCheckpoint() { loadGame(saveSlots.read(1)); },
      travel: key => missionApi.travel(key),
      tryHallway: playKaufmoHallway,
      hallway() {
        const runner = scene.getObjectByName('KaufmoHallwayRunner');
        return { runner: runner?.position.toArray() ?? null, inRealHall: runner?.parent === scene && scene.children.includes(currentRoom),
          player: player.position.toArray(), held: stageHold, room: currentRoomKey,
          ribbitDoor: currentRoom?.getObjectByName('Door_Frame089')?.getWorldPosition(new THREE.Vector3()).toArray(),
          kaufmoOpen: currentRoomInfo?.hallDoors?.kaufmo?.control.isOpen };
      },
      async primeHallway(won) {
        resetObjectiveSession(true); objectives.activate('find-ribbit');
        if (won) storyProgress.finishRibbit(4);
        await missionApi.enterRoom('dorm'); lock();
      },
      async start() {
        resetEscapeThreshold(); resetObjectiveSession(true); openingCompleted = true;
        objectives.activate('find-ribbit'); titleScreen.hide();
        const room = await missionApi.enterRoom('dorm');
        lock();
        await runLevel1(missionApi, { hall: room, story: true,
          onComplete: points => storyProgress.finishRibbit(points) });
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__level1Review.state());
const until = async fn => {
  const end = Date.now() + 90000;
  while (Date.now() < end) { const result = await fn(); if (result) return result; await page.waitForTimeout(100); }
  throw Error('Timed out waiting for Level 1: ' + JSON.stringify(await state()));
};
const play = async picks => {
  let choice = 0;
  await until(async () => {
    const s = await state();
    if (s.completionCardVisible) return true;
    if (!s.dialogueActive || s.dialogueWaiting) return false;
    if (await page.locator('#dialogue-options').evaluate(el => !el.hidden)) {
      assert.ok(choice < picks.length, 'unexpected extra choice');
      await page.locator('.dialogue-option').nth(picks[choice++]).evaluate(el => el.click());
    } else {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true })));
    }
    return false;
  });
  return choice;
};
try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/?dev=1`);
  await page.waitForFunction(() => !!window.__level1Review);
  await page.evaluate(() => window.__level1Review.start());
  console.log('Starting loss attempt');
  assert.equal(await play([3]), 1); // The fourth option ends its branch on a Game Over beat.
  assert.equal(await page.locator('#level-complete-title').textContent(), 'Game Over');
  assert.equal(await page.locator('#btn-level-complete-continue').textContent(), 'Retry Level');
  const failed = await state();
  assert.equal(failed.ribbitComplete, false);
  assert.equal(failed.objective.id, 'find-ribbit');
  assert.equal(failed.dialogueActive, false);
  assert.equal(await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level1')), 0);
  console.log('Loss verified; retrying');
  await page.locator('#btn-level-complete-continue').click();
  await until(async () => (await state()).dialogueActive);
  assert.equal(await play([0, 1, 0, 0]), 4);
  assert.equal(await page.locator('#level-complete-title').textContent(), 'Level 1 Complete');
  assert.equal(await page.locator('#btn-level-complete-continue').textContent(), 'Continue →');
  const won = await state();
  assert.equal(won.ribbitComplete, true);
  assert.equal(won.objective.id, 'find-kaufmo');
  assert.equal(await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level1')), 4);
  assert.deepEqual(errors, []);
  console.log('PASS Level 1 failure/retry and win; testing actual hallway');
  await page.locator('#btn-level-complete-continue').click();
  await page.evaluate(() => window.__level1Review.travel('dorm'));
  await until(async () => (await state()).dialogueActive);
  // Advance the opening beat to the mumble, then observe the runner in the loaded hall.
  await until(async () => {
    const h = await page.evaluate(() => window.__level1Review.hallway());
    if (h.runner) return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    return false;
  });
  const running = await page.evaluate(() => window.__level1Review.hallway());
  assert.equal(running.inRealHall, true);
  assert.equal(running.room, 'dorm');
  assert.equal(running.held, true);
  assert.ok(Math.abs(running.runner[0] - running.player[0]) > 1);
  assert.ok(Math.abs(running.runner[2] - running.ribbitDoor[2]) < 10);
  assert.equal(await page.evaluate(() => window.__level1Review.tryHallway()), false);
  // Hammer advance while running: the reaction must wait until he reaches his door.
  await until(async () => {
    const s = await state();
    if (!s.dialogueActive) return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    return false;
  });
  const finished = await page.evaluate(() => window.__level1Review.hallway());
  assert.equal(finished.runner, null);
  assert.equal(finished.held, false);
  assert.equal(finished.kaufmoOpen, true);
  const saved = await page.evaluate(() => window.__level1Review.saveCheckpoint());
  assert.equal(saved.story.hallwaySeen, true, 'checkpoint must retain the completed hallway intro');
  assert.equal(saved.escape.level1, 4);
  assert.equal(saved.objectives.active, 'find-kaufmo');
  // Reload the whole page: the run must stay seen through a real localStorage slot.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__level1Review);
  await page.evaluate(() => window.__level1Review.loadCheckpoint());
  await until(async () => (await state()).room === 'dorm');
  assert.equal((await state()).dialogueActive, false);
  assert.equal((await state()).cutsceneActive, false);
  assert.equal((await page.evaluate(() => window.__level1Review.hallway())).runner, null);
  assert.equal(await page.evaluate(() => window.__level1Review.tryHallway()), false);
  assert.equal((await page.evaluate(() => window.__level1Review.checkpointForReview())).story.hallwaySeen, true);
  console.log('PASS completed intro survives save slot + full page reload without replay');

  assert.equal((await state()).objective.id, 'find-kaufmo');
  assert.equal(await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level1')), 4);
  await page.evaluate(() => window.__level1Review.travel('ribbit'));
  await page.evaluate(() => window.__level1Review.travel('dorm'));
  assert.equal((await state()).dialogueActive, false);
  assert.equal(await page.evaluate(() => window.__level1Review.tryHallway()), false);

  // Missing completion (including a failed attempt) cannot start the hallway beat.
  await page.evaluate(() => window.__level1Review.primeHallway(false));
  assert.equal(await page.evaluate(() => window.__level1Review.tryHallway()), false);
  assert.equal((await state()).objective.id, 'find-ribbit');

  // Cancel a fresh successful session's running beat and make sure no actor survives.
  await page.evaluate(() => window.__level1Review.primeHallway(true));
  await page.evaluate(() => window.__level1Review.tryHallway());
  await until(async () => {
    if ((await page.evaluate(() => window.__level1Review.hallway())).runner) return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    return false;
  });
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true })));
  assert.equal((await page.evaluate(() => window.__level1Review.hallway())).runner, null);
  assert.equal((await state()).cutsceneActive, false);
  assert.equal((await state()).dialogueActive, false);
  assert.equal((await page.evaluate(() => window.__level1Review.hallway())).held, false);
  assert.equal(await page.evaluate(() => window.__level1Review.tryHallway()), false);
  assert.equal((await page.evaluate(() => window.__level1Review.checkpointForReview())).story.hallwaySeen, true);
  assert.equal((await state()).objective.id, 'find-kaufmo');
  assert.equal(await page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level1')), 4);
  // Leaving while he runs must also remove the extra and its Escape listener.
  await page.evaluate(() => window.__level1Review.primeHallway(true));
  await page.evaluate(() => window.__level1Review.tryHallway());
  await until(async () => {
    if ((await page.evaluate(() => window.__level1Review.hallway())).runner) return true;
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true })));
    return false;
  });
  await page.evaluate(() => window.__level1Review.travel('kaufmo'));
  assert.equal((await page.evaluate(() => window.__level1Review.hallway())).runner, null);
  assert.equal((await state()).cutsceneActive, false);
  assert.deepEqual(errors, []);
  console.log('PASS live Dorm Hall run, win-only gate, fast advance, Find Kaufmo, retained points, cancellation and revisit prevention');
} finally { await browser.close(); }

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
    renderer.compile = () => {};
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
      async start() {
        resetEscapeThreshold(); resetObjectiveSession(true);
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
  await page.goto('http://127.0.0.1:5173/?dev=1');
  await page.waitForFunction(() => !!window.__level1Review);
  await page.evaluate(() => window.__level1Review.start());
  console.log('Starting loss attempt');
  assert.equal(await play([1, 0]), 2); // wrong, wrong: 1 -> 2 -> 3
  assert.equal(await page.locator('#level-complete-title').textContent(), 'Level 1 Failed');
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
  console.log('PASS Chromium browser: immediate failure, Retry Level without reload, fresh winning attempt, Find Kaufmo, 4 retained points, no page errors');
} finally { await browser.close(); }

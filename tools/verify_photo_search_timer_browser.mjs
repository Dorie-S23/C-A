// With Vite running: node tools/verify_photo_search_timer_browser.mjs
// Exercises the real countdown, failure card and room reload across retries.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/photo-search-timer');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const report = { pass: false, checks: [], errors: [] };
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') report.errors.push(message.text());
});
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `\n
    renderer.setPixelRatio(0.25);
    renderer.domElement.requestPointerLock = () => window.__photoReview.lock();
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__photoReview = {
      async start() {
        resetObjectiveSession(true);
        itemState.reset();
        objectives.activate('find-ribbit');
        storyProgress.finishRibbit(4);
        storyProgress.finishKaufmoIntro();
        titleScreen.hide();
        await missionApi.travel('tadc');
      },
      lock() {
        Object.defineProperty(document, 'pointerLockElement', {
          value: renderer.domElement, configurable: true,
        });
        document.dispatchEvent(new Event('pointerlockchange'));
      },
      tick: updateSearchTimer,
      items: itemState,
      returnToHome,
      collectAll() { for (let i = 1; i <= PHOTO_COUNT; i++) itemState.collect('ca' + i); },
      state() {
        updatePictureCounter();
        return {
          room: currentRoomKey, ready: readyToPlay, objective: objectives.active?.id,
          timeLeft: searchTimeLeft, timerVisible: !searchTimer.hidden,
          timerText: searchTimer.textContent, found: itemState.totalFound(),
          presented: itemState.totalPresented(),
          failureVisible: !levelCompletePanel.hidden,
          failureTitle: levelCompleteTitle.textContent,
        };
      },
    };` });
});
const state = () => page.evaluate(() => window.__photoReview.state());
const check = (name, verify) => { verify(); report.checks.push(name); console.log('PASS', name); };
const ready = room => page.waitForFunction(room => {
  const s = window.__photoReview.state();
  return s.ready && s.room === room;
}, room, { timeout: 120000 });
const lock = () => page.evaluate(() => window.__photoReview.lock());
const expire = () => page.evaluate(() => window.__photoReview.tick(181));
const continueSearch = async () => {
  await page.locator('#btn-level-complete-continue').click();
  await ready('kaufmo');
  await lock();
};

try {
  await page.goto('http://127.0.0.1:5173/?dev=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__photoReview);
  await page.evaluate(() => window.__photoReview.start());
  await ready('tadc');
  await lock();
  const initial = await state();
  check('The first photo search displays the three-minute countdown', () => {
    assert.equal(initial.objective, 'collect-photos');
    assert.equal(initial.timerVisible, true);
    assert.ok(initial.timeLeft > 175 && initial.timeLeft <= 180);
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.evaluate(() => {
      window.__photoReview.items.collect('ca1');
      window.__photoReview.items.presentHeld();
      window.__photoReview.items.collect('ca2');
    });
    await expire();
    const failed = await state();
    check(`Timeout ${attempt} shows the failure card and stops the countdown`, () => {
      assert.equal(failed.failureVisible, true);
      assert.equal(failed.failureTitle, 'LEVEL 2 FAILED');
      assert.equal(failed.timeLeft, null);
    });
    await continueSearch();
    const retried = await state();
    check(`Retry ${attempt} clears photos and restores a visible three-minute countdown`, () => {
      assert.equal(retried.objective, 'collect-photos');
      assert.equal(retried.found, 0);
      assert.equal(retried.presented, 0);
      assert.equal(retried.timerVisible, true);
      assert.ok(retried.timeLeft > 175 && retried.timeLeft <= 180);
      assert.match(retried.timerText, /^Time left: [23]:/);
    });
  }

  await page.evaluate(() => document.exitPointerLock());
  const paused = await state();
  await expire();
  const stillPaused = await state();
  check('Pausing a retried search freezes its countdown', () => {
    assert.equal(stillPaused.timeLeft, paused.timeLeft);
  });
  await lock();
  await page.evaluate(() => window.__photoReview.collectAll());
  await expire();
  const collected = await state();
  check('Finding all five photos stops the timer before hand-in', () => {
    assert.equal(collected.found, 5);
    assert.equal(collected.presented, 0);
    assert.equal(collected.timeLeft, null);
    assert.equal(collected.timerVisible, false);
    assert.equal(collected.failureVisible, false);
  });

  // Leaving while the failure card is open must cancel its pending restart.
  await page.evaluate(() => window.__photoReview.start());
  await lock();
  await expire();
  await page.evaluate(() => window.__photoReview.returnToHome());
  const home = await state();
  check('Returning home cancels the failure card without restarting the search', () => {
    assert.equal(home.ready, false);
    assert.equal(home.failureVisible, false);
    assert.equal(home.timeLeft, null);
  });
  assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (error) {
  report.failure = error.stack;
  report.lastState = await state().catch(() => null);
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

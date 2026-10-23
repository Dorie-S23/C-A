// With Vite running: node tools/verify_photo_search_timer_browser.mjs
// Real rooms, pickup/hand-in callbacks and HUD; the review bridge skips travel
// distances and advances the gameplay clock to exercise deadline boundaries.
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
        await missionApi.travel('tadc', { from: null });
      },
      lock() {
        Object.defineProperty(document, 'pointerLockElement', {
          value: renderer.domElement, configurable: true,
        });
        document.dispatchEvent(new Event('pointerlockchange'));
      },
      async travel(room) {
        const before = searchTimeLeft;
        const travel = missionApi.travel(room);
        const loading = !readyToPlay;
        updateSearchTimer(999);
        const after = searchTimeLeft;
        await travel;
        return { before, after, loading };
      },
      tick: updateSearchTimer,
      returnToHome,
      pickup(count = PHOTO_COUNT) {
        interactables.filter(i => i.prompt() === 'Pick up photo').slice(0, count)
          .forEach(i => i.interact());
      },
      handIn(lastSecond = false) {
        if (lastSecond) searchTimeLeft = 1;
        const interaction = interactables.find(i => i.anchor === currentRoomInfo.kaufmoApi.kaufmo);
        interaction.interact(); // the same callback used by E on Kaufmo
        return this.state();
      },
      state() {
        updatePictureCounter();
        return {
          room: currentRoomKey, ready: readyToPlay, objective: objectives.active?.id,
          timeLeft: searchTimeLeft, timerVisible: !searchTimer.hidden,
          timerText: searchTimer.textContent, counterText: pictureCounter.textContent,
          found: itemState.totalFound(), presented: itemState.totalPresented(),
          dialogue: dialogueUI.isActive,
          position: [player.position.x, player.position.z],
          photos: (currentRoom?.children ?? []).filter(c => c.name === 'OfficePicture')
            .map(c => ({ position: c.position.toArray(), rotation: c.rotation.toArray() })),
          failureVisible: !levelCompletePanel.hidden,
          failureTitle: levelCompleteTitle.textContent,
          failureSubtitle: levelCompleteSubtitle.textContent,
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
const tick = seconds => page.evaluate(seconds => window.__photoReview.tick(seconds), seconds);
const travel = async room => {
  const result = await page.evaluate(room => window.__photoReview.travel(room), room);
  assert.equal(result.loading, true);
  assert.equal(result.after, result.before, 'Loading must not spend search time');
  await ready(room);
  await lock();
};
const continueSearch = async () => {
  await page.locator('#btn-level-complete-continue').click();
  await ready('tadc');
  await lock();
};
const finishDialogue = async () => {
  for (let i = 0; i < 120 && (await state()).dialogue; i++) {
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Space', key: ' ', bubbles: true, cancelable: true,
    })));
    await page.waitForTimeout(30);
  }
  assert.equal((await state()).dialogue, false, 'Hand-in dialogue should finish');
};
const points = () => page.evaluate(async () => (await import('/src/state/escapeThreshold.js')).getLevelPoints('level2'));

try {
  await page.goto('http://127.0.0.1:5173/?dev=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__photoReview);
  await page.evaluate(() => window.__photoReview.start());
  await ready('tadc');
  await lock();
  const initial = await state();
  check('The first attempt begins in the Lobby with five photos and four minutes', () => {
    assert.equal(initial.objective, 'collect-photos');
    assert.equal(initial.timerVisible, true);
    assert.equal(initial.photos.length, 5);
    assert.ok(initial.timeLeft > 235 && initial.timeLeft <= 240);
  });

  await page.evaluate(() => document.exitPointerLock());
  const paused = await state();
  await tick(999);
  const stillPaused = await state();
  check('Pause freezes the countdown', () => assert.equal(stillPaused.timeLeft, paused.timeLeft));
  await lock();

  await page.evaluate(() => window.__photoReview.pickup(2));
  await travel('kaufmo');
  const beforeDelivery = await state();
  const partial = await page.evaluate(() => window.__photoReview.handIn());
  await tick(999);
  const duringDialogue = await state();
  check('Partial delivery preserves the clock and dialogue spends no time', () => {
    assert.equal(partial.presented, 2);
    assert.equal(partial.dialogue, true);
    assert.equal(partial.objective, 'collect-photos');
    assert.ok(partial.timeLeft <= beforeDelivery.timeLeft && partial.timeLeft > beforeDelivery.timeLeft - 1);
    assert.equal(duringDialogue.timeLeft, partial.timeLeft);
  });
  await finishDialogue();
  await lock();
  await tick(5);
  assert.ok((await state()).timeLeft <= partial.timeLeft - 5);
  assert.equal(await points(), 2);
  await travel('tadc');
  const revisited = await state();
  check('Returning after a partial delivery preserves the remaining photo positions and rotations', () => {
    assert.deepEqual(revisited.photos, initial.photos.slice(2));
    assert.match(revisited.counterText, /found: 2\/5.*Delivered: 2\/5/);
  });

  await page.evaluate(() => window.__photoReview.pickup());
  await page.waitForFunction(() => document.querySelector('[data-objective-title]').textContent === 'Return to Kaufmo');
  const allFound = await state();
  check('The fifth pickup keeps the timer running and directs the player to Kaufmo', () => {
    assert.equal(allFound.found, 5);
    assert.equal(allFound.presented, 2);
    assert.equal(allFound.timerVisible, true);
    assert.ok(allFound.timeLeft > 0 && allFound.timeLeft < initial.timeLeft - 5);
    assert.match(allFound.counterText, /found: 5\/5.*Delivered: 2\/5/);
  });
  await travel('dorm');
  const hallway = await state();
  await tick(5);
  const walked = await state();
  check('The return through Dorm Hall displays and spends the remaining time', () => {
    assert.equal(hallway.timerVisible, true);
    assert.ok(walked.timeLeft <= hallway.timeLeft - 5);
  });
  await page.screenshot({ path: path.join(output, 'return-to-kaufmo.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'return-mobile.png') });
  await page.setViewportSize({ width: 800, height: 600 });
  await tick(999);
  const failed = await state();
  check('Time can expire with all photos found but only some delivered', () => {
    assert.equal(failed.failureVisible, true);
    assert.equal(failed.failureTitle, 'LEVEL 2 FAILED');
    assert.match(failed.failureSubtitle, /get all five photos back to Kaufmo/);
    assert.equal(failed.timeLeft, null);
  });

  for (let attempt = 1; attempt <= 2; attempt++) {
    await continueSearch();
    const retried = await state();
    check('Retry ' + attempt + ' restores the Lobby start, layout, inventory and countdown', () => {
      assert.equal(retried.room, 'tadc');
      assert.deepEqual(retried.position, initial.position);
      assert.equal(retried.objective, 'collect-photos');
      assert.equal(retried.found, 0);
      assert.equal(retried.presented, 0);
      assert.equal(retried.photos.length, 5);
      assert.notDeepEqual(retried.photos, initial.photos);
      assert.equal(retried.timerVisible, true);
      assert.ok(retried.timeLeft > 235 && retried.timeLeft <= 240);
    });
    assert.equal(await points(), 0);
    await page.evaluate(() => window.__photoReview.pickup());
    if (attempt === 1) {
      await tick(999);
      assert.equal((await state()).failureVisible, true, 'All held, none delivered must still fail');
    }
  }

  await travel('dorm');
  await travel('kaufmo');
  const delivered = await page.evaluate(() => window.__photoReview.handIn(true));
  await tick(999);
  check('Handing in the final photos with one second left wins immediately', () => {
    assert.equal(delivered.presented, 5);
    assert.equal(delivered.timeLeft, null);
    assert.equal(delivered.objective, 'check-kaufmo');
    assert.equal(delivered.dialogue, true);
    assert.equal(delivered.failureVisible, false);
  });
  await finishDialogue();
  await lock();
  await tick(999);
  const afterDelivery = await state();
  assert.equal(afterDelivery.failureVisible, false);
  assert.equal(afterDelivery.timerVisible, false);
  assert.equal(await points(), 5);
  check('Final dialogue and free play cannot restart the completed countdown', () => assert.equal(afterDelivery.timeLeft, null));

  await page.evaluate(() => window.__photoReview.start());
  await lock();
  assert.equal(await points(), 0);
  assert.equal((await state()).photos.length, 5);
  await tick(999);
  await page.evaluate(() => window.__photoReview.returnToHome());
  const home = await state();
  check('Returning home cancels a pending retry and clears its timer', () => {
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

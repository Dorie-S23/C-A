// With Vite running: node tools/verify_maze_counter_browser.mjs
// Real room assets, pickup callbacks and the animation-loop HUD. The bridge
// skips walking distances, emulates pointer lock and disables 3D rendering.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MAZE_SEARCH_SECONDS as FULL } from '../src/state/mazeItems.js';

const output = path.resolve('artifacts/maze-counter');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [],
  instrumentation: 'Real rooms and pickup callbacks; emulated pointer lock; 3D drawing and shader warm-up disabled. Held test cutscenes/cinematics and accelerated gameplay-clock updates exercise countdown boundaries.' };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.25);
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
    window.__mazeCounterReview = {
      async start() {
        returnToHome(); resetObjectiveSession(); mazeItems.reset(); itemState.reset();
        openingCompleted = true; titleScreen.hide();
        await missionApi.travel('maze');
      },
      lock,
      travel: room => missionApi.travel(room),
      beginTravel(room) {
        const statusBeforeLoading = mazeSearch.status;
        const timeBeforeLeaving = mazeSearch.timeLeft;
        window.__mazeCounterTravel = missionApi.travel(room);
        const timeBeforeLoading = mazeSearch.timeLeft;
        updateMazeSearch(999);
        return { ...this.state(), statusBeforeLoading, timeBeforeLeaving, timeBeforeLoading };
      },
      finishTravel: () => window.__mazeCounterTravel,
      pickup() {
        const pickup = interactables.find(i => i.prompt().startsWith('Pick up ') && i.prompt() !== 'Pick up photo');
        if (!pickup) throw Error('No maze item pickup is available');
        window.__mazeLastPickup = pickup;
        pickup.interact(interactionContext);
      },
      repeatPickup: () => window.__mazeLastPickup.interact(interactionContext),
      pickupPhoto() {
        const pickup = interactables.find(i => i.prompt() === 'Pick up photo');
        if (!pickup) throw Error('No photo pickup is available');
        pickup.interact(interactionContext);
      },
      dialogue() {
        dialogueUI.play([{ type: 'line', speaker: 'pomni', side: 'left', text: 'Checking the maze items.' }]);
      },
      cancelDialogue: () => dialogueUI.cancel(),
      cutscene(active) {
        if (active) runCutscene({ update: () => false }, () => {});
        else cancelCutscene();
      },
      hold: held => stage.hold(held),
      tick(seconds) { updateMazeSearch(0); updateMazeSearch(seconds); },
      frame: seconds => updateMazeSearch(seconds),
      placeAt(target) {
        let point = target === 'spawn' ? currentRoomInfo.spawn : triggers.exit.getCenter(new THREE.Vector3());
        if (target === 'jax' || target === 'jax-approach') {
          const anchor = currentRoomInfo.jaxEncounter.anchor.position;
          const approach = triggers.jax.getCenter(new THREE.Vector3());
          point = anchor.clone().lerp(approach, target === 'jax' ? 0.5 : 2);
        }
        stage.place({ x: point.x, z: point.z });
      },
      blockJax() {
        this.placeAt('jax');
        const midpoint = currentRoomInfo.jaxEncounter.anchor.position.clone().lerp(player.position, 0.5);
        window.__mazeJaxBlock = new THREE.Box3(
          new THREE.Vector3(midpoint.x - 0.2, 0, midpoint.z - 0.2),
          new THREE.Vector3(midpoint.x + 0.2, 3, midpoint.z + 0.2));
        colliders.push(window.__mazeJaxBlock);
      },
      unblockJax() {
        colliders = colliders.filter(box => box !== window.__mazeJaxBlock);
        this.placeAt('spawn');
      },
      rememberJax: () => { window.__retainedJax = mazeEncounter; },
      staleJax: () => window.__retainedJax.update({inRange:true,visible:true,eligible:true}),
      triggers: () => { lastMazeExitHint=0;checkTriggers(player); },
      cinematic(active) {
        activeEntrance = active ? { active: true, phase: 'held', update() {}, dispose() {} } : null;
      },
      tabHidden(hidden) {
        Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      },
      primeCheckpoint() {
        resetObjectiveSession(true); openingCompleted = true;
        objectives.activate('find-ribbit'); storyProgress.finishRibbit(4); storyProgress.finishKaufmoIntro();
        takeCheckpoint(); return structuredClone(checkpoint);
      },
      loadCheckpoint: data => loadGame(data),
      async startStory() {
        returnToHome(); resetObjectiveSession(true); mazeItems.reset(); itemState.reset();
        openingCompleted = true; titleScreen.hide();
        await missionApi.travel('maze');
      },
      checkpoint: () => structuredClone(checkpoint),
      home: () => returnToHome(),
      newGame: () => startNewGame(),
      async revisitAfterNewGame() {
        returnToHome(); resetObjectiveSession(); titleScreen.hide();
        await missionApi.travel('maze');
      },
      state() {
        return { room: currentRoomKey, roomLoaded: Boolean(currentRoom), ready: readyToPlay, paused,
          found: mazeItems.totalFound(), hidden: mazeItemsCounter.hidden, text: mazeItemsCounter.textContent,
          photoFound: itemState.totalFound(), pictureHidden: pictureCounter.hidden, pictureText: pictureCounter.textContent,
          remaining: interactables.filter(i => i.prompt().startsWith('Pick up ')).length,
          timeLeft: mazeSearch.timeLeft, searchStatus: mazeSearch.status, seed: mazeAttemptSeed, foundJax,
          timerHidden: mazeSearchTimer.hidden, timerText: mazeSearchTimer.textContent,
          objectiveHidden: document.getElementById('maze-objective-hud').hidden,
          objectiveTitle: document.querySelector('[data-maze-title]').textContent,
          objectiveDetail: mazeSearchInstructions().detail,
          boundaryLocked:currentRoomInfo?.jaxBoundary?.locked, jaxComplete:mazeItems.jaxComplete,
          objective: objectives.active?.id ?? null, dialogueActive: dialogueUI.isActive,
          promptHidden: interactPrompt.hidden, promptText: interactPrompt.textContent,
          jaxReachable: canReachMazeJax(),
          cardVisible: !levelCompletePanel.hidden, cardTitle: levelCompleteTitle.textContent,
          token: loadToken, titleActive: titleScreen.active, escape: snapshotEscapeThreshold(),
          position: [player.position.x, player.position.z],
          spawn: currentRoomInfo ? [currentRoomInfo.spawn.x, currentRoomInfo.spawn.z] : null,
          hint: hint.textContent, hintVisible: hint.classList.contains('visible'),
          fadeOn: document.getElementById('scene-fade').classList.contains('on'),
          cardSubtitle: levelCompleteSubtitle.textContent, ending: storyProgress.ending };
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__mazeCounterReview.state());
const call = (method, value) => page.evaluate(({ method, value }) => window.__mazeCounterReview[method](value), { method, value });
const visible = async (text = 'Objects found: 1/2') => {
  await page.waitForFunction(text => {
    const s = window.__mazeCounterReview.state();
    return !s.hidden && s.text === text;
  }, text, { timeout: 120000 });
  assert.equal(await page.locator('#maze-items-counter').isVisible(), true);
};
const hidden = async () => {
  await page.waitForFunction(() => window.__mazeCounterReview.state().hidden);
  assert.equal(await page.locator('#maze-items-counter').isVisible(), false);
  if ((await state()).room === 'maze') {
    await page.waitForFunction(() => window.__mazeCounterReview.state().objectiveHidden);
  }
};
const travel = async room => {
  const loading = await call('beginTravel', room);
  assert.equal(loading.ready, false);
  assert.equal(loading.hidden, true, 'The maze HUD hides immediately when loading starts');
  assert.equal(loading.timerHidden, true);
  assert.equal(loading.timeLeft, loading.timeBeforeLoading, 'Loading does not spend maze search time');
  if (loading.statusBeforeLoading === 'expired') {
    assert.equal(loading.searchStatus, 'idle', 'Leaving a failed attempt clears its expired clock');
    assert.equal(loading.timeLeft, null);
  } else {
    assert.equal(loading.timeLeft, loading.timeBeforeLeaving, 'A normal detour preserves the attempt clock');
  }
  await call('finishTravel');
  await page.waitForFunction(room => {
    const s = window.__mazeCounterReview.state();
    return s.ready && s.room === room;
  }, room, { timeout: 120000 });
  await call('lock');
};
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5174'}/?dev=1&mazeSeed=12345`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__mazeCounterReview);
  await check('The maze counter is hidden on the title screen', hidden);
  await call('start');
  await check('The loaded maze retains the full clock while waiting to become playable', async () => {
    await call('tick', 999);
    const waiting = await state();
    assert.equal(waiting.timeLeft, FULL);
    assert.equal(waiting.searchStatus, 'searching');
    assert.equal(waiting.timerHidden, true);
    assert.equal(await page.locator('#maze-search-timer').getAttribute('role'), 'timer');
    assert.equal(await page.locator('#maze-search-timer').getAttribute('aria-live'), 'off');
  });
  await call('lock');
  await check('A playable maze shows a styled, accessible 0/2 counter', async () => {
    await visible('Objects found: 0/2');
    const s = await state();
    assert.equal(s.remaining, 2);
    assert.equal(s.pictureHidden, true);
    assert.equal(s.objective, null, 'Maze guidance must not activate a saved campaign objective');
    await page.waitForFunction(() => !window.__mazeCounterReview.state().objectiveHidden);
    assert.equal((await state()).objectiveTitle, "Find Jax's missing objects");
    assert.match((await state()).objectiveDetail, /bowling ball and hot chocolate mug/);
    const element = page.locator('#maze-objective-hud');
    assert.equal(await element.getAttribute('role'), 'status');
    assert.equal(await element.getAttribute('aria-live'), 'polite');
    assert.equal(await element.getAttribute('aria-atomic'), 'true');
    const counterBox=await page.locator('#maze-items-counter').boundingBox(),trackerBox=await element.boundingBox();
    assert.ok(counterBox&&trackerBox&&counterBox.x>=trackerBox.x&&counterBox.x+counterBox.width<=trackerBox.x+trackerBox.width);
    assert.equal(await element.evaluate(node=>getComputedStyle(node).pointerEvents),'none');
  });
  await check('Pickup advances the persistent counter and retains the original hint', async () => {
    await call('pickup');
    await visible();
    const s = await state();
    assert.equal(s.remaining, 1);
    assert.match(s.hint, /^Found the .+\. \(1\/2\)$/);
    assert.equal(s.hintVisible, true);
    assert.equal(s.photoFound, 0);
    await call('repeatPickup');
    assert.equal((await state()).found, 1);
    await page.evaluate(() => document.getElementById('hint').classList.remove('visible'));
    await visible();
  });
  await check('An unchanged count does not repeatedly mutate the live region', async () => {
    await page.evaluate(() => {
      window.__mazeCounterWrites = 0;
      window.__mazeCounterObserver = new MutationObserver(records => window.__mazeCounterWrites += records.length);
      window.__mazeCounterObserver.observe(document.getElementById('maze-items-counter'), { childList: true, characterData: true, subtree: true });
    });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.__mazeCounterWrites), 0);
    await page.evaluate(() => window.__mazeCounterObserver.disconnect());
  });
  await check('Pause hides the counter and Resume restores the same count', async () => {
    await page.evaluate(() => document.exitPointerLock());
    await hidden();
    assert.equal((await state()).paused, true);
    await page.locator('#btn-resume').click();
    await visible();
  });
  await check('Dialogue hides the counter and cancellation restores it', async () => {
    await call('dialogue'); await hidden();
    await call('cancelDialogue'); await visible();
  });
  await check('Cutscenes and staged actions hide the counter without clearing items', async () => {
    await call('cutscene', true); await hidden();
    await call('cutscene', false); await visible();
    await call('hold', true); await hidden();
    await call('hold', false); await visible();
  });
  await check('Controls, credits and title-option panels hide the counter', async () => {
    for (const id of ['controls', 'credits', 'title-options']) {
      await page.evaluate(id => {
        const element = document.getElementById(id);
        if (id === 'credits') element.classList.remove('hidden'); else element.hidden = false;
      }, id);
      await hidden();
      await page.evaluate(id => {
        const element = document.getElementById(id);
        if (id === 'credits') element.classList.add('hidden'); else element.hidden = true;
      }, id);
      await visible();
    }
  });
  await check('Loading and other rooms hide the maze counter; Level 2 photos remain independent', async () => {
    await travel('tadc'); await hidden();
    await page.waitForFunction(() => !window.__mazeCounterReview.state().pictureHidden);
    assert.equal((await state()).pictureText, 'Photos found: 0/5 · Delivered: 0/5');
    await call('pickupPhoto');
    await page.waitForFunction(() => window.__mazeCounterReview.state().pictureText === 'Photos found: 1/5 · Delivered: 0/5');
    assert.equal((await state()).found, 1);
    await travel('maze'); await visible();
    assert.equal((await state()).remaining, 1);
    assert.equal((await state()).photoFound, 1);
  });
  await check('Collecting both items shows 2/2, including after another revisit', async () => {
    await call('pickup'); await visible('Objects found: 2/2');
    assert.equal((await state()).remaining, 0);
    await travel('maze'); await visible('Objects found: 2/2');
    assert.equal((await state()).remaining, 0);
  });
  await check('The counter stays within a narrow viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('#maze-items-counter').boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390);
    const objective = await page.locator('#maze-objective-hud').boundingBox();
    const timer = await page.locator('#maze-search-timer').boundingBox();
    assert.ok(objective && timer && timer.y >= objective.y && timer.y + timer.height <= objective.y + objective.height, 'Countdown stays inside the unified tracker');
    assert.ok(objective.x >= 0 && objective.x + objective.width <= 390);
    await page.setViewportSize({ width: 1000, height: 750 });
  });
  await check('Home hides the counter; New Game resets finds before a fresh maze attempt', async () => {
    await call('home'); await hidden();
    await call('newGame');
    assert.equal((await state()).found, 0);
    await hidden();
    await page.waitForFunction(() => {
      const s = window.__mazeCounterReview.state();
      return s.room === 'pomni' && s.roomLoaded;
    }, null, { timeout: 120000 });
    await call('revisitAfterNewGame'); await call('lock');
    await visible('Objects found: 0/2');
    assert.equal((await state()).remaining, 2);
  });
  await check('The maze countdown begins at its full time and advances only when playable', async () => {
    await page.waitForFunction(() => !window.__mazeCounterReview.state().timerHidden);
    const initial = await state();
    assert.ok(initial.timeLeft > FULL - 5 && initial.timeLeft <= FULL);
    assert.match(initial.timerText, new RegExp(`^Time left: (${FULL / 60}:00|${FULL / 60 - 1}:5\d)$`));
    await call('tick', 5);
    assert.ok((await state()).timeLeft <= initial.timeLeft - 5);
  });
  await check('Pause, dialogue, cutscenes, cinematics, staging, menus and hidden tabs freeze the maze clock', async () => {
    const unchanged = async () => {
      const before = (await state()).timeLeft;
      await call('tick', 999);
      assert.equal((await state()).timeLeft, before);
    };
    await page.evaluate(() => document.exitPointerLock()); await unchanged();
    await page.locator('#btn-resume').click();
    await call('dialogue'); await unchanged(); await call('cancelDialogue');
    await call('cutscene', true); await unchanged(); await call('cutscene', false);
    await call('cinematic', true); await unchanged(); await call('cinematic', false);
    await call('hold', true); await unchanged(); await call('hold', false);
    await page.evaluate(() => document.getElementById('save-slots').hidden = false);
    await unchanged();
    await page.evaluate(() => document.getElementById('save-slots').hidden = true);
    await call('tabHidden', true); await unchanged();
    const resumed = await page.evaluate(() => {
      const review = window.__mazeCounterReview;
      const before = review.state().timeLeft;
      review.tabHidden(false);
      review.frame(999);
      return { before, after: review.state().timeLeft };
    });
    assert.equal(resumed.after, resumed.before, 'Resuming a hidden tab must not charge suspended time');
    await call('tick', 0);
    assert.equal((await state()).searchStatus, 'searching');
  });
  await check('Room detours freeze the maze clock and seeded revisits retain the attempt', async () => {
    await call('pickup');
    const before = await state();
    await travel('tadc');
    const outside = await state();
    await call('tick', 999);
    assert.equal((await state()).timeLeft, outside.timeLeft);
    assert.equal(outside.seed, before.seed);
    await travel('maze');
    const revisited = await state();
    assert.equal(revisited.seed, before.seed);
    assert.equal(revisited.found, 1);
    assert.ok(revisited.timeLeft > before.timeLeft - 2 && revisited.timeLeft <= before.timeLeft);
  });
  await check('Jax without both items cannot stop the clock, and the exit cannot complete Level 3', async () => {
    await call('placeAt', 'jax'); await call('tick', 1);
    assert.equal((await state()).foundJax, false);
    assert.equal((await state()).searchStatus, 'searching');
    assert.equal((await state()).boundaryLocked,true);
    assert.equal((await state()).dialogueActive,false);
    await call('rememberJax');
    await call('placeAt', 'exit'); await call('triggers');
    assert.match((await state()).hint,/missing bowling ball and hot chocolate mug/);
    assert.equal((await state()).ready, true);
    assert.equal((await state()).cardVisible, false);
    assert.equal((await state()).searchStatus, 'searching');
    await call('placeAt', 'spawn');
  });
  await check('Both items still need a close, unobstructed Jax arrival, not the old approach trigger', async () => {
    await call('pickup'); await call('tick', 1);
    assert.equal((await state()).found, 2);
    assert.equal((await state()).searchStatus, 'searching');
    await page.waitForFunction(() => window.__mazeCounterReview.state().objectiveTitle === 'Find Jax');
    await call('placeAt', 'jax-approach'); await call('tick', 1);
    assert.equal((await state()).jaxReachable, false);
    assert.equal((await state()).searchStatus, 'searching');
    await call('blockJax'); await call('tick', 1);
    assert.equal((await state()).jaxReachable, false, 'A wall between Pomni and Jax must block arrival');
    assert.equal((await state()).searchStatus, 'searching');
    await page.waitForFunction(() => window.__mazeCounterReview.state().promptHidden);
    await call('unblockJax');
  });
  await check('Close arrival stops the clock and starts the final dialogue; cancellation never unlocks the exit', async () => {
    const before=await state();await call('placeAt','jax');await call('tick',0);
    await page.waitForFunction(()=>window.__mazeCounterReview.state().dialogueActive);
    const reached=await state();assert.equal(reached.searchStatus,'reached');assert.equal(reached.jaxComplete,false);
    await call('tick',999);assert.equal((await state()).timeLeft,reached.timeLeft);
    await call('cancelDialogue');await call('placeAt','exit');await call('triggers');
    assert.equal((await state()).ready,true);assert.equal((await state()).cardVisible,false);
    assert.match((await state()).hint,/finish your conversation/);assert.deepEqual((await state()).escape,before.escape);
    await travel('maze');assert.equal((await state()).searchStatus,'reached');assert.equal((await state()).timeLeft,reached.timeLeft);
    const revisited=await state();await call('staleJax');assert.equal((await state()).hint,revisited.hint);
  });
  await call('start'); await call('lock');
  await check('Even with both items, timeout before reaching Jax shows one LEVEL 3 FAILED card', async () => {
    await call('pickup'); await call('pickup');
    await page.evaluate(async () => {
      const score = await import('/src/state/escapeThreshold.js');
      score.setLevelPoints('level1', 3); score.setLevelPoints('level2', 2);
    });
    await call('tick', 999);
    const failed = await state();
    assert.equal(failed.searchStatus, 'expired'); assert.equal(failed.timeLeft, 0);
    assert.equal(failed.cardVisible, true); assert.equal(failed.cardTitle, 'LEVEL 3 FAILED');
    assert.equal(await page.locator('#btn-level-complete-continue').textContent(), 'Retry');
    await call('tick', 999); await call('tick', 999);
    assert.equal((await state()).token, failed.token);
    assert.deepEqual((await state()).escape, failed.escape);
  });
  await check('Double Retry returns to the entrance with a fresh seed, two items and a full clock', async () => {
    const failed = await state();
    await page.locator('#btn-level-complete-continue').evaluate(button => {
      const random = Math.random;
      const failedSeed = window.__mazeCounterReview.state().seed;
      Math.random = () => failedSeed / 0x100000000;
      button.click(); button.click();
      queueMicrotask(() => { Math.random = random; });
    });
    await page.waitForFunction(() => {
      const s = window.__mazeCounterReview.state();
      return s.ready && s.room === 'maze' && s.searchStatus === 'searching';
    }, null, { timeout: 120000 });
    await call('tick', 999);
    assert.equal((await state()).timeLeft, FULL, 'Retry loading and waiting for pointer lock spend no time');
    await call('lock');
    const retried = await state();
    assert.equal(retried.seed, (failed.seed + 1) >>> 0, 'A repeated random seed is replaced by a different uint32 seed');
    assert.equal(retried.token, failed.token + 1);
    assert.equal(retried.found, 0); assert.equal(retried.remaining, 2); assert.equal(retried.foundJax, false);
    assert.deepEqual(retried.position, retried.spawn);
    assert.ok(retried.timeLeft > FULL - 5 && retried.timeLeft <= FULL);
    assert.deepEqual(retried.escape, failed.escape);
  });
  await check('Leaving Home immediately after Retry prevents its pending continuation from reviving the run', async () => {
    await call('tick', 999);
    await page.locator('#btn-level-complete-continue').evaluate(button => {
      window.__staleMazeRetry = button;
      button.click(); window.__mazeCounterReview.home(); button.click();
    });
    await page.waitForTimeout(250);
    const home = await state();
    assert.equal(home.titleActive, true); assert.equal(home.roomLoaded, false);
    assert.equal(home.searchStatus, 'idle'); assert.equal(home.cardVisible, false);
    assert.equal(home.seed, null); assert.equal(home.found, 0);
  });
  await call('start'); await call('lock');
  await check('Home also invalidates a Retry whose replacement room is already loading', async () => {
    await call('tick', 999);
    const failed = await state();
    const loading = await page.locator('#btn-level-complete-continue').evaluate(button => new Promise(resolve => {
      button.click();
      queueMicrotask(() => {
        const loading = window.__mazeCounterReview.state();
        window.__mazeCounterReview.home();
        resolve(loading);
      });
    }));
    assert.equal(loading.ready, false);
    assert.equal(loading.token, failed.token + 1);
    await page.waitForTimeout(1000);
    const home = await state();
    assert.equal(home.titleActive, true); assert.equal(home.roomLoaded, false);
    assert.equal(home.searchStatus, 'idle'); assert.equal(home.seed, null);
    assert.equal(home.cardVisible, false);
  });
  await call('start'); await call('lock');
  await check('Leaving a failed maze for another room invalidates the retained Retry button', async () => {
    await call('tick', 999);
    await page.evaluate(() => window.__staleMazeRetry = document.getElementById('btn-level-complete-continue'));
    await travel('tadc');
    await page.evaluate(() => window.__staleMazeRetry.click());
    await page.waitForTimeout(250);
    assert.equal((await state()).room, 'tadc');
    assert.equal((await state()).searchStatus, 'idle');
    assert.equal((await state()).cardVisible, false);
  });
  await call('start'); await call('lock');
  await check('Existing checkpoint format restores a fresh maze attempt without changing saved story or scores', async () => {
    const checkpoint = await call('primeCheckpoint');
    assert.equal(checkpoint.room, 'maze');
    assert.equal('mazeSearch' in checkpoint, false); assert.equal('mazeItems' in checkpoint, false);
    await call('pickup'); await call('tick', 30);
    await call('loadCheckpoint', checkpoint);
    await page.waitForFunction(() => {
      const s = window.__mazeCounterReview.state();
      return s.ready && s.room === 'maze' && s.searchStatus === 'searching';
    }, null, { timeout: 120000 });
    await call('lock');
    const restored = await state();
    assert.equal(restored.found, 0); assert.equal(restored.remaining, 2);
    assert.ok(restored.timeLeft > FULL - 5 && restored.timeLeft <= FULL);
    assert.deepEqual(restored.escape, checkpoint.escape);
  });
  // Pages through the ending's conversation (its beats wait on the scene) to its card.
  async function playThroughEnding() {
    for (let i = 0; i < 400 && !(await state()).cardVisible; i++) {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })));
      await page.waitForTimeout(150);
    }
    await page.waitForFunction(() => window.__mazeCounterReview.state().cardVisible, null, { timeout: 10000 });
  }
  await check('Leaving the maze after Jax fades out, plays the ending scene, records it, and a save resumes at it', async () => {
    await call('startStory'); await call('lock');
    await call('pickup'); await call('pickup');
    await call('placeAt', 'jax'); await call('tick', 0);
    await page.waitForFunction(() => window.__mazeCounterReview.state().dialogueActive);
    for (let i = 0; i < 60 && (await state()).dialogueActive; i++) {
      await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true, cancelable: true })));
      await page.waitForTimeout(40);
    }
    assert.equal((await state()).jaxComplete, true);
    await call('placeAt', 'exit'); await call('triggers');
    const leaving = await state();
    assert.equal(leaving.fadeOn, true, 'The maze starts fading to black at the exit');
    assert.equal(leaving.cardVisible, false, 'No card until the fade has finished');
    assert.equal(leaving.timerHidden, true);
    // The ending's scene outside the maze (KAN-89, KAN-95), then its card.
    await page.waitForFunction(() => window.__mazeCounterReview.state().dialogueActive, null, { timeout: 60000 });
    assert.equal(await page.locator('#scene-fade').evaluate(el => el.classList.contains('on')), false, 'The scene fades up');
    await playThroughEnding();
    const ending = await state();
    assert.equal(ending.cardTitle, 'Level 3 Complete');
    assert.match(ending.cardSubtitle, /Pomni and Jax step out of the maze together/);
    assert.equal(ending.ending, 'saved');
    assert.equal(await page.locator('#btn-level-complete-continue').textContent(), 'Back to title');
    const saved = await call('checkpoint');
    assert.equal(saved.story.ending, 'saved', 'The checkpoint after the exit carries the ending variant');
    await page.waitForTimeout(500); // the card's pop-in
    assert.equal(await page.evaluate(() => {
      const box = document.getElementById('btn-level-complete-continue').getBoundingClientRect();
      return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.id;
    }), 'btn-level-complete-continue', 'The card sits above the black fade');
    await page.screenshot({ path: path.join(output, 'level3-complete.png') });

    await page.locator('#btn-level-complete-continue').click();
    const home = await state();
    assert.equal(home.titleActive, true); assert.equal(home.roomLoaded, false);
    assert.equal(home.fadeOn, false); assert.equal(home.ending, null);

    await call('loadCheckpoint', saved);
    await page.waitForFunction(() => window.__mazeCounterReview.state().dialogueActive, null, { timeout: 60000 });
    await playThroughEnding();
    const resumed = await state();
    assert.equal(resumed.roomLoaded, false, 'A save from after the maze does not reload the maze');
    assert.equal(resumed.cardVisible, true); assert.equal(resumed.cardTitle, 'Level 3 Complete');
    assert.equal(resumed.ending, 'saved');
    await page.locator('#btn-level-complete-continue').click();
    assert.equal((await state()).titleActive, true);
  });
  assert.deepEqual(report.errors, []);
  report.pass = true;
  console.log(`${report.checks.length}/${report.checks.length} maze counter/countdown checks passed; no browser errors`);
} catch (error) {
  report.failure = error.stack;
  report.lastState = await state().catch(() => null);
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

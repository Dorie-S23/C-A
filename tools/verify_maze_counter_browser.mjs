// With Vite running: node tools/verify_maze_counter_browser.mjs
// Real room assets, pickup callbacks and the animation-loop HUD. The bridge
// skips walking distances, emulates pointer lock and disables 3D rendering.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/maze-counter');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [],
  instrumentation: 'Real rooms and pickup callbacks; emulated pointer lock; 3D drawing and shader warm-up disabled. Cutscene visibility uses a held test cutscene.' };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route('**/src/main.js', async route => {
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
        window.__mazeCounterTravel = missionApi.travel(room);
        return this.state();
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
          hint: hint.textContent, hintVisible: hint.classList.contains('visible') };
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__mazeCounterReview.state());
const call = (method, value) => page.evaluate(({ method, value }) => window.__mazeCounterReview[method](value), { method, value });
const visible = async (text = 'Items found: 1/2') => {
  await page.waitForFunction(text => {
    const s = window.__mazeCounterReview.state();
    return !s.hidden && s.text === text;
  }, text, { timeout: 120000 });
  assert.equal(await page.locator('#maze-items-counter').isVisible(), true);
};
const hidden = async () => {
  await page.waitForFunction(() => window.__mazeCounterReview.state().hidden);
  assert.equal(await page.locator('#maze-items-counter').isVisible(), false);
};
const travel = async room => {
  const loading = await call('beginTravel', room);
  assert.equal(loading.ready, false);
  assert.equal(loading.hidden, true, 'The maze HUD hides immediately when loading starts');
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
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/?dev=1&mazeSeed=12345`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__mazeCounterReview);
  await check('The maze counter is hidden on the title screen', hidden);
  await call('start');
  await call('lock');
  await check('A playable maze shows a styled, accessible 0/2 counter', async () => {
    await visible('Items found: 0/2');
    const s = await state();
    assert.equal(s.remaining, 2);
    assert.equal(s.pictureHidden, true);
    const element = page.locator('#maze-items-counter');
    assert.equal(await element.getAttribute('role'), 'status');
    assert.equal(await element.getAttribute('aria-live'), 'polite');
    assert.equal(await element.getAttribute('aria-atomic'), 'true');
    const styles = await page.evaluate(() => {
      const maze = getComputedStyle(document.getElementById('maze-items-counter'));
      const photo = getComputedStyle(document.getElementById('picture-counter'));
      const keys = ['top', 'left', 'backgroundColor', 'borderRadius', 'padding', 'fontSize', 'pointerEvents'];
      return keys.map(key => [maze[key], photo[key]]);
    });
    for (const [maze, photo] of styles) assert.equal(maze, photo);
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
    await call('pickup'); await visible('Items found: 2/2');
    assert.equal((await state()).remaining, 0);
    await travel('maze'); await visible('Items found: 2/2');
    assert.equal((await state()).remaining, 0);
  });
  await check('The counter stays within a narrow viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const box = await page.locator('#maze-items-counter').boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390);
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
    await visible('Items found: 0/2');
    assert.equal((await state()).remaining, 2);
  });
  assert.deepEqual(report.errors, []);
  report.pass = true;
  console.log(`${report.checks.length}/${report.checks.length} maze counter checks passed; no browser errors`);
} catch (error) {
  report.failure = String(error);
  throw error;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

// With Vite running: node tools/verify_ending_browser.mjs
// Real rooms, story checkpoints, character assets and animation-loop staging.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/way-out-ending');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
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
    window.__wayOutReview = {
      jump: key => devJump(key),
      duplicate: () => startWayOutEntrance(currentRoomInfo, loadToken),
      checkpoint: () => structuredClone(checkpoint),
      restore: data => loadGame(data),
      remember: () => { window.__staleWayOut = activeWayOutEnding; },
      stale: () => window.__staleWayOut?.diagnostics ?? null,
      home: () => returnToHome(),
      restart() { this.remember(); startNewGame(); },
      changeRoom() {
        this.remember();
        const token = loadToken;
        selectRoom('ending', { from: 'ending' });
        return token;
      },
      cancelPendingLoad() {
        const loading = selectRoom('ending', { from: 'maze' });
        returnToHome();
        return loading;
      },
      completeMaze() {
        mazeItems.completeJax();
        const exit = triggers.exit.getCenter(new THREE.Vector3());
        stage.place({ x: exit.x, z: exit.z });
        checkTriggers(player);
      },
      state() {
        const ending = currentRoomInfo?.ending;
        return {
          room: currentRoomKey, roomLoaded: Boolean(currentRoom), token: loadToken,
          ready: readyToPlay, titleActive: titleScreen.active,
          level3Complete: storyProgress.level3Complete, jaxFate: storyProgress.jaxFate,
          variant: storyProgress.endingVariant, ending: activeWayOutEnding?.diagnostics ?? null,
          roomVariant: ending?.variant ?? null,
          jaxCount: currentRoom?.children.filter(child => child.name === 'Jax').length ?? 0,
          player: [player.position.x, player.position.z],
          jax: ending?.jaxApi ? [ending.jaxApi.jax.position.x, ending.jaxApi.jax.position.z] : null,
          marks: ending ? {
            pomniEnd: [ending.marks.pomniEnd.x, ending.marks.pomniEnd.z],
            jaxEnd: [ending.marks.jaxEnd.x, ending.marks.jaxEnd.z],
          } : null,
          stagedWalk: Boolean(stageWalk), stagedDelay: Boolean(stageDelay),
          stagedCamera: Boolean(stageCamera), stagedHold: stageHold,
          arms: pomniGaitArms?.diagnostics ?? null,
          completionCard: !levelCompletePanel.hidden,
        };
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__wayOutReview.state());
const call = (method, value) => page.evaluate(({ method, value }) => window.__wayOutReview[method](value), { method, value });
const wait = (predicate, arg, timeout = 30000) => page.waitForFunction(predicate, arg, { timeout });
const near = (actual, expected) => {
  assert.ok(Math.abs(actual[0] - expected[0]) < 0.02, `${actual} x != ${expected}`);
  assert.ok(Math.abs(actual[1] - expected[1]) < 0.02, `${actual} z != ${expected}`);
};
async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}
async function jump(key) {
  await call('jump', key);
  await wait(key => {
    const s = window.__wayOutReview.state();
    return s.roomLoaded && s.roomVariant && s.ending?.variant === (key === 'wayOutSaved' ? 'saved' : 'bittersweet');
  }, key);
}
async function completeEntrance() {
  await wait(() => window.__wayOutReview.state().ending?.phase === 'complete');
}

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5174'}/?dev=1`, { waitUntil: 'domcontentloaded' });
  await wait(() => Boolean(window.__wayOutReview));

  const savedStarted = Date.now();
  await jump('wayOutSaved');
  await completeEntrance();
  const savedDuration = Date.now() - savedStarted;
  await check('Saved developer checkpoint emerges with Pomni and Jax together', async () => {
    const s = await state();
    assert.equal(s.level3Complete, true);
    assert.equal(s.jaxFate, 'saved');
    assert.equal(s.variant, 'saved');
    assert.equal(s.jaxCount, 1);
    near(s.player, s.marks.pomniEnd);
    near(s.jax, s.marks.jaxEnd);
    assert.equal(s.stagedCamera, true);
    assert.equal(s.stagedHold, true);
    assert.equal(s.ready, false);
    assert.equal(s.arms.lowered, false);
  });

  await check('Duplicate entrance start is a no-op', async () => {
    const before = (await state()).ending;
    assert.equal(await call('duplicate'), false);
    assert.deepEqual((await state()).ending, before);
  });

  await check('An ending save restores its story state and restarts one entrance', async () => {
    const saved = await call('checkpoint');
    assert.equal(saved.room, 'ending');
    assert.equal(saved.story.endingVariant, 'saved');
    const token = (await state()).token;
    await call('restore', saved);
    await wait(token => {
      const s = window.__wayOutReview.state();
      return s.token > token && s.roomLoaded && s.ending?.starts === 1;
    }, token);
    await completeEntrance();
    const s = await state();
    assert.equal(s.jaxFate, 'saved');
    assert.equal(s.ending.starts, 1);
    assert.equal(s.jaxCount, 1);
  });

  const bitterStarted = Date.now();
  await jump('wayOutBittersweet');
  await completeEntrance();
  const bitterDuration = Date.now() - bitterStarted;
  await check('Bittersweet checkpoint emerges alone, slowly, with lowered arms', async () => {
    const s = await state();
    assert.equal(s.jaxFate, 'abstracted');
    assert.equal(s.variant, 'bittersweet');
    assert.equal(s.jaxCount, 0);
    assert.equal(s.jax, null);
    near(s.player, s.marks.pomniEnd);
    assert.equal(s.arms.lowered, true);
    assert.ok(bitterDuration > savedDuration * 1.35, `${bitterDuration}ms should be slower than ${savedDuration}ms`);
  });

  await check('Home cancels staging and invalidates the old controller', async () => {
    await jump('wayOutSaved');
    await wait(() => window.__wayOutReview.state().stagedWalk);
    await call('remember');
    await call('home');
    const stale = await call('stale');
    const s = await state();
    assert.equal(stale.phase, 'cancelled');
    assert.equal(s.roomLoaded, false);
    assert.equal(s.ending, null);
    assert.equal(s.stagedWalk, false);
    assert.equal(s.stagedDelay, false);
    assert.equal(s.stagedCamera, false);
    assert.equal(s.titleActive, true);
  });

  await check('Restarting New Game cancels the entrance before the next room loads', async () => {
    await jump('wayOutBittersweet');
    await wait(() => window.__wayOutReview.state().stagedWalk);
    await call('restart');
    assert.equal((await call('stale')).phase, 'cancelled');
    assert.equal((await state()).ending, null);
    assert.equal((await state()).roomLoaded, false);
    await call('home');
  });

  await check('Changing rooms cancels the old entrance and starts only the new room instance', async () => {
    await jump('wayOutBittersweet');
    await wait(() => window.__wayOutReview.state().stagedWalk);
    const token = await call('changeRoom');
    await wait(token => {
      const s = window.__wayOutReview.state();
      return s.token > token && s.roomLoaded && s.ending?.starts === 1;
    }, token);
    assert.equal((await call('stale')).phase, 'cancelled');
    assert.equal((await state()).ending.starts, 1);
    await call('home');
  });

  await check('Home during room loading prevents a stale room attachment', async () => {
    await call('cancelPendingLoad');
    const s = await state();
    assert.equal(s.roomLoaded, false);
    assert.equal(s.ending, null);
    assert.equal(s.titleActive, true);
  });

  await check('The ordinary successful maze exit records saved and enters Way Out', async () => {
    await call('jump', 'level3LastAct');
    await wait(() => {
      const s = window.__wayOutReview.state();
      return s.roomLoaded && s.room === 'maze' && s.ready;
    });
    await call('completeMaze');
    await wait(() => window.__wayOutReview.state().roomLoaded && window.__wayOutReview.state().room === 'ending');
    await completeEntrance();
    const s = await state();
    assert.equal(s.level3Complete, true);
    assert.equal(s.jaxFate, 'saved');
    assert.equal(s.variant, 'saved');
    assert.equal(s.completionCard, false);
    assert.equal(s.jaxCount, 1);
  });

  assert.deepEqual(report.errors, [], 'browser console and page errors');
  report.pass = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

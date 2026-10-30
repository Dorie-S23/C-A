// With Vite running: node tools/verify_ending_browser.mjs
// Real rooms, assets, dialogue and ending controllers. The review bridge only
// suppresses continuous drawing, advances dialogue and exposes current state.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/live-ending');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [], webgl: [] };
const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking',
    ...(process.argv.includes('--hardware') ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => {
  if (message.type() === 'error') report.errors.push(message.text());
});

await page.route('**/src/main.js*', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.25);
    const { exitDoorPlan } = await import('/src/cutscenes/endingCutscene.js');
    const reviewRender = renderer.render.bind(renderer);
    let lastFrame = null;
    renderer.render = (scene, camera) => { lastFrame = { scene, camera }; };
    const lock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    renderer.domElement.requestPointerLock = lock;
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };

    const review = window.__endingReview = {
      starts: [], nodes: [], completions: [], cancellations: [], currentDialogue: null,
      start(variant) {
        this.starts = []; this.nodes = []; this.completions = []; this.cancellations = [];
        this.currentDialogue = null;
        document.getElementById('btn-ending-' + variant).click();
      },
      jump: key => devJump(key),
      checkpoint: () => structuredClone(checkpoint),
      restore(data) {
        this.starts = []; this.nodes = []; this.completions = []; this.cancellations = [];
        this.currentDialogue = null;
        loadGame(data);
      },
      home: () => returnToHome(),
      advance: () => dialogueUI.skipToEnd(),
      rememberScene() { window.__staleEndingScene = lastFrame?.scene ?? null; },
      staleSceneChildren: () => window.__staleEndingScene?.children.length ?? null,
      completeMaze() {
        mazeItems.completeJax();
        const exit = triggers.exit.getCenter(new THREE.Vector3());
        stage.place({ x: exit.x, z: exit.z });
        checkTriggers(player);
      },
      renderNow() {
        if (!lastFrame) return null;
        reviewRender(lastFrame.scene, lastFrame.camera);
        const gl = renderer.getContext();
        return { error: gl.getError(), contextLost: gl.isContextLost() };
      },
      state() {
        const exit = activeCutscene && lastFrame?.scene?.getObjectByName('ExitDoorSet') ? lastFrame.scene : null;
        const castRoot = exit ?? currentRoom;
        const plan = exit ? exitDoorPlan() : currentRoomInfo?.mazeDoor
          ? lobbyEndingPlan(currentRoomInfo.mazeDoor.portal.arrival) : null;
        const cast = {};
        for (const name of ['Pomni', 'Jax', 'Ribbit', 'Ragatha', 'Kaufmo', 'Caine', 'Kinger', 'Gangle', 'Zooble']) {
          let count = 0;
          const mark = name === 'Caine' ? null : plan?.[name.toLowerCase()];
          // Ending actors are direct children on their measured marks. This
          // ignores lookalike meshes inside the Lobby's environment model.
          for (const object of castRoot?.children ?? []) {
            if (mark?.isVector3 ? object.position.distanceTo(mark) < 0.001 : object.name === name) count++;
          }
          cast[name] = count;
        }
        return {
          ...getOpeningDiagnostics(),
          token: loadToken, roomLoaded: Boolean(currentRoom), ready: readyToPlay,
          titleActive: titleScreen.active, storyEnding: storyProgress.ending,
          currentDialogue: this.currentDialogue, starts: [...this.starts],
          actions: this.nodes.filter(node => node.action).map(node => node.action),
          completions: [...this.completions], cancellations: [...this.cancellations],
          doorScene: Boolean(exit), cast,
          fade: sceneFade.classList.contains('on'),
          completionCard: !levelCompletePanel.hidden,
          contextLost: renderer.getContext().isContextLost(),
        };
      },
    };
    const endingScripts = new Map([
      [endingLobbySavedDialogue, 'endingLobbySaved'],
      [endingLobbyAbstractedDialogue, 'endingLobbyAbstracted'],
      [exitDoorSavedDialogue, 'exitDoorSaved'],
      [exitDoorAbstractedDialogue, 'exitDoorAbstracted'],
    ]);
    const playDialogue = dialogueUI.play.bind(dialogueUI);
    dialogueUI.play = (script, options = {}) => {
      const key = endingScripts.get(script) ?? null;
      if (key) {
        review.currentDialogue = key;
        review.starts.push(key);
      }
      return playDialogue(script, {
        ...options,
        onNode(node) {
          if (key) review.nodes.push({ script: key, id: node.id, action: node.action ?? null });
          return options.onNode?.(node);
        },
        onComplete() {
          if (key) review.completions.push(key);
          return options.onComplete?.();
        },
        onCancel() {
          if (key) review.cancellations.push(key);
          return options.onCancel?.();
        },
      });
    };
  ` });
});

const state = () => page.evaluate(() => window.__endingReview.state());
const call = (method, value) => page.evaluate(
  ({ method, value }) => window.__endingReview[method](value), { method, value },
);
const wait = (predicate, arg, timeout = 120000) => page.waitForFunction(predicate, arg, { timeout });
const key = code => page.evaluate(code => window.dispatchEvent(new KeyboardEvent('keydown', {
  code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true,
})), code);

async function check(name, fn) {
  await fn();
  report.checks.push(name);
  console.log('PASS', name);
}

async function progressTo(predicate, label) {
  for (let i = 0; i < 4000; i++) {
    const current = await state();
    if (predicate(current)) return current;
    if (current.dialogueActive && !current.dialogueWaiting) await call('advance');
    await page.waitForTimeout(30);
  }
  throw new Error(`Timed out: ${label}: ${JSON.stringify(await state())}`);
}

async function start(variant) {
  await call('start', variant);
  const dialogue = variant === 'saved' ? 'endingLobbySaved' : 'endingLobbyAbstracted';
  await wait(key => {
    const s = window.__endingReview.state();
    return s.currentDialogue === key && s.dialogueActive;
  }, dialogue);
}

async function visual(name) {
  const result = await call('renderNow');
  assert.ok(result, `${name}: a real scene frame is available`);
  assert.equal(result.contextLost, false, `${name}: WebGL context`);
  assert.equal(result.error, 0, `${name}: WebGL error`);
  report.webgl.push({ name, ...result });
  await page.screenshot({ path: path.join(output, `${name}.png`) });
}

async function dismissCard() {
  await page.locator('#btn-level-complete-continue').evaluate(button => button.click());
  await wait(() => window.__endingReview.state().titleActive);
}

async function assertHomeSafe() {
  await page.waitForTimeout(1900);
  const s = await state();
  assert.equal(s.titleActive, true);
  assert.equal(s.roomLoaded, false);
  assert.equal(s.dialogueActive, false);
  assert.equal(s.cutsceneActive, false);
  assert.equal(s.completionCard, false);
  assert.equal(s.fade, false);
  assert.equal(s.stagedWalk, false);
  assert.equal(s.stagedDelay, null);
  assert.equal(s.stagedCamera, false);
  assert.equal(s.contextLost, false);
}

const commonDoorActions = [
  'gathered', 'caineArrives', 'kaufmoLeaves', 'ribbitLeaves', 'ragathaLeaves',
  'gangleLeaves', 'zoobleLeaves', 'kingerLeaves',
];

async function playCompleteVariant(variant) {
  await start(variant);
  const lobbyKey = variant === 'saved' ? 'endingLobbySaved' : 'endingLobbyAbstracted';
  const doorKey = variant === 'saved' ? 'exitDoorSaved' : 'exitDoorAbstracted';
  const lobby = await state();
  assert.equal(lobby.level3Complete, true);
  assert.equal(lobby.storyEnding, variant);
  assert.equal(lobby.jaxFate, variant);
  assert.equal(lobby.endingVariant, variant === 'saved' ? 'saved' : 'bittersweet');
  for (const name of ['Ribbit', 'Ragatha', 'Kaufmo', 'Kinger', 'Gangle', 'Zooble']) {
    assert.equal(lobby.cast[name], 1, `${variant} Lobby ${name}`);
  }
  assert.equal(lobby.cast.Jax, variant === 'saved' ? 1 : 0);
  await visual(`${variant}-lobby`);

  const door = await progressTo(s => s.doorScene && s.currentDialogue === doorKey, `${variant} exit door`);
  for (const name of ['Pomni', 'Ribbit', 'Ragatha', 'Kaufmo', 'Caine', 'Kinger', 'Gangle', 'Zooble']) {
    assert.equal(door.cast[name], 1, `${variant} door ${name}`);
  }
  assert.equal(door.cast.Jax, variant === 'saved' ? 1 : 0);
  await visual(`${variant}-exit-door`);

  const done = await progressTo(s => s.completionCard, `${variant} completion card`);
  assert.deepEqual(done.starts, [lobbyKey, doorKey]);
  assert.deepEqual(done.completions, [lobbyKey, doorKey]);
  assert.deepEqual(done.cancellations, []);
  const lobbyActions = variant === 'saved'
    ? ['walkOut', 'groupReacts', 'jaxLooksAway', 'kaufmoExit']
    : ['walkOut', 'groupReacts', 'groupRealises', 'grief', 'kaufmoExit'];
  const doorActions = variant === 'saved'
    ? [...commonDoorActions, 'jaxLeaves', 'pomniLeaves']
    : [...commonDoorActions, 'pomniLooksBack', 'pomniLeaves'];
  assert.deepEqual(done.actions, [...lobbyActions, ...doorActions]);
  assert.equal(done.storyEnding, variant);
  assert.equal(done.contextLost, false);
  return call('checkpoint');
}

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5174'}/?dev=1`, { waitUntil: 'domcontentloaded' });
  await wait(() => Boolean(window.__endingReview));

  await check('The ordinary maze exit records saved and enters the live Lobby', async () => {
    await call('jump', 'level3LastAct');
    await wait(() => {
      const s = window.__endingReview.state();
      return s.room === 'maze' && s.roomLoaded && s.ready;
    });
    await call('completeMaze');
    await wait(() => window.__endingReview.state().currentDialogue === 'endingLobbySaved');
    const s = await state();
    assert.equal(s.level3Complete, true);
    assert.equal(s.storyEnding, 'saved');
    assert.equal(s.cast.Jax, 1);
    const saved = await call('checkpoint');
    assert.equal(saved.room, 'tadc');
    assert.equal(saved.story.ending, 'saved');
    await call('home');
    await assertHomeSafe();
  });

  const savedCheckpoint = await playCompleteVariant('saved');
  await check('Saved developer button completes the Lobby-to-door sequence with Jax and the full cast', async () => {
    assert.equal(savedCheckpoint.room, 'tadc');
    assert.equal(savedCheckpoint.story.ending, 'saved');
  });
  await dismissCard();

  const abstractedCheckpoint = await playCompleteVariant('abstracted');
  await check('Abstracted developer button completes both scenes without Jax', async () => {
    assert.equal(abstractedCheckpoint.story.ending, 'abstracted');
  });
  await dismissCard();

  await check('An ending checkpoint restores the saved variant and Home cancels its Lobby safely', async () => {
    await call('restore', savedCheckpoint);
    await wait(() => window.__endingReview.state().currentDialogue === 'endingLobbySaved');
    const s = await state();
    assert.equal(s.level3Complete, true);
    assert.equal(s.storyEnding, 'saved');
    assert.equal(s.cast.Jax, 1);
    await call('home');
    await assertHomeSafe();
  });

  await check('Escape at the exit door skips to the completion card without a stale scene', async () => {
    await start('abstracted');
    await progressTo(s => s.doorScene && s.currentDialogue === 'exitDoorAbstracted', 'Escape at exit door');
    await key('Escape');
    const s = await progressTo(current => current.completionCard, 'skipped ending card');
    assert.deepEqual(s.cancellations, ['exitDoorAbstracted']);
    assert.equal(s.actions.includes('pomniLeaves'), false);
    assert.equal(s.doorScene, false);
    await dismissCard();
  });

  await check('Home during the exit door disposes the scene and suppresses delayed fades and cards', async () => {
    await start('saved');
    await progressTo(s => s.doorScene && s.currentDialogue === 'exitDoorSaved', 'Home at exit door');
    await call('rememberScene');
    await call('home');
    await assertHomeSafe();
    assert.equal(await call('staleSceneChildren'), 0);
  });

  await check('Home during cast loading invalidates the old ending before assets arrive', async () => {
    let delay = true;
    await page.route('**/models/characters/jax/jax_from_tadc.glb', async route => {
      if (delay) {
        delay = false;
        await new Promise(resolve => setTimeout(resolve, 1400));
      }
      await route.continue();
    });
    await call('start', 'saved');
    await call('home');
    await assertHomeSafe();
    assert.equal((await state()).completionCard, false);
  });

  assert.deepEqual(report.errors, [], 'browser console and page errors');
  report.pass = true;
} catch (error) {
  report.failure = String(error.stack ?? error);
  try { report.lastState = await state(); } catch { /* the page may already be gone */ }
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}

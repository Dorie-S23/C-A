// With Vite running: node tools/verify_ending_browser.mjs
// The real maze exit, slides, dialogue and story state. The review bridge only
// suppresses continuous drawing, advances dialogue and exposes current state.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/live-ending');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [] };
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
    renderer.render = () => {};
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
        this.slides.length = 0;
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
      completeMaze() {
        // What the end of the talk with Jax does: there's no exit to walk to.
        mazeItems.completeJax();
        leaveMazeAfterTalk();
      },
      state() {
        const root = document.getElementById('ending-slides');
        const shown = root.querySelector('.ending-image.ending-shown');
        return {
          ...getOpeningDiagnostics(),
          token: loadToken, roomLoaded: Boolean(currentRoom), ready: readyToPlay,
          titleActive: titleScreen.active, storyEnding: storyProgress.ending,
          currentDialogue: this.currentDialogue, starts: [...this.starts],
          actions: this.nodes.filter(node => node.action).map(node => node.action),
          completions: [...this.completions], cancellations: [...this.cancellations],
          slidesOpen: !root.hidden,
          slide: shown?.getAttribute('src')?.match(/([^/]+)\.jpg$/)?.[1] ?? null,
          slideLoaded: Boolean(shown?.complete && shown.naturalWidth > 0),
          doorPart: this.currentDialogue?.startsWith('exitDoor') ?? false,
          fade: sceneFade.classList.contains('on'),
          completionCard: !levelCompletePanel.hidden,
          contextLost: renderer.getContext().isContextLost(),
        };
      },
    };
    const slideLog = review.slides = [];
    const showSlide = endingSlides.show;
    endingSlides.show = (url) => { slideLog.push(url.match(/([^/]+)\.jpg$/)[1]); showSlide(url); };
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
  await page.waitForTimeout(1900); // through the fade up and the crossfade
  const s = await state();
  assert.equal(s.slidesOpen, true, `${name}: slides up`);
  assert.equal(s.slideLoaded, true, `${name}: image ${s.slide} loaded`);
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
  'gathered', 'hush', 'pomniLooksRound', 'doorOpens', 'kaufmoLeaves', 'ribbitLeaves', 'ragathaLeaves',
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
  assert.equal(lobby.roomLoaded, false, 'the maze is gone, nothing plays behind the slides');
  await visual(`${variant}-lobby`);

  await progressTo(s => s.doorPart && s.currentDialogue === doorKey, `${variant} exit door`);
  await visual(`${variant}-exit-door`);

  const done = await progressTo(s => s.completionCard, `${variant} completion card`);
  assert.deepEqual(done.starts, [lobbyKey, doorKey]);
  assert.deepEqual(done.completions, [lobbyKey, doorKey]);
  assert.deepEqual(done.cancellations, []);
  const lobbyActions = variant === 'saved'
    ? ['walkOut', 'ribbitToJax', 'kaufmoOffers', 'caineSpots', 'caineFreezes', 'kaufmoSteps', 'jaxToKaufmo', 'run', 'montageGangle', 'montageGlance', 'montageKinger']
    : ['walkOut', 'ribbitLooks', 'grief', 'ragathaHolds', 'kaufmoStares', 'caineDrifts', 'kaufmoSteps', 'run'];
  const doorActions = variant === 'saved'
    ? [...commonDoorActions, 'jaxLeaves', 'pomniStops', 'pomniTurns', 'caineHat', 'pomniLeaves', 'caineAlone']
    : [...commonDoorActions, 'pomniStops', 'pomniTurns', 'caineHat', 'pomniLeaves', 'caineAlone'];
  assert.deepEqual(done.actions, [...lobbyActions, ...doorActions]);
  assert.equal(done.storyEnding, variant);
  assert.equal(done.contextLost, false);
  assert.equal(done.slidesOpen, false, 'the slides are gone by the card');
  assert.deepEqual(await page.evaluate(() => window.__endingReview.slides.splice(0)), [
    ...[1, 2, 3, 4, 5].map(n => `${variant}-${n}`), 'final-1', 'final-2', 'final-3', 'final-4',
  ]);
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
    const saved = await call('checkpoint');
    assert.equal(saved.story.ending, 'saved');
    await call('home');
    await assertHomeSafe();
  });

  const savedCheckpoint = await playCompleteVariant('saved');
  await check('Saved developer button plays both parts over all its slides, with Jax', async () => {
    assert.equal(savedCheckpoint.story.ending, 'saved');
  });
  await dismissCard();

  const abstractedCheckpoint = await playCompleteVariant('abstracted');
  await check('Abstracted developer button plays both parts over its own slides, without Jax', async () => {
    assert.equal(abstractedCheckpoint.story.ending, 'abstracted');
  });
  await dismissCard();

  await check('An ending checkpoint restores the saved variant and Home cancels its Lobby safely', async () => {
    await call('restore', savedCheckpoint);
    await wait(() => window.__endingReview.state().currentDialogue === 'endingLobbySaved');
    const s = await state();
    assert.equal(s.level3Complete, true);
    assert.equal(s.storyEnding, 'saved');
    assert.equal(s.slidesOpen, true);
    await call('home');
    await assertHomeSafe();
  });

  await check('Escape at the exit door skips to the completion card without a stale scene', async () => {
    await start('abstracted');
    await progressTo(s => s.doorPart && s.currentDialogue === 'exitDoorAbstracted', 'Escape at exit door');
    await page.waitForTimeout(600); // the Escape guard after the pointer unlock
    await key('Escape');
    const s = await progressTo(current => current.completionCard, 'skipped ending card');
    assert.deepEqual(s.cancellations, ['exitDoorAbstracted']);
    assert.equal(s.actions.includes('pomniLeaves'), false);
    assert.equal(s.slidesOpen, false);
    await dismissCard();
  });

  await check('A click anywhere continues, and the Skip button skips straight to the card', async () => {
    await start('saved');
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => window.__endingReview.nodes.length);
    // Twice: the first finishes typing the line, the next moves on from it.
    await page.mouse.click(550, 120);
    await page.mouse.click(550, 120);
    await wait(count => window.__endingReview.nodes.length > count, before);
    await page.click('.ending-skip');
    const s = await progressTo(current => current.completionCard, 'skipped by the button');
    assert.deepEqual(s.cancellations, ['endingLobbySaved']);
    assert.deepEqual(s.starts, ['endingLobbySaved'], 'a skip in the first part skips the door too');
    assert.equal(s.slidesOpen, false);
    await dismissCard();
  });

  await check('Home during the exit door closes the slides and suppresses delayed fades and cards', async () => {
    await start('saved');
    await progressTo(s => s.doorPart && s.currentDialogue === 'exitDoorSaved', 'Home at exit door');
    await call('home');
    await assertHomeSafe();
    assert.equal((await state()).slidesOpen, false);
  });

  await check('Home while the slides load invalidates the old ending before they arrive', async () => {
    let delay = true;
    await page.route('**/ending/*.jpg', async route => {
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

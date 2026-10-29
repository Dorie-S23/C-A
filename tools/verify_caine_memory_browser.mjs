// With Vite running: node tools/verify_caine_memory_browser.mjs
// Real rooms/UI/retry callbacks; emulated pointer lock, skipped opening staging,
// and disabled drawing/shader warm-up. Native Escape release needs a manual check.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { MAZE_SEARCH_SECONDS } from '../src/state/mazeItems.js';

const output = path.resolve('artifacts/caine-memory');
await fs.mkdir(output, { recursive: true });
const report = { pass: false, checks: [], errors: [],
  instrumentation: 'Real UI, rooms, saves and retry transitions; emulated pointer lock; opening staging and 3D rendering skipped. No claim of physical Escape verification.' };
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.25); renderer.render = () => {}; renderer.compile = () => new Set();
    const lock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    renderer.domElement.requestPointerLock = lock;
    document.exitPointerLock = () => {
      delete document.pointerLockElement; document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__memoryAudio = { voice: [], ambience: [] };
    const voicePause = dialogueVoice.setPaused.bind(dialogueVoice);
    dialogueVoice.setPaused = value => { window.__memoryAudio.voice.push(value); voicePause(value); };
    const ambiencePause = ambience.setPaused.bind(ambience);
    ambience.setPaused = value => { window.__memoryAudio.ambience.push(value); ambiencePause(value); };
    window.__caineReview = {
      lock, pause: () => document.exitPointerLock(),
      async newRun() {
        startNewGame();
        // Supersede the opening load without resetting the actual new-run event.
        await missionApi.travel('maze');
        openingCompleted = true;
      },
      travel: room => missionApi.travel(room),
      home: () => returnToHome(),
      failMaze() { updateMazeSearch(0); updateMazeSearch(999); },
      async photoSearch() { objectives.activate('collect-photos'); await missionApi.travel('tadc'); },
      failPhoto: () => updateSearchTimer(999),
      abstractPhoto: () => { void kaufmoAbstracted(loadToken); },
      dialogue() {
        dialogueUI.play([{ type: 'line', speaker: 'pomni', side: 'left',
          text: 'This deliberately long dialogue line checks that Escape freezes rather than cancels typing, and resumes without losing its position or changing the current conversation.' }]);
      },
      cancelDialogue: () => dialogueUI.cancel(),
      cinematic(value) { activeEntrance = value ? { active: true, skippable: true,
        setPaused() {}, update() {}, dispose() {} } : null; },
      hold: value => stage.hold(value),
      frame: seconds => updateMemoryCaption(seconds, gameplayHUDContext()),
      hidden(value) {
        Object.defineProperty(document, 'hidden', { value, configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      },
      primeCheckpoint() { preLevel1Session = true; openingCompleted = true; takeCheckpoint(); },
      loadSaved: () => loadGame(saveSlots.read(1)),
      state() {
        return { history: caineMemory.snapshot(), enabled: caineMemory.enabled,
          stored: localStorage.getItem('tadc.caineMemory.history.v1'),
          room: currentRoomKey, ready: readyToPlay, paused, locked: isLocked,
          caption: memoryCaption.textContent, captionHidden: memoryCaption.hidden,
          joke: pauseMemoryJoke.textContent, jokeHidden: pauseMemoryJoke.hidden,
          retryCaption: retryMemoryCaption.textContent, retryHidden: retryMemoryCaption.hidden,
          card: !levelCompletePanel.hidden, cardTitle: levelCompleteTitle.textContent,
          mazeTime: mazeSearch.timeLeft, seed: mazeAttemptSeed, photoTime: searchTimeLeft,
          dialogue: dialogueUI.isActive, voicePause: window.__memoryAudio.voice.at(-1),
          ambiencePause: window.__memoryAudio.ambience.at(-1), escape: snapshotEscapeThreshold(),
          checkpoint, save: localStorage.getItem('tadc.save.1') };
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__caineReview.state());
const call = (method, value) => page.evaluate(({ method, value }) => window.__caineReview[method](value), { method, value });
const ready = room => page.waitForFunction(room => {
  const s = window.__caineReview.state(); return s.ready && s.room === room;
}, room, { timeout: 120000 });
const check = async (name, fn) => { await fn(); report.checks.push(name); console.log('PASS', name); };
const retry = async room => {
  await page.locator('#btn-level-complete-continue').click();
  await ready(room);
  await call('lock');
};

// Caine's memory settings live only in the title screen's Options (not the
// pause menu), so mid-game checks flip them there directly.
const setMemoryEnabled = on => page.evaluate(on => {
  const input = document.getElementById('caine-memory-enabled');
  input.checked = on;
  input.dispatchEvent(new Event('change'));
}, on);
const clearMemory = () => page.evaluate(() => document.querySelector('[data-caine-clear]').click());

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/?dev=1&mazeSeed=12345`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__caineReview);
  await check('Title/room previews do not count runs; new-run caption waits for play', async () => {
    assert.equal((await state()).history.runs, 0);
    await call('newRun'); await ready('maze');
    assert.equal((await state()).history.runs, 1);
    await call('frame', 999);
    assert.equal((await state()).captionHidden, true);
    await call('lock');
    await page.waitForFunction(() => !window.__caineReview.state().captionHidden);
    assert.match((await state()).caption, /behind the screen/);
    assert.equal(await page.locator('#caine-memory-caption').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  });
  await check('Pause retains buttons, freezes timer, and shows the Escape joke once', async () => {
    await page.keyboard.down('KeyW');
    await call('pause'); await page.keyboard.press('Escape'); await page.keyboard.up('KeyW');
    const before = await state();
    assert.equal(before.paused, true);
    assert.match(before.joke, /a pause!/);
    assert.equal(await page.locator('#caine-pause-joke').isVisible(), true);
    assert.equal(before.ambiencePause, true);
    for (const id of ['btn-resume', 'btn-save', 'btn-pause-load', 'btn-home']) assert.ok(await page.locator('#' + id).isVisible());
    await call('frame', 999); await call('failMaze'); await page.waitForTimeout(200);
    assert.equal((await state()).mazeTime, before.mazeTime);
    assert.equal((await state()).card, false);
    assert.equal((await state()).captionHidden, true);
    await page.locator('#btn-resume').click();
    assert.equal((await state()).paused, false);
    assert.equal((await state()).locked, true);
    assert.equal((await state()).ambiencePause, false);
    await call('pause');
    assert.equal((await state()).jokeHidden, true);
    await page.locator('#btn-resume').click();
  });
  await check('Escape freezes dialogue typing/voice without cancellation; Resume continues', async () => {
    await call('dialogue'); await page.waitForTimeout(80);
    await call('pause'); await page.keyboard.press('Escape');
    const text = await page.locator('#dialogue-text').textContent();
    assert.equal((await state()).dialogue, true);
    assert.equal((await state()).voicePause, true);
    await page.keyboard.press('Space'); await page.waitForTimeout(180);
    assert.equal(await page.locator('#dialogue-text').textContent(), text);
    await page.locator('#btn-resume').click();
    assert.equal((await state()).voicePause, false);
    await page.waitForTimeout(120);
    assert.ok((await page.locator('#dialogue-text').textContent()).length > text.length);
    await call('cancelDialogue');
  });
  await check('Captions stay hidden during cinematics, staging, hidden tabs and expire without input', async () => {
    await call('cinematic', true); await call('frame', 999);
    assert.equal((await state()).captionHidden, true);
    await page.keyboard.press('Escape');
    assert.equal((await state()).paused, true);
    assert.equal((await state()).jokeHidden, true);
    await page.locator('#btn-resume').click(); await call('cinematic', false);
    await call('hold', true); await call('frame', 999);
    assert.equal((await state()).captionHidden, true);
    await call('hold', false); await call('hidden', true); await call('frame', 999);
    assert.equal((await state()).captionHidden, true);
    await call('hidden', false); await call('frame', 999);
    assert.equal((await state()).captionHidden, false);
    await call('frame', 6);
    assert.equal((await state()).captionHidden, true);
  });
  await check('Maze retries show contextual card text and count only one successful reload', async () => {
    const before = await state(); await call('failMaze');
    assert.equal((await state()).cardTitle, 'LEVEL 3 FAILED');
    assert.match((await state()).retryCaption, /Take two of the maze/);
    assert.equal((await state()).history.retries.maze, 0);
    assert.equal((await state()).jokeHidden, true);
    await page.evaluate(() => { const button = document.getElementById('btn-level-complete-continue'); button.click(); button.click(); });
    await ready('maze');
    await page.waitForFunction(() => window.__caineReview.state().history.retries.maze === 1);
    assert.notEqual((await state()).seed, before.seed);
    assert.equal((await state()).mazeTime, MAZE_SEARCH_SECONDS);
    assert.deepEqual((await state()).escape, before.escape);
    await call('lock'); await call('failMaze');
    assert.match((await state()).retryCaption, /know your moves by heart/);
    await retry('maze');
    await page.waitForFunction(() => window.__caineReview.state().history.retries.maze === 2);
  });
  await check('Level 2 timeout and too-few-photo retry share scene history without changing timer rules', async () => {
    await call('photoSearch'); await ready('tadc'); await call('lock');
    await call('failPhoto');
    assert.equal((await state()).cardTitle, 'LEVEL 2 FAILED');
    assert.match((await state()).retryCaption, /Take two of the photo search/);
    await retry('tadc');
    await page.waitForFunction(() => window.__caineReview.state().history.retries.level2 === 1);
    await call('abstractPhoto');
    assert.match((await state()).retryCaption, /photo search.*know your moves by heart/);
    await retry('tadc');
    await page.waitForFunction(() => window.__caineReview.state().history.retries.level2 === 2);
    assert.ok((await state()).photoTime > 239);
  });
  await check('New Game keeps history, changes caption, and rearms only the run-local joke', async () => {
    const old = (await state()).history;
    await call('newRun'); await ready('maze'); await call('lock');
    await page.waitForFunction(() => !window.__caineReview.state().captionHidden);
    const current = await state();
    assert.equal(current.history.runs, old.runs + 1);
    assert.deepEqual(current.history.retries, old.retries);
    assert.match(current.caption, /won’t mention the retries/);
    await call('pause');
    assert.equal((await state()).jokeHidden, false);
  });
  await check('Actual Save and Load preserve independent history and never replay run text/joke', async () => {
    await call('primeCheckpoint');
    await page.locator('#btn-save').click();
    await page.locator('#save-slot-list button').first().click();
    const saved = await state(), history = saved.stored;
    assert.ok(saved.save);
    assert.equal(saved.checkpoint.room, 'maze');
    assert.ok(!saved.save.includes('caineMemory'));
    await page.locator('#btn-save-slots-back').click();
    await page.locator('#btn-pause-load').click();
    await page.locator('#save-slot-list button').first().click();
    await ready('maze'); await call('lock');
    assert.equal((await state()).stored, history);
    assert.equal((await state()).save, saved.save);
    assert.equal((await state()).captionHidden, true);
    await call('pause');
    assert.equal((await state()).jokeHidden, true);
  });
  await check('Reloading the page and checkpoint does not replay the once-per-run joke', async () => {
    const history = (await state()).stored;
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__caineReview);
    await call('loadSaved'); await ready('maze'); await call('lock'); await call('pause');
    assert.equal((await state()).stored, history);
    assert.equal((await state()).jokeHidden, true);
    assert.equal((await state()).captionHidden, true);
  });
  await check('Off suppresses all text and stops run/retry recording', async () => {
    await setMemoryEnabled(false);
    const before = (await state()).history;
    assert.equal(await page.locator('#caine-memory-enabled').isChecked(), false);
    await page.locator('#btn-resume').click(); await call('failMaze');
    assert.equal((await state()).retryHidden, true);
    await retry('maze');
    assert.deepEqual((await state()).history, before);
    await call('newRun'); await ready('maze'); await call('lock');
    assert.deepEqual((await state()).history, before);
    assert.equal((await state()).captionHidden, true);
    await call('pause'); assert.equal((await state()).jokeHidden, true);
  });
  await check('Clear removes history only; loading an old save does not bring memory back', async () => {
    const saved = (await state()).save;
    await clearMemory();
    assert.equal((await state()).stored, null);
    assert.equal((await state()).enabled, false);
    assert.equal((await state()).save, saved);
    await page.locator('#btn-pause-load').click();
    await page.locator('#save-slot-list button').first().click();
    await ready('maze');
    assert.equal((await state()).stored, null);
    assert.equal((await state()).enabled, false);
    await call('lock'); await call('pause');
    await setMemoryEnabled(true);
    await page.locator('#btn-resume').click();
  });
  await check('Clear during retry loading prevents a stale completion from recreating erased history', async () => {
    await call('failMaze');
    await page.evaluate(() => {
      document.getElementById('btn-level-complete-continue').click();
      queueMicrotask(() => document.querySelector('[data-caine-clear]').click());
    });
    await ready('maze'); await page.waitForTimeout(80);
    assert.equal((await state()).stored, null);
    assert.equal((await state()).history.retries.maze, 0);
    await call('lock');
  });
  await check('Leaving a failed session cancels Retry without recording history', async () => {
    await call('failMaze');
    const before = (await state()).history;
    await call('home');
    await page.evaluate(() => document.getElementById('btn-level-complete-continue').click());
    await page.waitForTimeout(100);
    assert.deepEqual((await state()).history, before);
    assert.equal((await state()).captionHidden, true);
  });
  await check('Settings/history persist on reload; the pause menu has no memory controls', async () => {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__caineReview);
    assert.equal((await state()).enabled, true);
    assert.equal((await state()).stored, null);
    await call('newRun'); await ready('maze'); await call('lock'); await call('pause');
    await page.setViewportSize({ width: 390, height: 740 });
    const box = await page.locator('#pause-menu').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 391);
    assert.equal(await page.locator('#pause-menu [data-caine-enabled], #pause-menu [data-caine-clear]').count(), 0,
      'Caine memory settings are only in Options');
    await clearMemory();
    assert.equal((await state()).stored, null);
    assert.equal((await state()).jokeHidden, true);
    await page.locator('#btn-resume').scrollIntoViewIfNeeded(); await page.locator('#btn-resume').click();
    await call('pause');
    assert.equal((await state()).jokeHidden, true, 'Clear must not rearm this run’s joke');
    const text = await page.locator('#pause-menu').textContent();
    assert.ok(!text.includes('Escape Threshold'));
  });
  await check('Narrow Options stay scrollable and Off persists across a page reload', async () => {
    await call('home');
    await page.evaluate(() => { document.getElementById('title-options').hidden = false; });
    const option = page.locator('#caine-memory-enabled');
    await option.scrollIntoViewIfNeeded(); await option.uncheck();
    const back = page.locator('#btn-options-back');
    await back.scrollIntoViewIfNeeded();
    const bounds = await back.boundingBox();
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 740);
    await back.click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !!window.__caineReview);
    assert.equal((await state()).enabled, false);
    assert.equal(await page.locator('#caine-memory-enabled').isChecked(), false);
    assert.equal((await state()).stored, null);
  });
  assert.deepEqual(report.errors, []);
  report.pass = true;
} catch (error) {
  report.failure = error.stack ?? String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser.close();
}

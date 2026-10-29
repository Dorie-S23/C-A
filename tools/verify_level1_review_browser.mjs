// Vite on 5173: node tools/verify_level1_review_browser.mjs [--no-render] [--only=text]
// Real game assets, dialogue DOM, story callbacks and E interaction. The bridge
// skips the opening/walk to Ribbit and emulates pointer lock for headless Edge.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { level1RibbitDialogue } from '../src/data/dialogues.js';

const rendered = !process.argv.includes('--no-render');
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice('--only='.length);
const output = path.resolve('artifacts/level1-review', rendered ? 'rendered' : 'state-only');
await fs.mkdir(output, { recursive: true });
const reportFile = path.join(output, only ? `report-${only.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json` : 'report.json');
const report = {
  date: new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'full' }).format(new Date()),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  rendered, rendering: rendered ? 'Real WebGL frames on demand for screenshots; continuous drawing disabled' : '3D drawing disabled',
  checks: [], errors: [], screenshots: [],
  instrumentation: 'Skip opening; place player at Ribbit door; emulate pointer lock; disable continuous render/compile for software-rendering speed. Dialogue, action timing, scores, assets and story gates are real. Synthetic Level 2 points are used only to check retry isolation. Screenshots do not establish continuous rendering performance.',
};
const choices = level1RibbitDialogue.filter(node => node.type === 'choice');
const fatalMessages = choices.map(choice => {
  let i = level1RibbitDialogue.findIndex(node => node.id === choice.options[3].next);
  while (!level1RibbitDialogue[i].gameOver) i++;
  return level1RibbitDialogue[i].text;
});
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--no-first-run', '--disable-background-networking', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
report.browser = browser.version();
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', error => report.errors.push(error.stack ?? String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
await page.route('**/src/main.js', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, body: await response.text() + `
    renderer.setPixelRatio(0.3);
    const reviewRender = renderer.render.bind(renderer);
    const reviewNoRender = () => {};
    // compileAsync calls compile and iterates its returned Set, even when no
    // shaders need warming in this fixture. Preserve that return contract.
    renderer.render = reviewNoRender; renderer.compile = () => new Set();
    const reviewScores = await import('/src/state/escapeThreshold.js');
    const reviewLock = () => {
      Object.defineProperty(document, 'pointerLockElement', { value: renderer.domElement, configurable: true });
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    renderer.domElement.requestPointerLock = reviewLock;
    document.exitPointerLock = () => {
      delete document.pointerLockElement;
      document.dispatchEvent(new Event('pointerlockchange'));
    };
    window.__l1Audit = {
      state() { return { ...getOpeningDiagnostics(),
        scores: reviewScores.snapshotEscapeThreshold(), total: reviewScores.getEscapeTotal(),
        stageHeld: stageHold, contextLost: renderer.getContext().isContextLost(),
        cardTitle: levelCompleteTitle.textContent, cardMessage: levelCompleteSubtitle.textContent,
      }; },
      async prepare(otherPoints = 0) {
        returnToHome(); resetEscapeThreshold(); resetObjectiveSession(true); openingCompleted = true;
        reviewScores.setLevelPoints('level2', otherPoints);
        objectives.activate('find-ribbit'); titleScreen.hide();
        await missionApi.enterRoom('dorm'); reviewLock();
        stage.place({x:-2.2,z:-110.31,lookAt:{x:-3.6,z:-110.31}});
      },
      cancel: () => dialogueUI.cancel(),
      home: () => returnToHome(),
      tryHallway: () => playKaufmoHallway(),
      travel: key => missionApi.travel(key),
      unlock: () => document.exitPointerLock(),
      refocusKnock() { stage.place({x:-2.2,z:-110.31,lookAt:{x:-3.6,z:-110.31}}); },
      renderFrame() {
        renderer.render = reviewRender;
        try { reviewRender(scene, camera); } finally { renderer.render = reviewNoRender; }
      },
    };
  ` });
});
const state = () => page.evaluate(() => window.__l1Audit.state());
const key = code => page.evaluate(code => window.dispatchEvent(new KeyboardEvent('keydown', {
  code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true,
})), code);
async function until(fn, label, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await page.waitForTimeout(70);
  }
  throw Error(`Timed out: ${label}; ${JSON.stringify(await state())}`);
}
async function shot(name) {
  const file = path.join(output, `${name}.png`);
  if (rendered) await page.evaluate(() => window.__l1Audit.renderFrame());
  await page.screenshot({ path: file, animations: 'disabled' });
  report.screenshots.push(file);
}
async function check(name, fn) {
  if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
  console.log('CHECK', name);
  try {
    await fn();
    report.checks.push({ name, result: 'PASS', state: await state() });
    console.log('PASS', name);
  } catch (error) {
    report.checks.push({ name, result: 'FAIL', error: String(error), state: await state().catch(() => null) });
    console.error('FAIL', name, String(error));
    await shot(`failure-${report.checks.length}`).catch(() => {});
  }
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
}
async function prepare(otherPoints = 0) {
  await page.evaluate(points => window.__l1Audit.prepare(points), otherPoints);
  await until(async () => (await state()).focusedPrompt === 'Knock on Ribbit’s door', 'door focus');
}
async function knock() {
  await key('KeyE');
  await until(async () => (await state()).dialogueActive, 'knock dialogue');
}
// Stop at a choice (after consuming supplied picks), an awaited action, or a
// completion card. Space only advances ordinary lines; no script skipping.
async function drive(picks = [], { stopAtAction = null, doubleClick = false } = {}) {
  let picked = 0;
  return until(async () => {
    const s = await state();
    if (s.completionCardVisible) return { kind: 'card', picked, state: s };
    if (picked === picks.length && stopAtAction?.(s)) return { kind: 'action', picked, state: s };
    if (!s.dialogueActive || s.dialogueWaiting || s.paused) return false;
    if (await page.locator('#dialogue-options').evaluate(el => !el.hidden)) {
      if (picked === picks.length) return { kind: 'choice', picked, state: s };
      await page.locator('.dialogue-option').nth(picks[picked++]).evaluate((button, twice) => {
        button.click(); if (twice) button.click();
      }, doubleClick);
    } else await key('Space');
    return false;
  }, 'dialogue progression');
}
async function assertNotAdvanced(otherPoints = 0) {
  const s = await state();
  assert.equal(s.ribbitComplete, false);
  assert.equal(s.hallwayPending, false);
  assert.equal(s.kaufmoIntroduced, false);
  assert.equal(s.objective?.id, 'find-ribbit');
  assert.equal(s.scores.level1 ?? 0, 0);
  assert.equal(s.scores.level2 ?? 0, otherPoints);
  assert.equal(await page.evaluate(() => window.__l1Audit.tryHallway()), false);
}
async function retry() {
  // Retain and click the same button twice to catch duplicate retry callbacks.
  await page.locator('#btn-level-complete-continue').evaluate(button => { button.click(); button.click(); });
  await until(async () => { const s = await state(); return s.room === 'dorm' && s.dialogueActive; }, 'retry at door');
  await assertNotAdvanced((await state()).scores.level2 ?? 0);
}

try {
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/?dev=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__l1Audit);

  for (let branch = 0; branch < 4; branch++) {
    await check(`Game Over at choice ${branch + 1}, retry, no Kaufmo or retained attempt points`, async () => {
      await prepare(2); await knock();
      const picks = [0, 1, 0, 0].slice(0, branch).concat(3);
      const result = await drive(picks);
      assert.equal(result.kind, 'card'); assert.equal(result.picked, branch + 1);
      assert.equal(result.state.cardTitle, 'Game Over');
      assert.equal(result.state.cardMessage, fatalMessages[branch]);
      assert.equal(await page.locator('#btn-level-complete-continue').textContent(), 'Retry Level');
      assert.equal(result.state.dialogueActive, false);
      if (branch === 0) assert.equal(result.state.room, 'dorm');
      await assertNotAdvanced(2);
      await shot(`game-over-choice-${branch + 1}`);
      await retry();
    });
  }

  await check('Two consecutive late failures discard points; double input does not duplicate the winning score', async () => {
    await prepare(2); await knock();
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await drive([0, 1, 0, 3])).kind, 'card');
      await assertNotAdvanced(2); await retry();
    }
    const win = await drive([0, 1, 0, 0], { doubleClick: true });
    assert.equal(win.kind, 'card'); assert.equal(win.state.cardTitle, 'Level 1 Complete');
    assert.equal(win.state.ribbitComplete, true); assert.equal(win.state.ribbitPoints, 4);
    assert.equal(win.state.objective.id, 'find-kaufmo');
    assert.equal(win.state.scores.level1, 4); assert.equal(win.state.scores.level2, 2);
    assert.equal(win.state.total, 6);
    await shot('success-four-points');
    await page.locator('#btn-level-complete-continue').click();
    await page.evaluate(() => window.__l1Audit.travel('dorm'));
    const s = await state();
    assert.equal(s.scores.level1, 4); assert.equal(s.scores.level2, 2);
    assert.equal(s.objective.id, 'find-kaufmo');
  });

  for (const picks of [[1, 0, 1, 1], [2, 2, 2, 2]]) {
    await check(`Zero-point choices ${picks.map(i => 'ABCD'[i]).join('')} continue and finish at zero`, async () => {
      await prepare(); await knock();
      const win = await drive(picks);
      assert.equal(win.kind, 'card'); assert.equal(win.state.cardTitle, 'Level 1 Complete');
      assert.equal(win.state.scores.level1, 0); assert.equal(win.state.ribbitComplete, true);
      assert.equal(win.state.objective.id, 'find-kaufmo');
    });
  }

  await check('Escape/pointer unlock pauses a choice, blocks input, and Resume preserves it', async () => {
    await prepare(); await knock(); await drive([0]);
    const before = await state();
    await key('Escape'); await page.evaluate(() => window.__l1Audit.unlock());
    await until(async () => (await state()).paused, 'pause');
    await key('Space');
    await page.locator('.dialogue-option').first().evaluate(button => button.click());
    const paused = await state();
    assert.equal(paused.dialogueActive, true); assert.deepEqual(paused.scores, before.scores);
    assert.deepEqual(paused.player, before.player);
    await shot('pause-during-choice');
    await page.locator('#btn-resume').click();
    await until(async () => !(await state()).paused, 'resume');
    const win = await drive([1, 0, 0]);
    assert.equal(win.state.scores.level1, 4); assert.equal(win.state.ribbitComplete, true);
  });

  for (const phase of ['knock', 'entry', 'seating', 'scored-choice']) {
    await check(`Explicit dialogue cancellation during ${phase} rolls back and permits E retry`, async () => {
      await prepare(); await knock();
      if (phase === 'knock') {
        assert.equal((await state()).dialogueWaiting, true);
      } else if (phase === 'entry') {
        await drive([0], { stopAtAction: s => s.room === 'ribbit' && s.stagedWalk });
      } else if (phase === 'seating') {
        await drive([0, 1], { stopAtAction: s => s.room === 'ribbit' && s.stagedWalk });
      } else await drive([0]);
      await page.evaluate(() => window.__l1Audit.cancel());
      await until(async () => { const s = await state(); return s.room === 'dorm' && s.ready && !s.dialogueActive; }, 'cancel to hall');
      await assertNotAdvanced();
      assert.equal((await state()).stagedWalk, false);
      assert.equal((await state()).stageHeld, false);
      await page.waitForTimeout(500);
      assert.equal((await state()).dialogueActive, false, 'cancelled action must not reopen dialogue');
      // Return to the interaction radius; bedroom exit is elsewhere in the hall.
      await page.evaluate(() => window.__l1Audit.refocusKnock());
      await until(async () => (await state()).focusedPrompt === 'Knock on Ribbit’s door', 'cancel retry focus');
      await knock();
      assert.equal((await drive()).kind, 'choice');
      await assertNotAdvanced();
    });
  }

  await check('Home during a scored encounter cancels callbacks; New Game clears both level scores', async () => {
    await prepare(2); await knock(); await drive([0]);
    await page.evaluate(() => window.__l1Audit.unlock());
    await page.locator('#btn-home').click();
    await page.waitForTimeout(500);
    const home = await state();
    assert.equal(home.dialogueActive, false); assert.equal(home.preLevel1Session, false);
    assert.equal(home.ribbitComplete, false); assert.equal(home.hallwayPending, false);
    assert.equal(home.completionCardVisible, false); assert.equal(home.stageHeld, false);
    await page.locator('#btn-new-game').evaluate(button => button.click());
    await until(async () => { const s = await state(); return s.preLevel1Session && s.room === 'pomni'; }, 'New Game');
    assert.equal((await state()).total, 0);
  });

  await check('Leaving a Game Over card invalidates Retry and never resumes the abandoned run', async () => {
    await prepare(); await knock(); await drive([3]);
    await page.evaluate(() => {
      window.__oldRetry = document.getElementById('btn-level-complete-continue');
      window.__l1Audit.home(); window.__oldRetry.click();
    });
    await page.waitForTimeout(500);
    const s = await state();
    assert.equal(s.titleActive, true); assert.equal(s.dialogueActive, false);
    assert.equal(s.completionCardVisible, false); assert.equal(s.ribbitComplete, false);
    assert.equal(s.hallwayPending, false); assert.equal(s.total, 0);
  });

  await check('Movement and camera lock prevent walking away during a dialogue choice', async () => {
    await prepare(); await knock(); await drive();
    const before = await state();
    await page.keyboard.down('d'); await page.keyboard.down('Shift');
    await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', {
      movementX: 120, movementY: 50, bubbles: true,
    })));
    await page.waitForTimeout(400);
    await page.keyboard.up('d'); await page.keyboard.up('Shift');
    const after = await state();
    assert.deepEqual(after.player, before.player);
    assert.equal(after.cameraYaw, before.cameraYaw); assert.equal(after.cameraPitch, before.cameraPitch);
    assert.deepEqual(after.scores, before.scores); assert.equal(after.dialogueActive, true);
    await shot('dialogue-movement-lock');
    assert.deepEqual(report.errors, []); assert.equal(after.contextLost, false);
  });

  await check('No browser exceptions, console errors or WebGL context loss', async () => {
    assert.deepEqual(report.errors, []); assert.equal((await state()).contextLost, false);
  });
} finally {
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`${report.checks.filter(c => c.result === 'PASS').length}/${report.checks.length} passed; ${reportFile}`);
if (!report.checks.length) throw Error(`No checks matched --only=${only}`);
if (report.checks.some(c => c.result === 'FAIL') || report.errors.length) process.exitCode = 1;

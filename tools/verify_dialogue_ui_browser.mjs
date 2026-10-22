import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Vite must be running. This fixture loads the actual UI without game/GLB assets.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
try {
  await page.route('**/dialogue-ui-fixture', route => route.fulfill({ contentType: 'text/html', body: `
    <div id="dialogue"><div id="dialogue-box">
      <div id="dialogue-portrait-left"></div><div id="dialogue-portrait-right"></div>
      <div id="dialogue-name"></div><div id="dialogue-direction"></div>
      <div id="dialogue-text"></div><div id="dialogue-options"></div><div id="dialogue-continue"></div>
    </div></div>` }));
  await page.goto('http://127.0.0.1:5173/dialogue-ui-fixture');
  await page.evaluate(async () => {
    const { createDialogueUI } = await import('/src/ui/DialogueUI.js');
    window.ui = createDialogueUI({ speakers: { pomni: { name: 'Pomni', initials: 'P', color: 'red' } } });
    window.trust = 0; window.completed = 0; window.cancelled = 0;
    window.ui.play([
      { type: 'cue', id: 'arrival' },
      { type: 'line', speaker: 'pomni', side: 'left', text: 'original' },
    ], {
      onNode: node => node.id === 'arrival' ? new Promise(resolve => { window.arrive = resolve; }) : undefined,
      lineFor: node => node.type === 'line' ? { ...node, text: window.trust === 4 ? 'Warm recovery.' : 'Guarded recovery.' } : node,
      onComplete: () => window.completed++, onCancel: () => window.cancelled++,
    });
  });
  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.ui.isWaiting), true);
  assert.equal(await page.locator('#dialogue').evaluate(el => el.style.visibility), 'hidden');
  await page.evaluate(() => { window.trust = 4; window.arrive(); });
  await page.waitForFunction(() => !window.ui.isWaiting);
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#dialogue-text').textContent(), 'Warm recovery.');
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => window.completed), 1);
  console.log('PASS Actions block advance; recovery text uses the current score when shown');

  await page.evaluate(() => window.ui.play([{ type:'cue' }, { type:'line',speaker:'pomni',side:'left',text:'Stale.' }], {
    onNode: node => node.type === 'cue' ? new Promise(resolve => { window.oldArrival=resolve; }) : undefined,
    onCancel: () => window.cancelled++,
  }));
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    window.ui.play([{ type:'line',speaker:'pomni',side:'left',text:'New conversation.' }]);
    window.oldArrival();
  });
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#dialogue-text').textContent(), 'New conversation.');
  assert.equal(await page.evaluate(() => window.cancelled), 1);
  console.log('PASS Cancelling during an action cannot overwrite a later conversation');

  await page.evaluate(() => window.ui.play([{ type:'cue' }, { type:'line',speaker:'pomni',side:'left',text:'Paused action.' }], {
    onNode: node => node.type === 'cue' ? new Promise(resolve => { window.resumeAction=resolve; }) : undefined,
  }));
  await page.evaluate(() => { window.ui.setPaused(true); window.resumeAction(); });
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#dialogue').evaluate(el => el.style.visibility), 'hidden');
  assert.equal(await page.locator('#dialogue-text').textContent(), '');
  await page.evaluate(() => window.ui.setPaused(false));
  await page.keyboard.press('Space');
  assert.equal(await page.locator('#dialogue-text').textContent(), 'Paused action.');
  console.log('PASS Scene completion while paused preserves hidden, paused dialogue until resume');

  await page.evaluate(() => {
    window.cueCalls = 0; window.choices = []; window.skipComplete = 0;
    window.ui.play([
      { type: 'line', speaker: 'pomni', side: 'left', text: 'Start.' },
      { type: 'cue', id: 'walk' },
      { type: 'choice', options: [
        { text: 'Poor support', points: 0, next: 'end' },
        { text: 'Good support', points: 1, next: 'end' },
      ] },
      { type: 'line', id: 'end', speaker: 'pomni', side: 'left', text: 'Done.' },
    ], {
      onNode: node => {
        if (node.id !== 'walk') return;
        window.cueCalls++;
        return new Promise(resolve => { window.finishWalk = resolve; });
      },
      onChoice: option => window.choices.push(option.points),
      onComplete: () => window.skipComplete++,
    });
    window.ui.skipToEnd(); window.ui.skipToEnd();
  });
  assert.equal(await page.evaluate(() => window.ui.isWaiting), true);
  assert.equal(await page.evaluate(() => window.cueCalls), 1);
  assert.equal(await page.evaluate(() => window.skipComplete), 0);
  await page.evaluate(() => window.finishWalk());
  await page.waitForFunction(() => !window.ui.isWaiting);
  await page.evaluate(() => window.ui.skipToEnd());
  assert.deepEqual(await page.evaluate(() => window.choices), [1]);
  assert.equal(await page.evaluate(() => window.skipComplete), 1);
  console.log('PASS Skip honours pending actions, runs cues once and scores the best answer');
} finally { await browser.close(); }

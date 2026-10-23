import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Vite must be running, and the clips generated (npm run voices). Plays the
// real morning script through the real DialogueUI + voice player.
const browser = await chromium.launch({
  channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
try {
  await page.route('**/dialogue-voice-fixture', route => route.fulfill({ contentType: 'text/html', body: `
    <div id="dialogue"><div id="dialogue-box">
      <div id="dialogue-portrait-left"></div><div id="dialogue-portrait-right"></div>
      <div id="dialogue-name"></div><div id="dialogue-direction"></div>
      <div id="dialogue-text"></div><div id="dialogue-options"></div><div id="dialogue-continue"></div>
    </div></div>` }));
  await page.goto('http://127.0.0.1:5173/dialogue-voice-fixture');
  await page.evaluate(async () => {
    // The player keeps its <audio> private; catch it on its first play().
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.voiceEl = this; return play.call(this); };
    const { createDialogueUI } = await import('/src/ui/DialogueUI.js');
    const { createVoicePlayer } = await import('/src/audio/voicePlayer.js');
    const { SPEAKERS, preLevel1Dialogue } = await import('/src/data/dialogues.js');
    window.voice = createVoicePlayer();
    window.ui = createDialogueUI({ speakers: SPEAKERS, voice: window.voice });
    // Give the manifest fetch a moment before the first line asks for a clip.
    await new Promise(resolve => setTimeout(resolve, 500));
    window.ui.play(preLevel1Dialogue);
  });
  const clip = () => page.evaluate(() => ({
    src: window.voiceEl?.src.split('/').pop(), paused: window.voiceEl?.paused, time: window.voiceEl?.currentTime,
  }));

  await page.waitForFunction(() => window.voiceEl?.currentTime > 0.2);
  const first = await clip();
  assert.match(first.src, /^pomni-[0-9a-f]{8}\.mp3$/);
  console.log(`PASS First line plays its clip (${first.src})`);

  await page.keyboard.press('Space'); // snaps the text to full
  assert.equal((await clip()).paused, false);
  console.log('PASS Snapping the text to full keeps the voice going');

  await page.keyboard.press('Space'); // next line: Ragatha
  await page.waitForFunction(() => window.voiceEl.currentTime > 0.1);
  const second = await clip();
  assert.match(second.src, /^ragatha-/);
  console.log(`PASS Advancing switches to the next speaker's clip (${second.src})`);

  await page.evaluate(() => window.ui.setPaused(true));
  assert.equal((await clip()).paused, true);
  await page.evaluate(() => window.ui.setPaused(false));
  assert.equal((await clip()).paused, false);
  console.log('PASS Pausing the game pauses and resumes the voice');

  await page.evaluate(() => window.voice.setVolume(0));
  assert.equal((await clip()).paused, true);
  await page.evaluate(() => window.voice.setVolume(1));
  console.log('PASS Volume 0 silences the current clip');

  await page.keyboard.press('Space'); await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.voiceEl.paused);
  await page.keyboard.press('Escape');
  assert.equal((await clip()).paused, true);
  console.log('PASS Escape cancels the conversation and stops the voice');

  // An awaited room action can finish after the player opens the pause menu.
  // Its next line must wait to speak until the same conversation resumes.
  await page.evaluate(async () => {
    const { preLevel1Dialogue } = await import('/src/data/dialogues.js');
    window.ui.play([{ type: 'cue', id: 'arrival' }, preLevel1Dialogue[0]], {
      onNode: node => node.id === 'arrival'
        ? new Promise(resolve => { window.finishArrival = resolve; }) : undefined,
    });
    window.ui.setPaused(true);
    window.finishArrival();
  });
  await page.waitForFunction(() => !window.ui.isWaiting);
  await page.waitForTimeout(150);
  assert.equal((await clip()).paused, true, 'The next line must not speak behind the pause menu');
  await page.evaluate(() => window.ui.setPaused(false));
  await page.waitForFunction(() => !window.voiceEl.paused && window.voiceEl.currentTime > 0.1);
  console.log('PASS An action completed while paused defers its next voice until resume');
  await page.evaluate(() => window.ui.cancel());

  await page.evaluate(async () => {
    const { preLevel1Dialogue } = await import('/src/data/dialogues.js');
    window.ui.play([{ type: 'cue' }, preLevel1Dialogue[0]], {
      onNode: node => node.type === 'cue'
        ? new Promise(resolve => { window.finishArrival = resolve; }) : undefined,
    });
    window.ui.setPaused(true);
    window.finishArrival();
  });
  await page.waitForFunction(() => !window.ui.isWaiting);
  await page.evaluate(() => { window.ui.cancel(); window.ui.setPaused(false); });
  assert.equal((await clip()).paused, true);
  assert.equal(await page.evaluate(() => window.ui.isActive), false);
  console.log('PASS Cancelling while paused discards the deferred voice');

  // Choices: the picked option is said as Pomni's own line before the reply.
  await page.evaluate(async () => {
    const { level2OpeningDialogue } = await import('/src/data/dialogues.js');
    window.shown = []; window.completed = 0;
    window.ui.play(level2OpeningDialogue, {
      startAt: 'choice1', onNode: node => { window.shown.push(node.id ?? node.type); },
      onComplete: () => window.completed++,
    });
  });
  await page.keyboard.press('Digit2');
  await page.waitForFunction(() => document.getElementById('dialogue-text').textContent === 'Kaufmo, slow down. Breathe.');
  assert.equal(await page.locator('#dialogue-name').textContent(), 'Pomni');
  assert.equal(await page.locator('#dialogue-options').evaluate(el => el.hidden), true);
  assert.equal(await page.evaluate(() => window.ui.currentSpeaker), 'pomni');
  assert.equal(await page.evaluate(() => window.shown.includes('c1_b')), false);
  await page.waitForFunction(() => window.voiceEl.src.includes('/pomni-') && window.voiceEl.currentTime > 0.1);
  console.log('PASS A picked option is shown and voiced as Pomni before the reply');

  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.voiceEl.src.includes('/kaufmo-') && window.voiceEl.currentTime > 0.1);
  assert.equal(await page.evaluate(() => window.shown.at(-1)), 'c1_b');
  console.log('PASS The next advance brings in the reply (and only then its onNode)');

  await page.evaluate(async () => {
    const { level1RibbitDialogue } = await import('/src/data/dialogues.js');
    const choice = level1RibbitDialogue.find(node => node.options?.some(o => o.text.startsWith('(Sit down')));
    window.ui.play([
      { ...choice, options: choice.options.map(option => ({ ...option, next: 'reply' })) },
      { id: 'reply', type: 'line', speaker: 'ribbit', side: 'right', text: '…You’re not gonna make me talk?' },
    ]);
  });
  await page.keyboard.press('Digit2');
  assert.equal(await page.locator('#dialogue-name').textContent(), 'Ribbit');
  console.log('PASS An action-only option goes straight to the reply');

  await page.evaluate(async () => {
    const { level2OpeningDialogue } = await import('/src/data/dialogues.js');
    window.shown = []; window.completed = 0;
    window.ui.play(level2OpeningDialogue, {
      startAt: 'choice1', onNode: node => { window.shown.push(node.id ?? node.type); },
      onComplete: () => window.completed++,
    });
  });
  await page.keyboard.press('Digit1');
  await page.evaluate(() => window.ui.skipToEnd());
  assert.equal(await page.evaluate(() => window.completed), 1);
  assert.equal(await page.evaluate(() => window.shown.includes('c1_a')), true);
  console.log('PASS Skipping while a picked option is shown still runs the reply and finishes');
} finally {
  await browser.close();
}

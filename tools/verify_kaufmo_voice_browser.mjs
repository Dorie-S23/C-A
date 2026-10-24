// Vite running: GAME_URL=http://127.0.0.1:5181 node tools/verify_kaufmo_voice_browser.mjs --edge
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: process.argv.includes('--edge') ? 'msedge' : 'chrome',
  headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error)));
try {
  await page.route('**/kaufmo-voice-fixture', route => route.fulfill({ contentType: 'text/html', body: `
    <div id="dialogue"><div id="dialogue-box">
      <div id="dialogue-portrait-left"></div><div id="dialogue-portrait-right"></div>
      <div id="dialogue-name"></div><div id="dialogue-direction"></div>
      <div id="dialogue-text"></div><div id="dialogue-options"></div><div id="dialogue-continue"></div>
    </div></div>` }));
  await page.goto(`${process.env.GAME_URL ?? 'http://127.0.0.1:5173'}/kaufmo-voice-fixture`);
  await page.evaluate(async () => {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { window.voiceEl = this; return play.call(this); };
    const { createDialogueUI } = await import('/src/ui/DialogueUI.js');
    const { createVoicePlayer } = await import('/src/audio/voicePlayer.js');
    const { SPEAKERS, level2HallwayDialogue } = await import('/src/data/dialogues.js');
    const { voiceKey } = await import('/src/audio/voiceKey.js');
    const line = level2HallwayDialogue.find(n => n.id === 'kaufmoHurriesBy');
    const key = voiceKey(line.speaker, line.text);
    const manifest = await (await fetch('/audio/voice/manifest.json')).json();
    if (!manifest.clips[key]) throw Error('Kaufmo mumble is missing from the voice manifest');
    // Wait for the player's actual manifest request, rather than a fixed sleep.
    const originalFetch = window.fetch.bind(window);
    let ready;
    const loaded = new Promise(resolve => { ready = resolve; });
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (String(args[0]).includes('manifest.json')) {
        const json = response.json.bind(response);
        response.json = async () => { const data = await json(); setTimeout(ready, 0); return data; };
      }
      return response;
    };
    const voice = createVoicePlayer();
    await loaded;
    window.fetch = originalFetch;
    window.ui = createDialogueUI({ speakers: SPEAKERS, voice });
    window.ui.play([line]);
  });
  await page.waitForFunction(() => window.voiceEl?.currentTime > 0.1);
  assert.equal(await page.locator('#dialogue-name').textContent(), 'Kaufmo');
  await page.waitForFunction(() => document.getElementById('dialogue-text').textContent.includes('three on the left'));
  assert.match(await page.locator('#dialogue-text').textContent(), /three on the left/);
  await page.evaluate(() => window.ui.setPaused(true));
  assert.equal(await page.evaluate(() => window.voiceEl.paused), true);
  await page.evaluate(() => window.ui.setPaused(false));
  await page.waitForFunction(() => !window.voiceEl.paused);
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.ui.isActive), false);
  assert.equal(await page.evaluate(() => window.voiceEl.paused), true);
  assert.deepEqual(errors, []);
  console.log('PASS Kaufmo mumble plays with text; pause/resume and cancellation stop voice correctly');
} finally { await browser.close(); }

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { INTRO_PANELS } from '../src/data/introStory.js';
import { speechText } from '../src/audio/voiceKey.js';

const ROOT = path.resolve(import.meta.dirname, '..');

// --- The script and its assets ------------------------------------------
assert.equal(INTRO_PANELS.length, 5);
for (const [i, panel] of INTRO_PANELS.entries()) {
  assert.equal(panel.type, 'line');
  assert.equal(panel.speaker, 'narrator');
  assert.ok(speechText(panel.text), `panel ${i + 1} has something to say`);
  // Spelled out in full, so tools/package.mjs ships it.
  assert.equal(panel.image, `./models/game%20screens/intro/${i + 1}.jpg`);
  const file = path.join(ROOT, 'public', decodeURIComponent(panel.image));
  assert.ok(fs.existsSync(file), `${file} exists`);
}
const generator = fs.readFileSync(path.join(ROOT, 'tools/generateVoices.mjs'), 'utf8');
assert.match(generator, /SCRIPT_MODULES = \[[^\]]*'src\/data\/introStory\.js'/);
assert.equal(generator.match(/^\s+narrator: \{ voice:/gm)?.length, 2, 'narrator is cast for ElevenLabs and Edge');
console.log('PASS Five narrated panels, each image on disk, narration in the voice pipeline');

// --- Playing it -----------------------------------------------------------
function fakeElement() {
  const classes = new Set();
  return {
    hidden: true, textContent: '', src: '', listeners: {},
    style: { props: {}, setProperty(name, value) { this.props[name] = value; } },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  };
}
function fakeRoot() {
  const parts = {
    '.intro-frame': fakeElement(), '.intro-image': fakeElement(), '.intro-caption': fakeElement(),
    '.intro-caption-text': fakeElement(), '.intro-skip': fakeElement(),
  };
  return Object.assign(fakeElement(), { parts, querySelector: (selector) => parts[selector] });
}
function fakeVoice({ clips = false } = {}) {
  return {
    played: [], stopped: 0, at: null,
    play(speaker, text) { this.played.push(text); this.at = clips ? 0 : null; return clips; },
    progress() { return this.at; },
    stop() { this.stopped++; this.at = null; },
    setPaused() {},
  };
}
let keyHandler = null;
globalThis.window = { addEventListener: (type, fn) => { if (type === 'keydown') keyHandler = fn; } };
const key = (code) => keyHandler({ code, repeat: false, preventDefault() {}, stopImmediatePropagation() {} });
const { createIntroStory, readSeconds } = await import('../src/ui/introStory.js');
const run = (story, seconds) => { for (let t = 0; t < seconds; t += 0.05) story.update(0.05); };

// Without clips it reads at its own pace and moves on by itself.
{
  const root = fakeRoot();
  const voice = fakeVoice();
  const story = createIntroStory({ root, voice });
  let done = 0;
  story.play(() => done++);
  assert.equal(root.hidden, false);
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[0].image);
  assert.equal(root.parts['.intro-caption'].hidden, true, 'no caption while fading up');
  run(story, 1.1);
  assert.equal(root.parts['.intro-caption'].hidden, false);
  assert.deepEqual(voice.played, [INTRO_PANELS[0].text]);
  run(story, 1);
  const typed = root.parts['.intro-caption-text'].textContent;
  assert.ok(typed.length > 0 && typed.length < INTRO_PANELS[0].text.length, 'types out');
  run(story, readSeconds(INTRO_PANELS[0].text) + 0.3); // reading time + hold, into the cut
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[1].image, 'next panel after reading time');
  assert.equal(root.parts['.intro-frame'].classList.contains('intro-glitch'), true, 'glitch cut');
  run(story, 0.5);
  assert.equal(root.parts['.intro-frame'].classList.contains('intro-glitch'), false);
  for (const panel of INTRO_PANELS.slice(1)) run(story, readSeconds(panel.text) + 2);
  run(story, 2);
  assert.equal(done, 1);
  assert.equal(story.active, false);
  assert.equal(root.hidden, true);
}
console.log('PASS Unvoiced: fades up, types, waits to be read, glitch-cuts through all five, ends hidden');

// With a clip the caption follows it and the panel waits for it to finish.
{
  const root = fakeRoot();
  const voice = fakeVoice({ clips: true });
  const story = createIntroStory({ root, voice });
  story.play(() => {});
  run(story, 1.1);
  voice.at = 0.5;
  story.update(0.01);
  const text = INTRO_PANELS[0].text;
  assert.equal(root.parts['.intro-caption-text'].textContent, text.slice(0, Math.round(text.length / 2)));
  run(story, readSeconds(text) + 5);
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[0].image, 'still on the panel while the clip plays');
  voice.at = 1;
  run(story, 1.5);
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[1].image);
  story.skip();
}
console.log('PASS Voiced: the caption keeps pace with the clip, and the panel holds until it ends');

// Space finishes the caption, then turns the page; Escape ends it all, once.
{
  const root = fakeRoot();
  const voice = fakeVoice();
  const story = createIntroStory({ root, voice });
  let done = 0;
  story.play(() => done++);
  run(story, 1.2);
  key('Space');
  assert.equal(root.parts['.intro-caption-text'].textContent, INTRO_PANELS[0].text);
  key('Space');
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[1].image);
  key('Space'); // mid-glitch: ignored
  assert.equal(root.parts['.intro-image'].src, INTRO_PANELS[1].image);
  key('Escape');
  key('Escape');
  assert.equal(done, 1);
  assert.equal(root.hidden, true);
  assert.ok(voice.stopped > 0, 'narration stops');
  run(story, 5);
  assert.equal(done, 1, 'nothing more after skipping');
}
console.log('PASS Space finishes then advances; Escape skips the rest exactly once');

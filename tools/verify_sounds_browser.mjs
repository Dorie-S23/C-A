import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Vite must be running. Serves stand-in WAVs in place of the generated
// sounds (decodeAudioData sniffs the format, so the .mp3 name doesn't
// matter), so this runs with or without `npm run sounds` having been run.
function wav(seconds, sample, rate = 22050) {
  const count = Math.round(seconds * rate);
  const out = Buffer.alloc(44 + count * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + count * 2, 4); out.write('WAVE', 8);
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(rate, 24); out.writeUInt32LE(rate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) out.writeInt16LE(Math.round(32767 * Math.max(-1, Math.min(1, sample(i / rate)))), 44 + i * 2);
  return out;
}
const FILES = {
  'manifest.json': Buffer.from(JSON.stringify({ sounds: { knock: {}, 'ambience-pomni': {}, 'ambience-dorm': {} } })),
  // 0.25 s of silence, then a loud decaying hit: the trim must start at the hit.
  'knock.mp3': wav(0.6, t => (t < 0.25 ? 0 : 0.9 * Math.exp(-(t - 0.25) * 30) * Math.sin(2 * Math.PI * 180 * t))),
  'ambience-pomni.mp3': wav(2, t => 0.8 * Math.sin(2 * Math.PI * 220 * t)),
  'ambience-dorm.mp3': wav(2, t => 0.8 * Math.sin(2 * Math.PI * 330 * t)),
};

const browser = await chromium.launch({
  channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
try {
  await page.route('**/audio/sounds/*', route => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    return FILES[name] ? route.fulfill({ body: FILES[name], contentType: 'application/octet-stream' }) : route.fulfill({ status: 404 });
  });
  await page.route('**/sounds-fixture', route => route.fulfill({ contentType: 'text/html', body: '<p>sounds</p>' }));
  await page.goto('http://127.0.0.1:5173/sounds-fixture');

  const knock = await page.evaluate(async () => {
    const { loadSound } = await import('/src/audio/sounds.js');
    const context = new AudioContext();
    const buffer = await loadSound(context, 'knock', { peak: 0.5, trimStart: true });
    const data = buffer.getChannelData(0);
    return { duration: buffer.duration, first: Math.abs(data[0]), peak: Math.max(...data.map(Math.abs)) };
  });
  assert.ok(knock.duration < 0.4, `trimmed knock is ${knock.duration}s`);
  assert.ok(Math.abs(knock.peak - 0.5) < 0.01, `peak ${knock.peak}`);
  console.log(`PASS Knock: lead-in silence trimmed (${knock.duration.toFixed(2)}s left), scaled to peak 0.5`);

  const missing = await page.evaluate(async () => {
    const { loadSound } = await import('/src/audio/sounds.js');
    return loadSound(new AudioContext(), 'snore', { peak: 0.2 });
  });
  assert.equal(missing, null);
  console.log('PASS A sound missing from the manifest resolves to null (caller keeps its fallback)');

  await page.evaluate(async () => {
    // Watch the ambience's sources and its master gain from outside.
    window.sources = [];
    const start = AudioBufferSourceNode.prototype.start, stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...a) { window.sources.push({ node: this, stoppedAt: null }); return start.apply(this, a); };
    AudioBufferSourceNode.prototype.stop = function (...a) { window.sources.find(s => s.node === this).stoppedAt = a[0] ?? 0; return stop.apply(this, a); };
    const gain = AudioContext.prototype.createGain;
    window.gains = [];
    AudioContext.prototype.createGain = function () { const g = gain.call(this); window.gains.push(g); return g; };
    const { createAmbience } = await import('/src/audio/ambience.js');
    window.context = new AudioContext();
    window.ambience = createAmbience(() => window.context);
    window.ambience.setRoom('pomni');
  });
  await page.waitForFunction(() => window.sources.length === 1);
  assert.equal(await page.evaluate(() => window.sources[0].node.loop), true);
  console.log('PASS Entering a room starts its loop');

  await page.evaluate(() => window.ambience.setRoom('dorm'));
  await page.waitForFunction(() => window.sources.length === 2);
  assert.notEqual(await page.evaluate(() => window.sources[0].stoppedAt), null);
  assert.equal(await page.evaluate(() => window.sources[1].stoppedAt), null);
  console.log('PASS Changing room fades the old loop out and the new one in');

  await page.evaluate(() => window.ambience.setRoom('ribbit')); // not generated: silence, no request
  await page.waitForFunction(() => window.sources[1].stoppedAt !== null);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.sources.length), 2);
  console.log('PASS A room without a loop fades to silence');

  await page.evaluate(() => window.ambience.setRoom('pomni'));
  await page.waitForFunction(() => window.sources.length === 3);
  const master = () => page.evaluate(() => window.gains[0].gain.value);
  await page.evaluate(() => window.ambience.setPaused(true));
  await page.waitForTimeout(800);
  const ducked = await master();
  await page.evaluate(() => window.ambience.setPaused(false));
  await page.waitForTimeout(800);
  const restored = await master();
  assert.ok(ducked < restored * 0.5, `paused ${ducked} vs ${restored}`);
  console.log(`PASS Pausing ducks the bed (${ducked.toFixed(2)} → ${restored.toFixed(2)})`);

  await page.evaluate(() => window.ambience.setRoom(null));
  await page.waitForFunction(() => window.sources[2].stoppedAt !== null);
  console.log('PASS Returning home fades the bed out');
} finally {
  await browser.close();
}

// Generates the game's recorded sound effects with ElevenLabs' text-to-sound
// model into public/audio/sounds/: a looping ambience bed per room (played by
// src/audio/ambience.js) and the opening's snore and door knock (which
// replace the code-synthesized placeholders in openingAudio.js once present).
// Needs ELEVENLABS_API_KEY (see tools/elevenlabs.mjs).
//
//   npm run sounds                         # generate new/changed sounds
//   npm run sounds -- --check              # no network, no credits: list what's missing
//   npm run sounds -- --only=knock,snore   # retake just these (spends their credits again)
//
// Sounds cost 40 credits per second, so keep loops short: a loop that
// repeats seamlessly doesn't need to be long. Edit a prompt or length below
// and re-run; only that sound is regenerated.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as eleven from './elevenlabs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'sounds');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
const CREDITS_PER_SECOND = 40;

// Ambience ids are `ambience-<room key>` (the keys of ROOM_LOADERS in
// main.js). Each is a quiet bed under everything else — "unobtrusive" and
// "no music in the foreground" keep the model from writing a tune over it.
const SOUNDS = {
  'ambience-pomni': {
    seconds: 12, loop: true,
    prompt: 'Quiet bedroom ambience inside a surreal cartoon circus, soft room tone, faint muffled carnival music '
      + 'drifting from far away through the walls, gentle low hum, calm and unobtrusive, seamless loop',
  },
  'ambience-dorm': {
    seconds: 12, loop: true,
    prompt: 'Long empty hallway ambience, hollow echoey room tone, distant muffled circus music, occasional faint '
      + 'wooden creak, subtle electrical hum, slightly lonely, unobtrusive, seamless loop',
  },
  'ambience-tadc': {
    seconds: 12, loop: true,
    prompt: 'Inside an empty giant circus big top tent, airy reverberant ambience, distant cheerful calliope music '
      + 'echoing faintly, soft canvas rustling, slightly eerie, unobtrusive, seamless loop',
  },
  'ambience-ribbit': {
    seconds: 12, loop: true,
    prompt: 'Small quiet bedroom ambience, soft muffled rain against a window, low gentle room tone, melancholy and '
      + 'still, unobtrusive, seamless loop',
  },
  'ambience-kaufmo': {
    seconds: 12, loop: true,
    prompt: 'Cluttered small room ambience, faint ticking clock, occasional quiet paper rustle, low uneasy hum, '
      + 'distant muffled carnival music, tense but quiet, unobtrusive, seamless loop',
  },
  'ambience-maze': {
    seconds: 12, loop: true,
    prompt: 'Eerie digital void ambience, low pulsing synth drone, faint glitchy digital static crackles, distant '
      + 'warped slowed-down carnival music, tense, unobtrusive, seamless loop',
  },
  // Replaces makeOpeningBuffers' snore: looped while Pomni sleeps.
  snore: {
    seconds: 4, loop: true,
    prompt: 'A young woman softly snoring while asleep, one slow gentle breath in and out through the nose, '
      + 'close up, quiet bedroom, no other sounds, seamless loop',
  },
  // Replaces makeOpeningBuffers' knock: one knock, played three times at
  // KNOCK_TIMES, so it must be a single short hit with no lead-in.
  knock: {
    seconds: 0.8, loop: false,
    prompt: 'A single firm knuckle knock on a wooden bedroom door, one hit only, dry and close, short decay',
  },
};

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const force = args.includes('--force');
const overBudget = args.includes('--over-budget');
const only = args.find((arg) => arg.startsWith('--only='))?.split('=')[1].split(',').filter(Boolean) ?? null;
for (const id of only ?? []) {
  if (!SOUNDS[id]) {
    console.error(`Unknown sound "${id}". Sounds: ${Object.keys(SOUNDS).join(', ')}`);
    process.exit(1);
  }
}

async function main() {
  const manifest = readManifest();
  const all = Object.entries(SOUNDS).map(([id, sound]) => ({ id, ...sound, signature: signatureOf(sound) }));
  const todo = all.filter((sound) => (only ? only.includes(sound.id) : force
    || manifest.sounds[sound.id]?.signature !== sound.signature
    || !fs.existsSync(path.join(OUT_DIR, `${sound.id}.mp3`))));
  const cost = Math.ceil(todo.reduce((sum, sound) => sum + sound.seconds, 0) * CREDITS_PER_SECOND);

  console.log(`${all.length} sounds · ${all.length - todo.length} up to date · ${todo.length} to generate (~${cost} credits)`);
  if (checkOnly) {
    for (const sound of todo) console.log(`  missing  ${sound.id}  (${sound.seconds}s)`);
    process.exitCode = todo.length ? 1 : 0;
    return;
  }
  if (!todo.length) return;

  try {
    const left = await eleven.creditsRemaining();
    if (left === null) console.log('  (this key can\'t read the credit balance — check it on elevenlabs.io)');
    else {
      console.log(`  ElevenLabs credits left this month: ${left}`);
      if (cost > left && !overBudget) {
        console.error(`Not enough credits for ~${cost}. Use --only=… for fewer sounds, or pass --over-budget.`);
        process.exitCode = 1;
        return;
      }
    }
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  let failed = 0;
  try {
    // One at a time: these are few, and the free plan allows little concurrency.
    for (const sound of todo) {
      try {
        const audio = await eleven.withRetries(() => eleven.soundEffect({
          text: sound.prompt, durationSeconds: sound.seconds, loop: sound.loop, promptInfluence: 0.4,
        }));
        fs.writeFileSync(path.join(OUT_DIR, `${sound.id}.mp3`), audio);
        manifest.sounds[sound.id] = { signature: sound.signature, loop: sound.loop };
        console.log(`  ${sound.id}  ${sound.seconds}s  ${(audio.length / 1024).toFixed(0)} KB`);
      } catch (error) {
        failed++;
        console.error(`  FAILED ${sound.id}: ${error.message}`);
        if (error instanceof eleven.FatalApiError) break;
      }
    }
  } finally {
    writeManifest(manifest);
  }
  if (failed) process.exitCode = 1;
  const left = await eleven.creditsRemaining().catch(() => null);
  if (left !== null) console.log(`ElevenLabs credits left this month: ${left}`);
}

function signatureOf({ prompt, seconds, loop }) {
  return crypto.createHash('sha1').update(JSON.stringify([prompt, seconds, loop])).digest('hex').slice(0, 12);
}

function readManifest() {
  try {
    return { sounds: {}, ...JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) };
  } catch {
    return { sounds: {} };
  }
}

/** Only sounds whose file exists are listed — src/audio/sounds.js requests nothing else. */
function writeManifest(manifest) {
  const sounds = {};
  for (const id of Object.keys(SOUNDS).sort()) {
    if (manifest.sounds[id] && fs.existsSync(path.join(OUT_DIR, `${id}.mp3`))) sounds[id] = manifest.sounds[id];
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ generator: 'tools/generateSounds.mjs', sounds }, null, 2)}\n`);
}

await main();

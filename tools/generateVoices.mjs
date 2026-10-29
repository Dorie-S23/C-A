// Records every spoken dialogue line as an MP3 into public/audio/voice/, for
// voicePlayer.js to play as the line appears. Voices come from ElevenLabs
// (needs ELEVENLABS_API_KEY, see tools/elevenlabs.mjs; spends credits), or
// with --provider=edge from Microsoft Edge's free neural voices (msedge-tts,
// no key — what the game used first).
//
//   npm run voices                       # record new/changed lines, delete stale clips
//   npm run voices -- --check            # no network, no credits: list what's missing
//   npm run voices -- --force            # re-record everything (spends credits for all lines)
//   npm run voices -- --provider=edge    # free Edge voices instead (re-records everything)
//
// Re-run it after editing any line's text, mood or direction, or the casting
// below — the manifest stores what each clip was recorded with, so only the
// lines that actually changed are re-recorded (and paid for). Commit the
// clips and the manifest: the game is deployed as static files and never
// synthesizes speech itself.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { speechText, voiceKey } from '../src/audio/voiceKey.js';
import * as eleven from './elevenlabs.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'voice');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
// Every module that exports dialogue scripts (arrays of nodes).
const SCRIPT_MODULES = ['src/data/dialogues.js', 'src/cinematics/pomniInvitation.js', 'src/data/introStory.js'];

// Flash: half the credits per character of ElevenLabs' other models, so the
// whole script (~9,900 characters) fits the free plan's monthly 10,000
// credits with room for the sound effects (generateSounds.mjs) and retakes.
const ELEVEN_MODEL = 'eleven_flash_v2_5';
const ELEVEN_CREDITS_PER_CHAR = 0.5;
// Same seed every time so a re-record of an unchanged line sounds the same.
const ELEVEN_SEED = 3006;

// One voice per character, deliberately not imitations of the show's
// actors. ElevenLabs voices are matched by name against the account's voices
// (its own plus the default ones — free plans can't use Voice Library voices
// through the API); `speed` is 0.7–1.2, lower `stability` = more emotive.
const CAST = {
  elevenlabs: {
    pomni: { voice: 'Jessica', speed: 1, stability: 0.45 },   // anxious, deadpan
    ragatha: { voice: 'Sarah', speed: 1, stability: 0.5 },    // warm, strained
    caine: { voice: 'Liam', speed: 1.1, stability: 0.3 },     // manic ringmaster
    kaufmo: { voice: 'Callum', speed: 1.08, stability: 0.3 }, // jittery clown
    ribbit: { voice: 'Lily', speed: 0.92, stability: 0.55 },  // withdrawn
    jax: { voice: 'Chris', speed: 1, stability: 0.35 },       // sarcastic, cutting
    narrator: { voice: 'George', speed: 0.95, stability: 0.6 }, // the intro story: calm storyteller
  },
  edge: {
    pomni: { voice: 'en-US-AvaNeural', pitch: 4, rate: 0 },
    ragatha: { voice: 'en-US-EmmaNeural', pitch: 2, rate: -2 },
    caine: { voice: 'en-GB-RyanNeural', pitch: 6, rate: 12 },
    kaufmo: { voice: 'en-US-EricNeural', pitch: 12, rate: 10 },
    ribbit: { voice: 'en-CA-ClaraNeural', pitch: 2, rate: -8 },
    jax: { voice: 'en-US-AndrewNeural', pitch: -4, rate: -2 },
    narrator: { voice: 'en-GB-ThomasNeural', pitch: -2, rate: -6 },
  },
};

// Added to the speaker's base settings for each portrait mood: speed and
// stability for ElevenLabs, pitch/rate (in %) for Edge.
const MOOD = {
  neutral: { speed: 0, stability: 0, pitch: 0, rate: 0 },
  happy: { speed: 0.05, stability: -0.1, pitch: 4, rate: 6 },
  worried: { speed: 0.04, stability: -0.1, pitch: 2, rate: 4 },
  annoyed: { speed: -0.03, stability: 0, pitch: -3, rate: -4 },
  sad: { speed: -0.08, stability: 0.05, pitch: -6, rate: -12 },
  shocked: { speed: 0.08, stability: -0.15, pitch: 8, rate: 10 },
};
// Directions like "muttered to herself" play noticeably quieter (a gain in
// the manifest, applied by voicePlayer.js — neither service takes a volume).
const QUIET_DIRECTION = /mutter|whisper|quiet|softly|under (?:her|his|their) breath/i;
const QUIET_GAIN = 0.65;

const args = process.argv.slice(2);
const force = args.includes('--force');
const checkOnly = args.includes('--check');
const overBudget = args.includes('--over-budget');
const provider = args.find((arg) => arg.startsWith('--provider='))?.split('=')[1] ?? 'elevenlabs';
if (!CAST[provider]) {
  console.error(`Unknown provider "${provider}" — use elevenlabs or edge.`);
  process.exit(1);
}

async function main() {
  const lines = await collectLines();
  const manifest = readManifest();
  const todo = lines.filter((line) => force || manifest.clips[line.key]?.signature !== line.signature
    || !fs.existsSync(path.join(OUT_DIR, `${line.key}.mp3`)));
  const stale = listClips().filter((key) => !lines.some((line) => line.key === key));
  const chars = todo.reduce((sum, line) => sum + line.text.length, 0);
  const cost = provider === 'elevenlabs' ? Math.ceil(chars * ELEVEN_CREDITS_PER_CHAR) : 0;

  console.log(`${provider}: ${lines.length} voiced lines · ${lines.length - todo.length} up to date · `
    + `${todo.length} to record (${chars} characters${cost ? `, ~${cost} credits` : ''}) · ${stale.length} stale`);
  if (checkOnly) {
    for (const line of todo) console.log(`  missing  ${line.key}  "${preview(line.text)}"`);
    for (const key of stale) console.log(`  stale    ${key}`);
    process.exitCode = todo.length || stale.length ? 1 : 0;
    return;
  }

  let synthesizers = null;
  if (todo.length) {
    synthesizers = provider === 'elevenlabs' ? await openElevenLabs(todo, cost) : await openEdge(todo);
    if (!synthesizers) return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const key of stale) {
    fs.rmSync(path.join(OUT_DIR, `${key}.mp3`), { force: true });
    delete manifest.clips[key];
  }

  let done = 0;
  let failed = 0;
  let fatal = null;
  try {
    await synthesizers?.run(async (line, synthesize) => {
      if (fatal) return;
      try {
        const audio = await eleven.withRetries(() => synthesize(line));
        fs.writeFileSync(path.join(OUT_DIR, `${line.key}.mp3`), audio);
        manifest.clips[line.key] = { signature: line.signature, ...(line.gain !== 1 ? { gain: line.gain } : {}) };
        console.log(`  [${++done}/${todo.length}] ${line.key}  "${preview(line.text)}"`);
      } catch (error) {
        failed++;
        // Out of credits / bad key: every other line would fail the same way.
        if (error instanceof eleven.FatalApiError) fatal = error;
        else console.error(`  FAILED ${line.key}: ${error.message}`);
      }
    });
  } finally {
    // Written even after failures, so the clips that did record aren't redone (or re-paid for).
    writeManifest(manifest, lines);
  }
  if (fatal) {
    console.error(`Stopped: ${fatal.message}`);
    process.exitCode = 1;
  } else if (failed) {
    console.error(`${failed} line(s) failed - run it again to retry just those.`);
    process.exitCode = 1;
  }
  if (provider === 'elevenlabs' && todo.length) {
    const left = await eleven.creditsRemaining().catch(() => null);
    if (left !== null) console.log(`ElevenLabs credits left this month: ${left}`);
  }
}

/**
 * Every line, and every choice prompt and option with a speaker (DialogueUI
 * has the speaker say the picked option), across all script modules, once each.
 */
async function collectLines() {
  const found = new Map();
  for (const rel of SCRIPT_MODULES) {
    const mod = await import(pathToFileURL(path.join(ROOT, rel)).href);
    for (const script of Object.values(mod)) {
      if (!Array.isArray(script)) continue;
      const byId = new Map(script.map((node, i) => [node?.id, i]));
      for (const [index, node] of script.entries()) {
        if (!node?.speaker) continue;
        // An option is said aloud only when the script doesn't carry on with
        // the chooser's own full line (DialogueUI's selectOption, same rule):
        // a short label like "“It’s Pomni”" is never voiced itself.
        const spokenOptions = (node.options ?? []).filter((option) => {
          const next = script[option.next === undefined ? index + 1 : byId.get(option.next)];
          return !(next?.type === 'line' && next.speaker === node.speaker);
        });
        const texts = node.type === 'line' ? [node.text, node.altText]
          : node.type === 'choice' ? [node.text, ...spokenOptions.map((option) => option.text)]
          : [];
        for (const text of texts) {
          // Nothing to say ("…", "(Sit down…)"): the services return no audio for it.
          if (!text || !speechText(text)) continue;
          const line = describe(node, text);
          if (line) found.set(line.key, line);
        }
      }
    }
  }
  return [...found.values()];
}

function describe(node, text) {
  const cast = CAST[provider][node.speaker];
  if (!cast) {
    console.warn(`  no ${provider} voice cast for speaker "${node.speaker}" — add it to CAST`);
    return null;
  }
  const mood = MOOD[node.mood] ?? MOOD.neutral;
  const settings = provider === 'elevenlabs'
    ? {
      model: ELEVEN_MODEL,
      speed: round(clamp(cast.speed + mood.speed, 0.7, 1.2)),
      stability: round(clamp(cast.stability + mood.stability, 0, 1)),
    }
    : { pitch: percent(cast.pitch + mood.pitch), rate: percent(cast.rate + mood.rate) };
  // Named after the text as displayed (what DialogueUI looks it up by), but
  // recorded from just the part that's said aloud.
  const key = voiceKey(node.speaker, text);
  const spoken = speechText(text);
  const signature = crypto.createHash('sha1')
    .update(JSON.stringify([provider, cast.voice, settings, spoken])).digest('hex').slice(0, 12);
  const gain = QUIET_DIRECTION.test(node.direction ?? '') ? QUIET_GAIN : 1;
  return { key, text: spoken, speaker: node.speaker, voice: cast.voice, settings, signature, gain };
}

/** Checks the budget and resolves voice names; null (after explaining why) if it can't go ahead. */
async function openElevenLabs(todo, cost) {
  try {
    const left = await eleven.creditsRemaining();
    if (left === null) {
      console.log('  (this key can\'t read the credit balance — check it on elevenlabs.io before big runs)');
    } else {
      console.log(`  ElevenLabs credits left this month: ${left}`);
      if (cost > left && !overBudget) {
        console.error(`Not enough credits for ~${cost}. Record fewer lines, wait for the monthly reset, or pass --over-budget.`);
        process.exitCode = 1;
        return null;
      }
    }
    const voices = await eleven.listVoices();
    const ids = new Map();
    for (const name of new Set(todo.map((line) => line.voice))) {
      const voice = voices.find((v) => v.name.split(/\s+-\s+/)[0].trim().toLowerCase() === name.toLowerCase());
      if (!voice) {
        console.error(`No voice named "${name}" on this account. Available: ${voices.map((v) => v.name).join(', ')}`);
        process.exitCode = 1;
        return null;
      }
      ids.set(name, voice.voice_id);
    }
    const synthesize = (line) => eleven.textToSpeech(ids.get(line.voice), {
      text: line.text,
      modelId: line.settings.model,
      voiceSettings: { stability: line.settings.stability, similarity_boost: 0.75, speed: line.settings.speed },
      seed: ELEVEN_SEED,
    });
    // Two at a time: the free plan's concurrency limit.
    return { run: (worker) => eleven.eachLimited(todo, 2, (line) => worker(line, synthesize)) };
  } catch (error) {
    console.error(`Stopped: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

async function openEdge(todo) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
  return {
    // One connection per voice, run side by side: switching voice means a new socket anyway.
    async run(worker) {
      await Promise.all([...Map.groupBy(todo, (line) => line.voice)].map(async ([voice, group]) => {
        const tts = new MsEdgeTTS();
        try {
          await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
          const synthesize = async (line) => {
            const { audioStream } = tts.toStream(escapeXml(line.text), line.settings);
            const chunks = [];
            for await (const chunk of audioStream) chunks.push(chunk);
            const audio = Buffer.concat(chunks);
            if (audio.length === 0) throw new Error('empty audio');
            return audio;
          };
          for (const line of group) await worker(line, synthesize);
        } finally {
          tts.close();
        }
      }));
    },
  };
}

// msedge-tts pastes the text straight into its SSML, so a "&" or "<" in a
// line would otherwise break the request.
function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function percent(n) {
  return `${n >= 0 ? '+' : ''}${n}%`;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function round(n) {
  return Math.round(n * 100) / 100;
}

function preview(text) {
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function listClips() {
  if (!fs.existsSync(OUT_DIR)) return [];
  return fs.readdirSync(OUT_DIR).filter((f) => f.endsWith('.mp3')).map((f) => f.slice(0, -4));
}

function readManifest() {
  try {
    const { clips = {} } = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    // Older manifests stored just the signature string per clip.
    for (const [key, entry] of Object.entries(clips)) if (typeof entry === 'string') clips[key] = { signature: entry };
    return { clips };
  } catch {
    return { clips: {} };
  }
}

/** Only keys whose clip exists are listed — voicePlayer.js requests nothing else. */
function writeManifest(manifest, lines) {
  const clips = {};
  for (const { key } of [...lines].sort((a, b) => a.key.localeCompare(b.key))) {
    if (manifest.clips[key] && fs.existsSync(path.join(OUT_DIR, `${key}.mp3`))) clips[key] = manifest.clips[key];
  }
  fs.writeFileSync(MANIFEST, `${JSON.stringify({ generator: 'tools/generateVoices.mjs', clips }, null, 2)}\n`);
}

await main();

// Records every spoken dialogue line as an MP3 with Microsoft Edge's neural
// text-to-speech (via msedge-tts: free, no API key, needs internet), into
// public/audio/voice/, for voicePlayer.js to play as the line appears.
//
//   npm run voices              # record new/changed lines, delete stale clips
//   npm run voices -- --force   # re-record everything
//   npm run voices -- --check   # no network: list what's missing, exit 1 if anything is
//
// Re-run it after editing any line's text, mood or direction, or the casting
// below — the manifest stores what each clip was recorded with, so only the
// lines that actually changed are re-recorded. Commit the clips and the
// manifest: the game is deployed as static files and never synthesizes
// speech itself.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { speechText, voiceKey } from '../src/audio/voiceKey.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'audio', 'voice');
const MANIFEST = path.join(OUT_DIR, 'manifest.json');
// Every module that exports dialogue scripts (arrays of nodes).
const SCRIPT_MODULES = ['src/data/dialogues.js', 'src/cinematics/pomniInvitation.js'];
const FORMAT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

// One stock Edge voice per character, nudged by pitch/rate (in %) so the
// cast stays distinguishable. Deliberately not imitations of the show's
// actors. Voice names: `new MsEdgeTTS().getVoices()`.
const CAST = {
  pomni: { voice: 'en-US-AvaNeural', pitch: 4, rate: 0 },     // anxious, deadpan
  ragatha: { voice: 'en-US-EmmaNeural', pitch: 2, rate: -2 }, // warm, strained
  caine: { voice: 'en-GB-RyanNeural', pitch: 6, rate: 12 },   // manic ringmaster
  kaufmo: { voice: 'en-US-EricNeural', pitch: 12, rate: 10 }, // jittery clown
  ribbit: { voice: 'en-CA-ClaraNeural', pitch: 2, rate: -8 }, // withdrawn
};

// Added to the speaker's base pitch/rate for each portrait mood.
const MOOD = {
  neutral: { pitch: 0, rate: 0 },
  happy: { pitch: 4, rate: 6 },
  worried: { pitch: 2, rate: 4 },
  annoyed: { pitch: -3, rate: -4 },
  sad: { pitch: -6, rate: -12 },
  shocked: { pitch: 8, rate: 10 },
};
// Directions like "muttered to herself" are read noticeably quieter.
const QUIET_DIRECTION = /mutter|whisper|quiet|softly|under (?:her|his|their) breath/i;

const args = new Set(process.argv.slice(2));
const force = args.has('--force');
const checkOnly = args.has('--check');

async function main() {
  const lines = await collectLines();
  const manifest = readManifest();
  const todo = lines.filter((line) => force || manifest.clips[line.key] !== line.signature
    || !fs.existsSync(path.join(OUT_DIR, `${line.key}.mp3`)));
  const stale = listClips().filter((key) => !lines.some((line) => line.key === key));

  console.log(`${lines.length} voiced lines · ${lines.length - todo.length} up to date · ${todo.length} to record · ${stale.length} stale`);
  if (checkOnly) {
    for (const line of todo) console.log(`  missing  ${line.key}  "${line.text}"`);
    for (const key of stale) console.log(`  stale    ${key}`);
    process.exitCode = todo.length || stale.length ? 1 : 0;
    return;
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const key of stale) {
    fs.rmSync(path.join(OUT_DIR, `${key}.mp3`), { force: true });
    delete manifest.clips[key];
  }

  // One connection per voice, run side by side: switching voice means a new
  // socket anyway, and the five together finish in a fraction of the time.
  const byVoice = Map.groupBy(todo, (line) => line.voice);
  let done = 0;
  let failed = 0;
  try {
    await Promise.all([...byVoice].map(async ([voice, group]) => {
      const tts = new MsEdgeTTS();
      try {
        await tts.setMetadata(voice, FORMAT);
        for (const line of group) {
          try {
            const audio = await withRetries(() => synthesize(tts, line));
            fs.writeFileSync(path.join(OUT_DIR, `${line.key}.mp3`), audio);
            manifest.clips[line.key] = line.signature;
            console.log(`  [${++done}/${todo.length}] ${line.key}  "${preview(line.text)}"`);
          } catch (error) {
            failed++;
            console.error(`  FAILED ${line.key}: ${error.message}`);
          }
        }
      } finally {
        tts.close();
      }
    }));
  } finally {
    // Written even after failures, so the clips that did record aren't redone.
    writeManifest(manifest, lines);
  }
  if (failed) {
    console.error(`${failed} line(s) failed - run it again to retry just those.`);
    process.exitCode = 1;
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
      for (const node of script) {
        if (!node?.speaker) continue;
        const texts = node.type === 'line' ? [node.text, node.altText]
          : node.type === 'choice' ? [node.text, ...(node.options ?? []).map((option) => option.text)]
          : [];
        for (const text of texts) {
          // Nothing to say ("…", "(Sit down…)"): the service returns no audio for it.
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
  const cast = CAST[node.speaker];
  if (!cast) {
    console.warn(`  no voice cast for speaker "${node.speaker}" — add it to CAST`);
    return null;
  }
  const mood = MOOD[node.mood] ?? MOOD.neutral;
  const prosody = {
    pitch: percent(cast.pitch + mood.pitch),
    rate: percent(cast.rate + mood.rate),
    volume: QUIET_DIRECTION.test(node.direction ?? '') ? '-30%' : '+0%',
  };
  // Named after the text as displayed (what DialogueUI looks it up by), but
  // recorded from just the part that's said aloud.
  const key = voiceKey(node.speaker, text);
  const spoken = speechText(text);
  const signature = crypto.createHash('sha1')
    .update(JSON.stringify([cast.voice, prosody, spoken, FORMAT])).digest('hex').slice(0, 12);
  return { key, text: spoken, voice: cast.voice, prosody, signature };
}

async function synthesize(tts, line) {
  const { audioStream } = tts.toStream(escapeXml(line.text), line.prosody);
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  const audio = Buffer.concat(chunks);
  if (audio.length === 0) throw new Error('empty audio');
  return audio;
}

async function withRetries(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * i));
    }
  }
}

// msedge-tts pastes the text straight into its SSML, so a "&" or "<" in a
// line would otherwise break the request.
function escapeXml(text) {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
}

function percent(n) {
  return `${n >= 0 ? '+' : ''}${n}%`;
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
    return { clips: {}, ...JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) };
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

// Minimal ElevenLabs API client shared by the asset generators
// (generateVoices.mjs, generateSounds.mjs). Only these Node tools ever see
// the API key: it's read from ELEVENLABS_API_KEY or C-A/.env (gitignored),
// and never reaches the game — Vite only exposes VITE_-prefixed variables
// to the bundle, and the game just plays the MP3s these tools write.
import fs from 'node:fs';
import path from 'node:path';

const API = 'https://api.elevenlabs.io';
const ROOT = path.resolve(import.meta.dirname, '..');

/** Out of credits, or a bad/under-permissioned key: retrying only repeats it. */
export class FatalApiError extends Error {}

let key = null;
export function apiKey() {
  if (key) return key;
  const envFile = path.join(ROOT, '.env');
  if (!process.env.ELEVENLABS_API_KEY && fs.existsSync(envFile)) process.loadEnvFile(envFile);
  key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new FatalApiError('No ElevenLabs API key. Create one at elevenlabs.io (Developers → API keys), then put\n'
      + '  ELEVENLABS_API_KEY=your-key\nin C-A/.env (gitignored — never commit it), or set it in your shell.');
  }
  return key;
}

async function request(method, route, { query, body } = {}) {
  const url = new URL(route, API);
  for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
  const response = await fetch(url, {
    method,
    headers: { 'xi-api-key': apiKey(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (response.ok) return response;
  const detail = (await response.text()).slice(0, 400);
  if (response.status === 401 || response.status === 402 || /quota|credit/i.test(detail)) {
    throw new FatalApiError(`ElevenLabs ${response.status}: ${detail}`);
  }
  const error = new Error(`ElevenLabs ${response.status}: ${detail}`);
  error.retryable = response.status === 429 || response.status >= 500;
  throw error;
}

async function audio(response) {
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) throw new Error('empty audio');
  return buffer;
}

/** Voices this account can use (its own plus ElevenLabs' default voices), by name. */
export async function listVoices() {
  const voices = [];
  let token = null;
  do {
    const response = await request('GET', '/v2/voices', {
      query: { page_size: 100, ...(token ? { next_page_token: token } : {}) },
    });
    const page = await response.json();
    voices.push(...page.voices);
    token = page.has_more ? page.next_page_token : null;
  } while (token);
  return voices;
}

/** @returns {Promise<Buffer>} MP3 */
export async function textToSpeech(voiceId, { text, modelId, voiceSettings, seed }) {
  return audio(await request('POST', `/v1/text-to-speech/${voiceId}`, {
    query: { output_format: 'mp3_44100_64' },
    body: { text, model_id: modelId, voice_settings: voiceSettings, seed },
  }));
}

/** @returns {Promise<Buffer>} MP3 */
export async function soundEffect({ text, durationSeconds, loop = false, promptInfluence = 0.3 }) {
  return audio(await request('POST', '/v1/sound-generation', {
    query: { output_format: 'mp3_44100_128' },
    body: { text, duration_seconds: durationSeconds, loop, prompt_influence: promptInfluence },
  }));
}

/**
 * Credits left this billing period, or null if the key isn't allowed to read
 * the subscription (keys can be restricted to just TTS/sound effects).
 */
export async function creditsRemaining() {
  try {
    const sub = await (await request('GET', '/v1/user/subscription')).json();
    return sub.character_limit - sub.character_count;
  } catch (error) {
    if (error instanceof FatalApiError && /missing_permissions|permission/i.test(error.message)) return null;
    throw error;
  }
}

/** Retries network blips and 429/5xx; anything else (or a FatalApiError) fails at once. */
export async function withRetries(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const retryable = error.retryable || error instanceof TypeError; // fetch network failures are TypeErrors
      if (i >= attempts || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * i));
    }
  }
}

/** Runs `worker` over `items` with at most `limit` in flight (free plans allow few concurrent requests). */
export async function eachLimited(items, limit, worker) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++]);
  }));
}

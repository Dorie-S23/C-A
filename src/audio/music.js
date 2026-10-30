import { arrangeTrack, ROOM_TRACKS } from './musicScores.js';
import { holdLoop, resumeLoop, startLoop } from './pausableLoop.js';

// Mono at 32 kHz: high enough for the music box's top partials (up to
// ~14 kHz), and a 50-second loop is still only ~6 MB once rendered.
const RATE = 32000;
// The loop is synthesized in pieces this long (see render).
const SEGMENT_SECONDS = 6;
// How long past its piece a note may still be ringing: a music box tine
// takes about 4 s to die away.
const RING_SECONDS = 4.5;
const FADE_IN_SECONDS = .4;
const FADE_OUT_SECONDS = 1.5;
// While someone is talking (or a cutscene's own sounds are playing) the
// music steps back so the voices and effects sit clearly on top.
const DUCKED_LEVEL = .45;
// Average loudness every track is rendered to, so moving between rooms
// doesn't jump in level. At the default volume this sits about 6 dB under
// the voice clips (~0.09 RMS) and well over the ambience beds.
const RMS = .12;
export const DEFAULT_MUSIC_VOLUME = .4;

/**
 * Synthesized instruments. `tone`: one oscillator (a waveform `type`, or
 * custom `harmonics` from the fundamental up) through an attack / decay to
 * `sustain` / release envelope (times in seconds), with optional `vibrato`
 * [cycles per second, cents], random per-note `detune` (cents) and a lowpass
 * `cutoff` (Hz) on the whole part. `bell`: struck partials
 * [frequency ratio, level, decay time constant], ringing past the written
 * note length. `tick`: a filtered noise click, pitched by the note.
 * `drone`: held for the whole loop.
 */
export const INSTRUMENTS = {
  // Steam-whistle pipes: nearly pure, a little reedy, wobbling, and never
  // quite in tune with each other.
  calliope: { kind: 'tone', harmonics: [1, .45, .25, .12, .08, .04], attack: .025, decay: .3, sustain: .85, release: .09, vibrato: [5.6, 14], detune: 9 },
  organ: { kind: 'tone', harmonics: [1, .5, .3, .2, .1], attack: .06, decay: .4, sustain: .9, release: .25, vibrato: [5, 8], detune: 4 },
  // Odd harmonics only, like a clarinet.
  reed: { kind: 'tone', harmonics: [1, 0, .33, 0, .2, 0, .14, 0, .1], attack: .015, decay: .12, sustain: .7, release: .06, detune: 5, cutoff: 2600 },
  tuba: { kind: 'tone', type: 'sawtooth', attack: .02, decay: .12, sustain: .55, release: .08, cutoff: 600 },
  pad: { kind: 'tone', harmonics: [1, .3, .12], attack: .4, decay: 1, sustain: 1, release: .9, vibrato: [4.2, 6], detune: 6 },
  pluck: { kind: 'tone', type: 'triangle', attack: .004, decay: .3, sustain: 0, release: .08, cutoff: 2200 },
  // A music box's comb tine rings almost pure; the 6.27× partial (where a
  // clamped bar's second mode sits) is the brief "ping" of it being plucked.
  musicBox: { kind: 'bell', partials: [[1, 1, .6], [2, .08, .25], [6.27, .2, .05]] },
  glock: { kind: 'bell', partials: [[1, 1, .4], [2.76, .3, .1], [5.4, .12, .04]] },
  tick: { kind: 'tick' },
  drone: { kind: 'drone', type: 'triangle', spread: 5, cutoff: 380 },
};

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

// Whole cycles per loop, so anything periodic (a vibrato, a drone) is back
// in the same phase where the loop wraps, rather than jumping.
const loopRate = (rate, loopSeconds) => Math.max(1, Math.round(rate * loopSeconds)) / loopSeconds;

// Deterministic, so a track sounds the same (same "out of tune" pipes) every
// time it's rendered.
function seeded(text) {
  let seed = [...text].reduce((hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619), 2166136261);
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Decaying noise, darkened a little by a one-pole lowpass: a plain
// synthetic hall. -60 dB at `seconds`.
function impulse(seconds, random) {
  const buffer = new AudioBuffer({ length: Math.ceil(seconds * RATE), sampleRate: RATE });
  const data = buffer.getChannelData(0);
  let low = 0;
  for (let i = 0; i < data.length; i++) {
    low = low * .6 + (random() * 2 - 1) * .4;
    data[i] = low * Math.exp((-6.9 * i) / data.length);
  }
  return buffer;
}

/**
 * A sine LFO in cents, for connecting to oscillators' detune. Its wave is
 * shifted to where `startTime` (seconds into the loop) falls in the cycle,
 * so the separately rendered pieces of a loop share one unbroken wobble.
 */
function makeLfo(context, [rate, cents], loopSeconds, startTime) {
  const frequency = loopRate(rate, loopSeconds);
  const phase = 2 * Math.PI * frequency * startTime;
  const lfo = context.createOscillator();
  // sin(θ + phase) = sin(phase)·cos θ + cos(phase)·sin θ
  lfo.setPeriodicWave(context.createPeriodicWave(
    Float32Array.of(0, Math.sin(phase)),
    Float32Array.of(0, Math.cos(phase)),
    { disableNormalization: true },
  ));
  lfo.frequency.value = frequency;
  const depth = context.createGain();
  depth.gain.value = cents;
  lfo.connect(depth);
  lfo.start(0);
  return depth;
}

function playTone(context, voice, note) {
  const { spec } = voice;
  const osc = context.createOscillator();
  if (spec.harmonics) osc.setPeriodicWave(voice.wave);
  else osc.type = spec.type;
  osc.frequency.value = hz(note.midi);
  osc.detune.value = note.detune * (spec.detune ?? 0);
  for (const mod of voice.mods) mod.connect(osc.detune);
  const envelope = context.createGain();
  const gain = envelope.gain;
  const peakAt = note.time + spec.attack;
  const end = Math.max(note.time + note.duration, peakAt);
  gain.setValueAtTime(0, note.time);
  gain.linearRampToValueAtTime(note.velocity, peakAt);
  gain.setTargetAtTime(note.velocity * spec.sustain, peakAt, spec.decay / 3);
  gain.setTargetAtTime(0, end, spec.release / 3);
  osc.connect(envelope).connect(voice.bus);
  osc.start(note.time);
  osc.stop(end + spec.release * 2);
}

function playBell(context, voice, note) {
  for (const [ratio, level, decay] of voice.spec.partials) {
    const frequency = hz(note.midi) * ratio;
    if (frequency > RATE * .45) continue; // would alias
    const osc = context.createOscillator();
    osc.frequency.value = frequency;
    for (const mod of voice.mods) mod.connect(osc.detune);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, note.time);
    envelope.gain.linearRampToValueAtTime(note.velocity * level, note.time + .003);
    envelope.gain.setTargetAtTime(0, note.time + .003, decay);
    osc.connect(envelope).connect(voice.bus);
    osc.start(note.time);
    osc.stop(note.time + .003 + decay * 7);
  }
}

function playTick(context, voice, note) {
  const source = context.createBufferSource();
  source.buffer = voice.noise;
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = hz(note.midi);
  band.Q.value = 6;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(note.velocity, note.time);
  envelope.gain.setTargetAtTime(0, note.time, .012);
  source.connect(band).connect(envelope).connect(voice.bus);
  source.start(note.time);
  source.stop(note.time + .08);
}

// A pair of slightly detuned oscillators, each tuned to whole cycles per
// loop and stopped exactly at its end, so the wrap is seamless.
function playDrone(context, voice, note, loopSeconds) {
  for (const cents of [-voice.spec.spread, voice.spec.spread]) {
    const osc = context.createOscillator();
    osc.type = voice.spec.type;
    osc.frequency.value = loopRate(hz(note.midi) * 2 ** (cents / 1200), loopSeconds);
    const level = context.createGain();
    level.gain.value = note.velocity * .5;
    osc.connect(level).connect(voice.bus);
    osc.start(0);
    osc.stop(loopSeconds);
  }
}

const PLAYERS = { tone: playTone, bell: playBell, tick: playTick, drone: playDrone };

/** Each part's level, lowpass and LFOs, feeding `output`. */
function makeVoices(context, track, output, startTime, noise) {
  const wobble = track.wobble && makeLfo(context, track.wobble, track.loopSeconds, startTime);
  return track.parts.map((part) => {
    const spec = { ...INSTRUMENTS[part.instrument], ...part.tone };
    const bus = context.createGain();
    bus.gain.value = part.gain;
    if (spec.cutoff) {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = spec.cutoff;
      bus.connect(filter).connect(output);
    } else {
      bus.connect(output);
    }
    const mods = [spec.vibrato && makeLfo(context, spec.vibrato, track.loopSeconds, startTime), wobble].filter(Boolean);
    const wave = spec.harmonics && context.createPeriodicWave(
      new Float32Array(spec.harmonics.length + 1),
      Float32Array.from([0, ...spec.harmonics]),
    );
    return { spec, bus, mods, wave, noise, play: PLAYERS[spec.kind] };
  });
}

// Adds `samples` into the loop starting at `offset`, wrapping past its end
// back round to the start.
function addLooped(loop, samples, offset) {
  for (let i = 0; i < samples.length; i++) loop[(offset + i) % loop.length] += samples[i];
}

/**
 * Synthesizes one track into a seamless loop (mono samples at RATE).
 *
 * The notes are rendered in SEGMENT_SECONDS pieces, each its own small
 * OfflineAudioContext, all at once. One context holding every note was far
 * slower (18 s for a 55-second track: Web Audio still processes nodes that
 * haven't started yet on every block), and pausing a single render to add
 * notes as it went needed the main thread for every pause, which crawled
 * whenever a room was loading. Each piece runs on past its end while its
 * last notes ring out, and adds into the loop wrapped round, so the final
 * bar's tails carry on over bar 1 exactly as they will on every repeat.
 * Then one last pass adds the drone and the reverb, wrapped the same way, so
 * there's no gap or click where the loop restarts.
 */
async function render(key) {
  const track = arrangeTrack(key);
  const { loopSeconds } = track;
  const loopLength = Math.round(loopSeconds * RATE);
  const random = seeded(key);
  const noise = new AudioBuffer({ length: Math.ceil(.08 * RATE), sampleRate: RATE });
  const noiseData = noise.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = random() * 2 - 1;

  // A few milliseconds of looseness, a little variation in how hard each
  // note is played and, for instruments that drift, how far out of tune:
  // performed rather than sequenced.
  const notes = track.notes.map((note) => ({
    ...note,
    time: note.time + (note.time > 0 ? (random() - .5) * .008 : 0),
    velocity: note.velocity * (.94 + random() * .12),
    detune: random() * 2 - 1,
  }));
  const isDrone = (note) => track.parts[note.part].play === 'drone';

  const segments = Math.ceil(loopSeconds / SEGMENT_SECONDS);
  const pieces = await Promise.all(Array.from({ length: segments }, (_, segment) => {
    const from = segment * SEGMENT_SECONDS;
    const to = segment + 1 < segments ? from + SEGMENT_SECONDS : Infinity;
    const length = Math.min(SEGMENT_SECONDS, loopSeconds - from) + RING_SECONDS;
    const context = new OfflineAudioContext(1, Math.ceil(length * RATE), RATE);
    const voices = makeVoices(context, track, context.destination, from, noise);
    for (const note of notes) {
      if (note.time < from || note.time >= to || isDrone(note)) continue;
      voices[note.part].play(context, voices[note.part], { ...note, time: note.time - from });
    }
    return context.startRendering().then((buffer) => ({ offset: Math.round(from * RATE), samples: buffer.getChannelData(0) }));
  }));
  const dry = new AudioBuffer({ length: loopLength, sampleRate: RATE });
  const dryData = dry.getChannelData(0);
  for (const { offset, samples } of pieces) addLooped(dryData, samples, offset);

  const [reverbSeconds, reverbMix] = track.reverb;
  const context = new OfflineAudioContext(1, loopLength + Math.ceil((reverbSeconds + .5) * RATE), RATE);
  const mix = context.createGain();
  mix.connect(context.destination);
  const send = context.createGain();
  send.gain.value = reverbMix;
  const reverb = context.createConvolver();
  reverb.buffer = impulse(reverbSeconds, random);
  mix.connect(send).connect(reverb).connect(context.destination);
  const source = context.createBufferSource();
  source.buffer = dry;
  source.connect(mix);
  source.start(0);
  const voices = makeVoices(context, track, mix, 0, noise);
  for (const note of notes) if (isDrone(note)) voices[note.part].play(context, voices[note.part], note, loopSeconds);
  const rendered = (await context.startRendering()).getChannelData(0);
  const samples = new Float32Array(loopLength);
  addLooped(samples, rendered, 0);

  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    sumSquares += sample * sample;
    peak = Math.max(peak, Math.abs(sample));
  }
  if (peak === 0) return null;
  // Kept under full scale, so a sparse track brought up to RMS can't clip.
  const scale = Math.min(RMS / Math.sqrt(sumSquares / samples.length), .95 / peak);
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}

/**
 * Background music per room (ROOM_TRACKS in musicScores.js), synthesized in
 * the browser the first time each room is entered, then looped; crossfaded
 * on every room change. Same shape as the ambience (audio/ambience.js) and
 * on the same shared context, layered on top of it.
 *
 * Synthesized rather than recorded: no download, no credits to spend, and
 * nothing third-party to license. A render takes 1-2 seconds, off the main
 * thread, and its failure just leaves the room without music.
 *
 * @param {() => (AudioContext|null)} getContext - the game's shared context,
 *   or null until the first click/key unlocks audio
 * @returns {{ setRoom(key: string|null): void, prepare(key: string): void,
 *   setPaused(paused: boolean): void, setDucked(ducked: boolean): void,
 *   setVolume(volume: number): void }}
 */
export function createMusic(getContext) {
  let wantedRoom = null;
  let playing = null; // { track, loop, fade } (loop: see pausableLoop.js)
  let master = null;
  let volume = DEFAULT_MUSIC_VOLUME;
  let paused = false;
  let ducked = false;
  let request = 0;
  const buffers = new Map(); // track key -> Promise<AudioBuffer|null>, each rendered once

  // Paused, the music holds its place (see setPaused) rather than dipping.
  const level = () => volume * (ducked ? DUCKED_LEVEL : 1);

  // Needs no live context (rendering is offline, and an AudioBuffer can be
  // made without one), so prepare() can start before audio is unlocked.
  function load(track) {
    if (!buffers.has(track)) {
      buffers.set(track, render(track).then((samples) => {
        if (!samples) return null;
        const buffer = new AudioBuffer({ length: samples.length, sampleRate: RATE });
        buffer.copyToChannel(samples, 0);
        return buffer;
      }).catch((error) => {
        console.warn(`Could not synthesize the "${track}" music.`, error);
        return null;
      }));
    }
    return buffers.get(track);
  }

  function fadeOut(context) {
    if (!playing) return;
    const { loop, fade } = playing;
    playing = null;
    if (loop.held) { fade.disconnect(); return; }
    const { source } = loop;
    const now = context.currentTime;
    fade.gain.cancelScheduledValues(now);
    fade.gain.setValueAtTime(fade.gain.value, now);
    fade.gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS);
    source.onended = () => { source.disconnect(); fade.disconnect(); };
    source.stop(now + FADE_OUT_SECONDS);
  }

  async function setRoom(key) {
    wantedRoom = key ?? null;
    const wanted = ROOM_TRACKS[wantedRoom] ?? null;
    const context = getContext();
    // Two rooms sharing a track carry straight on rather than restarting it.
    if (!context || playing?.track === wanted) return;
    const mine = ++request;
    fadeOut(context);
    if (!wanted) return;
    const buffer = await load(wanted);
    // Another room was picked (or home) while this one rendered.
    if (!buffer || mine !== request) return;

    if (!master) {
      master = context.createGain();
      master.gain.value = level();
      master.connect(context.destination);
    }
    const fade = context.createGain();
    const now = context.currentTime;
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + FADE_IN_SECONDS);
    fade.connect(master);
    // From the top: unlike the ambience, a tune dropped in mid-phrase
    // sounds like a mistake.
    const loop = startLoop(context, buffer, fade);
    playing = { track: wanted, loop, fade };
    if (paused) holdLoop(context, loop);
  }

  function applyLevel() {
    const context = getContext();
    if (!master || !context) return;
    master.gain.setTargetAtTime(level(), context.currentTime, .25);
  }

  // A room picked before audio was unlocked starts on the first gesture.
  // Deferred a tick so the opening audio's own unlock listener has created
  // the context first.
  const retry = () => setTimeout(() => { if (ROOM_TRACKS[wantedRoom] && !playing) setRoom(wantedRoom); });
  window.addEventListener('pointerdown', retry, { capture: true });
  window.addEventListener('keydown', retry, { capture: true });

  return {
    setRoom,
    /**
     * Starts rendering a room's track ahead of setRoom, e.g. when the room
     * starts loading, so it's ready by the time the loading screen clears.
     */
    prepare(key) {
      if (ROOM_TRACKS[key]) load(ROOM_TRACKS[key]);
    },
    /** Paused, the music stops where it is; unpaused, it carries on from there. */
    setPaused(value) {
      paused = value;
      const context = getContext();
      if (playing && context) (value ? holdLoop : resumeLoop)(context, playing.loop);
      applyLevel();
    },
    /** Called every frame, so it only touches the audio graph on a change. */
    setDucked(value) {
      if (value === ducked) return;
      ducked = value;
      applyLevel();
    },
    setVolume(value) {
      volume = Math.max(0, Math.min(1, value));
      applyLevel();
    },
  };
}

import * as THREE from 'three';

// Level 3's maze sounds, TEMPORARY procedural placeholders like the
// opening's creak and footsteps (pending recorded ones):
// - near the bowling ball, a soft hum, and now and then pins clattering
//   somewhere in the distance;
// - near the mug of hot chocolate, a café murmur, and cups clinking;
// - over Jax's glitch fragments, a radio crackle (crackle()).
// The keepsakes' sounds hang on the keepsakes, so they come from where they
// are, and stop for good once one's picked up.

const RATE = 22050;
const HEAR_FROM = 11;            // metres: within this the loops play
const ONE_SHOT_GAP = [2.5, 6];   // seconds between clatters / clinks
const ONE_SHOT_RANGE = 9;        // metres

function makeBuffers(context) {
  let seed = 911;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const make = (seconds, sample) => {
    const buffer = context.createBuffer(1, Math.ceil(RATE * seconds), RATE), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = sample(i / RATE, i, data);
    return buffer;
  };
  // Whole cycles in its 2 s, so it loops without a click.
  const hum = make(2, t => 0.11 * Math.sin(2 * Math.PI * 98 * t) + 0.05 * Math.sin(2 * Math.PI * 147 * t)
    + 0.02 * Math.sin(2 * Math.PI * 196 * t) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.5 * t)));
  // Pins going down: a scatter of hollow wooden knocks.
  const knocks = Array.from({ length: 9 }, (_, i) => ({ at: 0.03 + i * 0.055 + Math.abs(noise()) * 0.05, pitch: 700 + Math.abs(noise()) * 900 }));
  const pins = make(1, t => {
    let sum = 0;
    for (const { at, pitch } of knocks) {
      const dt = t - at;
      if (dt < 0 || dt > 0.25) continue;
      sum += Math.exp(-dt * 38) * (0.5 * Math.sin(2 * Math.PI * pitch * dt) + 0.25 * noise());
    }
    return 0.4 * sum;
  });
  // A room of people talking, low: noise smoothed to a voice-ish band,
  // swelling in syllables. Its ends are faded together so it loops.
  let low = 0, band = 0;
  const murmurSeconds = 4;
  const murmur = make(murmurSeconds, t => {
    low += 0.08 * (noise() - low);
    band += 0.35 * (low - band);
    const syllables = 0.55 + 0.25 * Math.sin(2 * Math.PI * 3.3 * t) * Math.sin(2 * Math.PI * 0.7 * t + 1)
      + 0.2 * Math.sin(2 * Math.PI * 4.7 * t + 2);
    return (low - band) * 0.9 * syllables;
  });
  // Its tail is faded into its head and then dropped, so the end runs on
  // into the start.
  const data = murmur.getChannelData(0), fade = Math.floor(RATE * 0.25);
  for (let i = 0; i < fade; i++) {
    const k = i / fade, end = data.length - fade + i;
    data[i] = data[i] * k + data[end] * (1 - k);
  }
  const looped = context.createBuffer(1, data.length - fade, RATE);
  looped.getChannelData(0).set(data.subarray(0, data.length - fade));
  // A spoon against a cup.
  const clink = make(0.6, t => Math.min(1, t / 0.002) * Math.exp(-t * 11)
    * (0.12 * Math.sin(2 * Math.PI * 2350 * t) + 0.07 * Math.sin(2 * Math.PI * 3720 * t) + 0.03 * Math.sin(2 * Math.PI * 5130 * t)));
  // Jax's line crackling through: static with pops, swelling and dropping out.
  const crackle = make(2.8, t => {
    const swell = Math.sin(Math.PI * t / 2.8) * (0.55 + 0.45 * Math.sin(2 * Math.PI * 1.7 * t));
    const pop = Math.abs(noise()) > 0.985 ? noise() * 0.9 : 0;
    return swell * (0.07 * noise() + pop * 0.35);
  });
  return { hum, pins, murmur: looped, clink, crackle };
}

/**
 * @param {THREE.AudioListener} listener
 * @param {Array<{ id: string, object: THREE.Object3D }>} keepsakes the placed
 *   bowling ball ('bowling-ball') and mug ('hot-chocolate-mug'), still to find
 * @returns {{ update(deltaSeconds: number, playerPosition: THREE.Vector3): void,
 *   crackle(): void, dispose(): void }}
 */
export function createMazeSounds(listener, keepsakes) {
  const buffers = makeBuffers(listener.context);
  const between = ([a, b]) => a + Math.random() * (b - a);
  const positional = (buffer, volume, loop) => {
    const sound = new THREE.PositionalAudio(listener).setBuffer(buffer).setVolume(volume).setLoop(loop);
    sound.setDistanceModel('linear');
    sound.setRefDistance(1);
    sound.setMaxDistance(HEAR_FROM);
    return sound;
  };
  const voices = keepsakes.filter(({ object }) => object).map(({ id, object }) => {
    const ball = id === 'bowling-ball';
    const loop = positional(ball ? buffers.hum : buffers.murmur, ball ? 0.5 : 0.7, true);
    const accent = positional(ball ? buffers.pins : buffers.clink, ball ? 0.55 : 0.6, false);
    loop.name = `MazeKeepsake${ball ? 'Hum' : 'Murmur'}`;
    accent.name = `MazeKeepsake${ball ? 'Pins' : 'Clink'}`;
    loop.position.y = accent.position.y = 0.4;
    object.add(loop, accent);
    return { object, loop, accent, wait: between(ONE_SHOT_GAP) };
  });
  const crackleSound = new THREE.Audio(listener).setBuffer(buffers.crackle).setVolume(0.5);
  const at = new THREE.Vector3();
  const stop = sound => { if (sound.isPlaying) sound.stop(); };
  let disposed = false;

  return {
    update(deltaSeconds, playerPosition) {
      if (disposed || !playerPosition || listener.context.state !== 'running') return;
      for (const voice of voices) {
        if (!voice.object.parent) { stop(voice.loop); stop(voice.accent); continue; } // picked up
        voice.object.getWorldPosition(at);
        const apart = Math.hypot(at.x - playerPosition.x, at.z - playerPosition.z);
        if (apart < HEAR_FROM && !voice.loop.isPlaying) voice.loop.play();
        else if (apart >= HEAR_FROM + 1) stop(voice.loop);
        if (apart < ONE_SHOT_RANGE && (voice.wait -= deltaSeconds) <= 0) {
          voice.wait = between(ONE_SHOT_GAP);
          stop(voice.accent);
          voice.accent.play();
        }
      }
    },
    crackle() {
      if (disposed || listener.context.state !== 'running') return;
      stop(crackleSound);
      crackleSound.play();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const { loop, accent } of voices) for (const sound of [loop, accent]) {
        stop(sound);
        sound.removeFromParent();
      }
      stop(crackleSound);
    },
  };
}

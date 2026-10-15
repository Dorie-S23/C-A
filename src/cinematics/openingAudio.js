import * as THREE from 'three';
import { OPENING_SLEEP_SECONDS } from './pomniOpening.js';

// TEMPORARY synthesized cues: there are no snoring/knocking audio assets in
// public/. Replace these two buffers with approved recordings when supplied.
// No speech synthesis, external sounds or real-time cloth/audio dependencies.
export const KNOCK_TIMES = Object.freeze([5, 5.22, 5.44]);
export function makeOpeningBuffers(context) {
  const rate = 22050;
  let seed = 9137;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const snore = context.createBuffer(1, rate * 2.4, rate), s = snore.getChannelData(0);
  let low = 0, phase = 0;
  for (let i = 0; i < s.length; i++) {
    const t = i / rate, p = t / 2.4;
    const breath = p < .68 ? Math.sin(Math.PI * p / .68) ** 2 : 0;
    low = low * .88 + noise() * .12;
    phase += 2 * Math.PI * (88 - 22 * p) / rate;
    s[i] = breath * (.22 * low + .045 * Math.sin(phase) * (1 + .25 * Math.sin(2 * Math.PI * 19 * t)));
  }
  const knock = context.createBuffer(1, Math.ceil(rate * .16), rate), k = knock.getChannelData(0);
  for (let i = 0; i < k.length; i++) {
    const t = i / rate, attack = Math.min(1, t / .002);
    k[i] = attack * (.45 * Math.sin(2 * Math.PI * 175 * t) * Math.exp(-t * 48)
      + .16 * Math.sin(2 * Math.PI * 410 * t) * Math.exp(-t * 70) + .12 * noise() * Math.exp(-t * 110));
  }
  return { snore, knock };
}

// TEMPORARY procedural placeholders, pending approved door/footstep recordings.
export const ENTRANCE_CUES = Object.freeze([
  { at: .65, kind: 'creak' }, { at: 2.05, kind: 'step' },
  { at: 2.43, kind: 'step' }, { at: 2.81, kind: 'step' },
]);
export function makeEntranceBuffers(context) {
  const rate = 22050;
  let seed = 73;
  const noise = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const make = (seconds, sample) => {
    const b = context.createBuffer(1, Math.ceil(rate * seconds), rate), data = b.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = sample(i / rate);
    return b;
  };
  const creak = make(1.1, t => {
    const envelope = Math.sin(Math.PI * t / 1.1) ** 2;
    return envelope * (.055 * Math.sin(2 * Math.PI * (145 * t + 26 * t * t) + .6 * Math.sin(t * 35)) + .012 * noise());
  });
  const step = make(.18, t => Math.min(1, t / .008) * Math.exp(-t * 30)
    * (.2 * Math.sin(2 * Math.PI * 95 * t) + .08 * noise()));
  return { creak, step };
}

export function createEntranceAudioSession(listener, room, buffers = makeEntranceBuffers(listener.context), { manual = false } = {}) {
  const door = room.getObjectByName('Door_Frame024');
  if (!door) return null;
  const position = new THREE.Box3().setFromObject(door).getCenter(new THREE.Vector3());
  const group = new THREE.Group(); group.name = 'TemporaryEntranceAudio'; room.add(group);
  const cues = manual ? [{ kind: 'creak' }, { kind: 'step' }] : ENTRANCE_CUES;
  const sounds = cues.map((cue, i) => {
    const sound = new THREE.PositionalAudio(listener).setBuffer(buffers[cue.kind]).setVolume(.45).setRefDistance(3);
    sound.name = `TemporaryEntrance${cue.kind}${i}`;
    sound.position.copy(group.worldToLocal(position.clone()));
    if (cue.kind === 'step') sound.position.y = .1;
    group.add(sound); return sound;
  });
  let elapsed = 0, disposed = false, paused = false;
  const occurred = new Set(), armed = new Set();
  function stop() {
    sounds.forEach((sound, i) => {
      if (armed.has(i) && sound._startedAt <= listener.context.currentTime) occurred.add(i);
      if (sound.isPlaying) sound.stop();
      if (sound._connected) sound.disconnect();
    });
    armed.clear();
  }
  function schedule(time) {
    elapsed = time;
    if (disposed || listener.context.state !== 'running') return;
    if (manual) return; // movement/door events own these cues, never a second timeline
    ENTRANCE_CUES.forEach((cue, i) => {
      if (cue.at >= time && !occurred.has(i)) { sounds[i].play(cue.at - time); armed.add(i); }
    });
  }
  const onState = () => {
    if (!disposed && !paused && listener.context.state === 'running') { stop(); schedule(elapsed); }
  };
  listener.context.addEventListener('statechange', onState);
  return {
    cue(kind, worldPosition) {
      if (!manual || disposed || paused || listener.context.state !== 'running') return;
      const sound = sounds[cues.findIndex(cue => cue.kind === kind)];
      if (!sound) return;
      if (sound.isPlaying) sound.stop();
      sound.position.copy(group.worldToLocal(worldPosition.clone()));
      if (kind === 'step') sound.position.y += .05;
      sound.play();
    },
    start: schedule, update(time) { elapsed = time; },
    pause() { paused = true; stop(); },
    resume(time) { if (disposed) return; paused = false; stop(); schedule(time); },
    dispose() {
      if (disposed) return;
      disposed = true; stop();
      listener.context.removeEventListener('statechange', onState);
      sounds.forEach(sound => { sound.panner.disconnect(); sound.gain.disconnect(); });
      group.removeFromParent();
    },
  };
}

/** A persistent listener; short-lived, room-owned sources stop on every exit. */
export function createOpeningAudio(camera) {
  let listener = null, buffers = null;
  function unlock() {
    try {
      if (!listener) {
        listener = new THREE.AudioListener(); camera.add(listener);
        buffers = makeOpeningBuffers(listener.context);
      }
      return listener.context.resume().catch(() => {});
    } catch { return Promise.resolve(); } // silent fallback never blocks gameplay
  }
  // PLAY reports its action after the title fly-in; unlock on the earlier
  // physical gesture, not an asynchronous asset-load or animation callback.
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
  return {
    unlock,
    get state() { return listener?.context.state ?? 'not-created'; },
    get currentTime() { return listener?.context.currentTime ?? null; },
    createEntranceSession(room, options) {
      return listener ? createEntranceAudioSession(listener, room, undefined, options) : null;
    },
    createSession(room) {
      if (!listener) return null;
      const door = room.getObjectByProperty('name', 'Plane_1');
      if (!door) return null;
      room.updateMatrixWorld(true);
      const doorPosition = new THREE.Box3().setFromObject(door).getCenter(new THREE.Vector3());
      const group = new THREE.Group(); group.name = 'TemporaryOpeningAudio'; room.add(group);
      const snore = new THREE.PositionalAudio(listener).setBuffer(buffers.snore).setLoop(true).setVolume(.45).setRefDistance(3);
      snore.name = 'TemporarySnore';
      snore.position.set(-2.2, 1.1, -.9); group.add(snore);
      const knocks = KNOCK_TIMES.map((_, i) => {
        const audio = new THREE.PositionalAudio(listener).setBuffer(buffers.knock).setVolume(.55).setRefDistance(4);
        audio.name = `TemporaryDoorKnock${i + 1}`;
        audio.position.copy(group.worldToLocal(doorPosition.clone())); group.add(audio); return audio;
      });
      let elapsed = 0, disposed = false, paused = false;
      const occurred = new Set(), armed = new Set();
      const stop = () => {
        knocks.forEach((sound, i) => {
          if (armed.has(i) && sound._startedAt <= listener.context.currentTime) occurred.add(i);
        });
        for (const sound of [snore, ...knocks]) {
          if (sound.isPlaying) sound.stop();
          if (sound._connected) sound.disconnect();
        }
        armed.clear();
      };
      function schedule(time) {
        if (disposed) return;
        elapsed = time;
        if (listener.context.state !== 'running') return;
        if (time < OPENING_SLEEP_SECONDS) {
          snore.offset = time % buffers.snore.duration;
          const now = listener.context.currentTime, remaining = OPENING_SLEEP_SECONDS - time;
          snore.gain.gain.cancelScheduledValues(now);
          snore.gain.gain.setValueAtTime(.45, now);
          snore.gain.gain.setValueAtTime(.45, now + Math.max(0, remaining - .03));
          snore.gain.gain.linearRampToValueAtTime(0, now + remaining);
          snore.play();
          // End the snore at exactly the first knock, even between RAFs.
          snore.source.stop(listener.context.currentTime + OPENING_SLEEP_SECONDS - time);
        }
        KNOCK_TIMES.forEach((at, i) => {
          if (at >= time && !occurred.has(i)) { knocks[i].play(at - time); armed.add(i); }
        });
      }
      const onContextState = () => {
        if (!disposed && !paused && listener.context.state === 'running') { stop(); schedule(elapsed); }
      };
      listener.context.addEventListener('statechange', onContextState);
      return {
        start: schedule,
        update(time) { elapsed = time; },
        pause() { paused = true; stop(); },
        resume(time = elapsed) { paused = false; stop(); schedule(time); },
        dispose() {
          if (disposed) return;
          disposed = true; stop();
          listener.context.removeEventListener('statechange', onContextState);
          for (const sound of [snore, ...knocks]) { sound.panner.disconnect(); sound.gain.disconnect(); }
          group.removeFromParent();
        },
      };
    },
  };
}

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { restylePomni } from '../characters/pomni.js';

export const OPENING_URL = './models/cinematics/pomni-sleep-wake-r5.glb';
export const OPENING_DURATION = 7.5;
export const OPENING_HANDOFF = Object.freeze({
  x: -1.0500005828829344, y: 0.006783101291564675, z: -0.5300000095389795,
  yaw: Math.PI / 2, idleTime: 0.1,
});
const WAKING_TIME = 42 / 30;
// Frozen R5 authoring marker "Sitting": frame 119 at 30 fps, frame 1 = t=0.
export const OPENING_SEATED_TIME = 118 / 30;
const STANDING_TIME = 190 / 30;
// Original authoring markers: Sleeping 1, Stirring 43, Head lift 66,
// Standing 191. Export maps frame 1 to t=0; keep all waking motion at 1x.
export const OPENING_SLEEP_SECONDS = 5;
// Three knocks at 5, 5.22, 5.44 seconds; the last 0.16 s buffer ends at 5.6.
export const OPENING_WAKE_SECONDS = OPENING_SLEEP_SECONDS + .6;
export const OPENING_PLAYBACK_SECONDS = OPENING_WAKE_SECONDS + OPENING_DURATION - WAKING_TIME;
export function openingClipTime(elapsed) {
  if (elapsed >= OPENING_PLAYBACK_SECONDS) return OPENING_DURATION;
  if (elapsed >= OPENING_WAKE_SECONDS) return Math.min(OPENING_DURATION, WAKING_TIME + elapsed - OPENING_WAKE_SECONDS);
  if (elapsed >= OPENING_SLEEP_SECONDS) return WAKING_TIME;
  // Three smoothly reversing passes over ONLY the existing sleep samples.
  // Body breathing, eye state and blanket morphs use the same source time.
  const u = THREE.MathUtils.clamp(elapsed / OPENING_SLEEP_SECONDS, 0, 1);
  return WAKING_TIME * (1 - Math.cos(3 * Math.PI * u)) / 2;
}
const CAMERA_BLEND_TIME = 1.25;
// Room-space shots: the bed is at X [-3.03,-1.51], Z [-2.05,.48].
// The runtime resolves every shot against the room's actual collision meshes.
const SHOTS = [
  [0, [0.5, 1.9, 2.5], [-2.15, 1.13, -0.85]],
  [2.6, [0.35, 1.85, 2.15], [-2.0, 1.2, -0.7]],
  [4.5, [0.7, 1.9, 2.0], [-1.9, 1.25, -0.7]],
  [6.4, [1.0, 1.85, 1.4], [-1.1, 1.05, -0.53]],
  [7.5, [1.15, 1.8, 1.3], [-1.05, 1.1, -0.53]],
];

export function sampleOpeningShot(time) {
  const i = Math.max(0, SHOTS.findIndex((shot) => shot[0] >= time) - 1);
  const a = time >= OPENING_DURATION ? SHOTS.at(-1) : SHOTS[i];
  const b = SHOTS[Math.min(SHOTS.indexOf(a) + 1, SHOTS.length - 1)];
  const t = a === b ? 1 : THREE.MathUtils.smootherstep(time, a[0], b[0]);
  return {
    position: new THREE.Vector3().fromArray(a[1]).lerp(new THREE.Vector3().fromArray(b[1]), t),
    target: new THREE.Vector3().fromArray(a[2]).lerp(new THREE.Vector3().fromArray(b[2]), t),
  };
}

function release(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    geometries.add(o.geometry);
    if (o.skeleton) skeletons.add(o.skeleton);
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    }
  });
  skeletons.forEach((s) => s.dispose());
  geometries.forEach((g) => { g.disposeBoundsTree?.(); g.dispose(); });
  textures.forEach((t) => { t.dispose(); t.source?.data?.close?.(); });
  materials.forEach((m) => m.dispose());
  root.removeFromParent();
}

/** Each room load owns its GLB, mixer, GPU resources and retained blanket. */
export async function loadPomniOpening(room, { settled = false, onProgress } = {}) {
  const start = performance.now();
  const gltf = await new GLTFLoader().loadAsync(OPENING_URL, onProgress);
  const root = gltf.scene;
  try {
    // Same model and rig as the game's Pomni: give her the same look (and
    // neck) before anything plays, so waking up matches who you then play.
    const actor = root.getObjectByName('PomniPlacement_GameScale');
    if (actor) restylePomni(actor, gltf.animations);
    const controller = createPomniOpening({ root, animations: gltf.animations, room });
    controller.loadMilliseconds = performance.now() - start;
    if (settled) controller.settle();
    return controller;
  } catch (error) {
    release(root);
    throw error;
  }
}

export function createPomniOpening({ root, animations, room }) {
  const clip = animations.find((c) => c.name === 'Pomni_SleepWake_R5');
  const actor = root.getObjectByName('PomniPlacement_GameScale');
  const blanket = root.getObjectByName('R4_Continuous_Blanket');
  let originalCover;
  room.group.traverse((o) => { if (o.isMesh && o.userData.name === 'Plane.003') originalCover = o; });
  if (!clip || Math.abs(clip.duration - OPENING_DURATION) > 1e-5 || !actor || !originalCover
    || blanket?.morphTargetInfluences?.length !== 149) throw new Error('R5 opening asset or bedroom cover is incompatible');
  root.name = 'PomniOpeningR5';
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // Animated skin and morph bounds must not be culled using the rest pose.
    o.frustumCulled = false;
  });
  originalCover.visible = false;
  room.collisionMeshes = room.collisionMeshes.filter(({ mesh }) => mesh !== originalCover);
  room.group.add(root);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(0);
  let phase = 'loaded', time = 0, elapsed = 0, blendTime = 0, callbacks = {}, audio = null;
  let paused = false, seatedReached = false, coordinated = false;
  let startPosition = null, startTarget = null;
  const snapshotWeights = () => Array.from(blanket.morphTargetInfluences);
  function freeze() {
    // stop/uncache restores original weights; explicitly retain the final pose.
    const weights = snapshotWeights();
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    blanket.morphTargetInfluences.splice(0, weights.length, ...weights);
    release(actor);
  }
  function handoff(camera) {
    if (!['playing', 'seated'].includes(phase)) return;
    startTarget = sampleOpeningShot(cameraTime()).target;
    time = OPENING_DURATION;
    elapsed = OPENING_PLAYBACK_SECONDS;
    audio?.dispose(); audio = null;
    // LoopOnce pauses at its endpoint. setTime() rewinds action-local time,
    // so enable sampling explicitly even if this frame already hit the end.
    action.paused = false;
    mixer.setTime(time);
    freeze();
    room.lighting.reset();
    phase = 'blending';
    blendTime = 0;
    startPosition = camera.position.clone();
    callbacks.onHandoff?.();
    if (coordinated) { phase = 'done'; callbacks.onComplete?.(); }
  }
  const controller = {
    get phase() { return phase; }, get time() { return time; },
    get elapsed() { return elapsed; },
    get active() { return ['playing', 'seated', 'blending'].includes(phase); },
    get coordinated() { return coordinated; },
    get skippable() { return ['playing', 'seated'].includes(phase); },
    get blanket() { return blanket; },
    loadMilliseconds: 0,
    setAudio(session) { audio?.dispose(); audio = session; if (phase === 'playing') audio.start(elapsed); },
    setPaused(value) { paused = value; if (value) audio?.pause(); else if (phase === 'playing') audio?.resume(elapsed); },
    start({ camera, resolveCamera, onHandoff, onComplete, onSeated }) {
      if (phase !== 'loaded') throw new Error('Opening can only start once');
      callbacks = { camera, resolveCamera, onHandoff, onComplete, onSeated };
      room.lighting.setState('SLEEPING', { duration: 0 });
      phase = 'playing';
      controller.update(0);
    },
    settle() {
      if (phase !== 'loaded') return;
      mixer.setTime(OPENING_DURATION);
      freeze(); time = OPENING_DURATION; elapsed = OPENING_PLAYBACK_SECONDS; phase = 'done'; room.lighting.reset();
    },
    skip() {
      if (!paused && ['playing', 'seated'].includes(phase)) handoff(callbacks.camera);
    },
    resumeForEntrance() {
      if (phase !== 'seated' || paused) return;
      // Ragatha now owns the camera; this mixer still owns both skin and blanket.
      coordinated = true; phase = 'playing'; audio?.resume(elapsed);
    },
    update(dt, follow) {
      if (!controller.active || paused || phase === 'seated') return;
      const { camera, resolveCamera } = callbacks;
      if (phase === 'playing') {
        const seatBoundary = OPENING_WAKE_SECONDS + OPENING_SEATED_TIME - WAKING_TIME;
        const hold = callbacks.onSeated && !seatedReached;
        const end = Math.min(hold ? seatBoundary : OPENING_PLAYBACK_SECONDS, elapsed + Math.max(0, dt));
        // Advance lights in segments so threshold timing is independent of FPS.
        for (const [boundary, state] of [[OPENING_WAKE_SECONDS, 'WAKING'],
          [OPENING_WAKE_SECONDS + STANDING_TIME - WAKING_TIME, 'GAMEPLAY']]) {
          if (elapsed < boundary && end >= boundary) {
            room.lighting.update(boundary - elapsed); elapsed = boundary;
            room.lighting.setState(state, { duration: state === 'WAKING' ? 2 : OPENING_DURATION - STANDING_TIME });
          }
        }
        room.lighting.update(end - elapsed); elapsed = end;
        time = openingClipTime(elapsed);
        audio?.update(elapsed);
        mixer.setTime(time);
        if (!coordinated) {
          const shot = sampleOpeningShot(cameraTime());
          camera.position.copy(resolveCamera(shot.target, shot.position));
          camera.lookAt(shot.target);
        }
        if (hold && elapsed >= seatBoundary) {
          seatedReached = true; phase = 'seated'; audio?.pause(); callbacks.onSeated();
          return;
        }
        if (elapsed >= OPENING_PLAYBACK_SECONDS) handoff(camera);
        return;
      }
      if (!follow) return;
      blendTime = Math.min(CAMERA_BLEND_TIME, blendTime + Math.max(0, dt));
      const t = THREE.MathUtils.smootherstep(blendTime, 0, CAMERA_BLEND_TIME);
      const target = startTarget.clone().lerp(follow.target, t);
      const a = new THREE.Spherical().setFromVector3(startPosition.clone().sub(startTarget));
      const b = new THREE.Spherical().setFromVector3(follow.position.clone().sub(follow.target));
      const turn = THREE.MathUtils.euclideanModulo(b.theta - a.theta + Math.PI, Math.PI * 2) - Math.PI;
      const orbit = new THREE.Spherical(THREE.MathUtils.lerp(a.radius, b.radius, t),
        THREE.MathUtils.lerp(a.phi, b.phi, t), a.theta + turn * t);
      const desired = new THREE.Vector3().setFromSpherical(orbit).add(target);
      camera.position.copy(resolveCamera(target, desired)); camera.lookAt(target);
      if (blendTime >= CAMERA_BLEND_TIME) { phase = 'done'; callbacks.onComplete?.(); }
    },
    dispose() {
      if (phase === 'disposed') return;
      phase = 'disposed'; callbacks = {};
      audio?.dispose(); audio = null;
      mixer.stopAllAction(); mixer.uncacheRoot(root); release(root);
    },
  };
  function cameraTime() {
    return elapsed < OPENING_SLEEP_SECONDS ? WAKING_TIME * elapsed / OPENING_SLEEP_SECONDS : time;
  }
  return controller;
}

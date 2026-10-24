import * as THREE from 'three';
import { loadHallwayBackdrop } from './hallwayBackdrop.js';
import { loadKaufmoRunExtra } from '../characters/kaufmoRunExtra.js';

// Level 2's opening beat — "Hallway outside Ribbit's room. Kaufmo hurries
// past, mumbling" — plays the same way Pre-Level 1's Jax moment does: cut
// the render target to a shot of a backdrop hallway while he runs through
// it, rather than anything happening in the real Dorm Hall Pomni's
// actually standing in. A from-scratch "live in the real scene" version
// was tried and reverted: it ran him straight through Pomni's own
// position, and picking "which way down the real hall is clear" was fragile
// (it could end up sending him toward a doorway curtain instead of
// anywhere resembling his own room). This fake backdrop sidesteps both —
// it's a simple, fixed, self-contained shot, same as Jax's.
//
// Unlike Jax's cutscene, the dialogue box stays up the whole time (his
// mumbled line is the point, not a silent beat) — see main.js's
// playKaufmoHallway, which starts this alongside the mumble line rather
// than hiding the dialogue box and waiting for it to finish first.

// A different stretch of hallway from Jax's shot (see jaxHallwayCutscene.js)
// so the two don't look like a re-run of the same clip if a player happens
// to see both in one sitting.
const SPAWN_AT = { x: 0, z: -11 };

// He used to stop (and pop out of existence) at -16 — right in the middle
// of frame, close enough that playPassBy's instant visibility flip read
// as a glitch rather than him leaving. Running him on to -22 instead means
// he's already small and distant by the time that happens, so the cut
// reads as "gone round the corner", not "disappeared".
const RUN_FROM = new THREE.Vector3(-0.5, 0, -7);
const RUN_TO = new THREE.Vector3(-0.5, 0, -22);
const RUN_DURATION = 2.8;

const CAMERA_POSITION = new THREE.Vector3(-1.9, 1.6, -6.2);
const CAMERA_LOOK_AT = new THREE.Vector3(-0.7, 1.3, -19); // about his chest, as he runs off

const HOLD_AFTER = 0.35;

/**
 * Loads the hall + Kaufmo once, ahead of time, so the actual cutscene
 * never has to wait on a network fetch once it's triggered.
 *
 * @returns {Promise<{ scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *   kaufmoApi: Awaited<ReturnType<typeof loadKaufmoRunExtra>> }>}
 */
export function preloadKaufmoHallwayCutscene() {
  return Promise.all([
    loadHallwayBackdrop(SPAWN_AT),
    loadKaufmoRunExtra(),
  ]).then(([hall, kaufmoApi]) => {
    const scene = new THREE.Scene();
    scene.add(hall.group);
    scene.add(kaufmoApi.kaufmo);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.copy(CAMERA_POSITION);
    camera.lookAt(CAMERA_LOOK_AT);

    return { scene, camera, kaufmoApi };
  });
}

/**
 * Starts the run and returns a per-frame driver — see
 * playJaxHallwayCutscene in jaxHallwayCutscene.js for the exact contract
 * (same shape, driven the same way from main.js's render loop).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, kaufmoApi: object }} assets
 *   from preloadKaufmoHallwayCutscene()
 * @returns {{ update: (deltaSeconds: number) => boolean }}
 */
export function playKaufmoHallwayCutscene(renderer, { scene, camera, kaufmoApi }) {
  kaufmoApi.playPassBy(RUN_FROM, RUN_TO, RUN_DURATION);
  let elapsed = 0;

  return {
    update(deltaSeconds) {
      elapsed += deltaSeconds;
      kaufmoApi.update(deltaSeconds);
      renderer.render(scene, camera);
      return elapsed >= RUN_DURATION + HOLD_AFTER;
    },
  };
}

import * as THREE from 'three';
import { loadHallwayBackdrop } from './hallwayBackdrop.js';
import { loadJax } from '../characters/jax.js';

// Level 2's payoff beat — Jax bolts past Kaufmo's open door while Pomni's
// still inside — plays the same cutaway-to-backdrop trick as his
// Pre-Level-1 pass-by and Kaufmo's hallway hurry (see jaxHallwayCutscene.js
// and kaufmoHallwayCutscene.js for the shared technique and why it's a
// fake backdrop rather than anything happening in the real Dorm Hall).
//
// A third stretch of the same hall, distinct from both existing shots, so
// a player who's seen all three in one sitting doesn't get the same clip
// three times over.
const SPAWN_AT = { x: 0, z: -15 };

// Same travel-distance-to-camera-distance ratio as Kaufmo's hallway
// cutscene (see kaufmoHallwayCutscene.js's own comment on this): he needs
// to already be small and distant by the time playPassBy's update() flips
// him invisible at t>=1, or the cut reads as a pop, not "gone round the
// corner". An earlier version of this shot ran him only ~7.5m while the
// camera sat ~8m from his endpoint — half Kaufmo's margin — which is
// exactly that pop.
const RUN_FROM = new THREE.Vector3(1.1, 0, -9);
const RUN_TO = new THREE.Vector3(1.1, 0, -24);
const RUN_DURATION = 2.8;

const CAMERA_POSITION = new THREE.Vector3(2.6, 1.5, -8.2);
const CAMERA_LOOK_AT = new THREE.Vector3(0.9, 1.0, -21);

const HOLD_AFTER = 0.35;

/**
 * Loads the hall + Jax once, ahead of time, so the actual cutscene never
 * has to wait on a network fetch once it's triggered.
 *
 * @returns {Promise<{ scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *   jaxApi: Awaited<ReturnType<typeof loadJax>> }>}
 */
export function preloadJaxFleeCutscene() {
  return Promise.all([
    loadHallwayBackdrop(SPAWN_AT),
    loadJax(),
  ]).then(([hall, jaxApi]) => {
    const scene = new THREE.Scene();
    scene.add(hall.group);
    scene.add(jaxApi.jax);

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.copy(CAMERA_POSITION);
    camera.lookAt(CAMERA_LOOK_AT);

    return { scene, camera, jaxApi };
  });
}

/**
 * Starts the run and returns a per-frame driver — see
 * playJaxHallwayCutscene in jaxHallwayCutscene.js for the exact contract
 * (same shape, driven the same way from main.js's render loop).
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, jaxApi: object }} assets
 *   from preloadJaxFleeCutscene()
 * @returns {{ update: (deltaSeconds: number) => boolean }}
 */
export function playJaxFleeCutscene(renderer, { scene, camera, jaxApi }) {
  jaxApi.playPassBy(RUN_FROM, RUN_TO, RUN_DURATION);
  let elapsed = 0;

  return {
    update(deltaSeconds) {
      elapsed += deltaSeconds;
      jaxApi.update(deltaSeconds);
      renderer.render(scene, camera);
      return elapsed >= RUN_DURATION + HOLD_AFTER;
    },
  };
}

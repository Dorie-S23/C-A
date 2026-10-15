import * as THREE from 'three';
import { loadRoomModel } from '../rooms/loadRoomModel.js';
import { loadJax } from '../characters/jax.js';

// Pre-Level 1's "Jax storms past" plays as an actual cutscene: cut away
// from Pomni's Room entirely to a shot of him running down the real Dorm
// Hall, then cut back. That needs its own THREE.Scene + camera (the main
// scene can only hold one room at a time), but no portals/doors/collision
// — this is a backdrop nobody walks through, so it's built straight from
// loadRoomModel rather than loadDormHallRoom's full interactive setup.
// loadRoomModel already attaches a self-contained lighting rig to the
// group (see createRoomLighting in loadRoomModel.js), so the cutscene
// scene needs no lighting of its own.
const DORM_HALL_URL = './models/world/dorm-hall-v7.glb';

// A clear stretch of the main hallway, away from any of its doors — he's
// just running past in the background, not through a doorway. Spawning
// the lighting rig here (not at the hall's own entrance) puts its pendant
// light where the action actually happens.
const SPAWN_AT = { x: 0, z: -8 };

// Run lengthwise down the hall (toward -Z, same direction it extends,
// per the Dorm Hall's own spawn-facing convention), roughly down its
// centre line, past where the camera's parked — a classic "runs away
// down the corridor" shot rather than crossing side to side.
const RUN_FROM = new THREE.Vector3(0.4, 0, -4);
const RUN_TO = new THREE.Vector3(0.4, 0, -13.5);
const RUN_DURATION = 1.7; // seconds — a run, not a walk

// Off to the side and a little back from his path, low enough to feel
// like eye level rather than looking down on him, angled down the hall
// so he's seen receding into it rather than just crossing the frame.
const CAMERA_POSITION = new THREE.Vector3(1.9, 1.6, -3.2);
const CAMERA_LOOK_AT = new THREE.Vector3(0.6, 1.0, -11);

// How long to hold the shot after he's actually out of frame before
// cutting back — long enough to read as a beat, not a jump cut the
// instant he's gone.
const HOLD_AFTER = 0.35;

/**
 * Loads the hall + Jax once, ahead of time, so the actual cutscene (once
 * triggered) never has to wait on a network fetch. Call this alongside
 * whatever else a scene is already loading.
 *
 * @returns {Promise<{ scene: THREE.Scene, camera: THREE.PerspectiveCamera,
 *   jaxApi: Awaited<ReturnType<typeof loadJax>> }>}
 */
export function preloadJaxHallwayCutscene() {
  return Promise.all([
    loadRoomModel(DORM_HALL_URL, null, { spawnAt: SPAWN_AT }),
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
 * Starts the run and returns a per-frame driver: call update(deltaSeconds)
 * from the main render loop instead of the usual renderer.render(scene,
 * camera) while it's active — it does its own rendering into the same
 * renderer/canvas — until it returns true, meaning the shot is done and
 * the caller should cut back to whatever it was showing before.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {{ scene: THREE.Scene, camera: THREE.PerspectiveCamera, jaxApi: object }} assets
 *   from preloadJaxHallwayCutscene()
 * @returns {{ update: (deltaSeconds: number) => boolean }}
 */
export function playJaxHallwayCutscene(renderer, { scene, camera, jaxApi }) {
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

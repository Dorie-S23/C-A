import * as THREE from 'three';
import { loadKaufmoRunExtra } from '../characters/kaufmoRunExtra.js';
import { level2HallwayDialogue } from '../data/dialogues.js';

/**
 * Pre-Level 1's Jax moment plays as a cutaway to a separate backdrop copy
 * of the Dorm Hall (see jaxHallwayCutscene.js); this is the live-scene
 * version instead, same "stay in the real scene, reframe the camera, keep
 * the dialogue box up" technique caineApproachCutscene.js uses — Kaufmo
 * runs past Pomni for real, in the room she's actually standing in, with
 * his mumbled line showing live in the dialogue box while he's on screen,
 * not after a cutaway like the old approach left it.
 *
 * Only the pass-by: he runs past and keeps going, off toward his own room
 * (not shown), rather than stopping to pace nearby — an earlier version
 * had him settle into pacing right there in the hallway, which reads
 * badly in a space this size (he ran through Pomni's exact position, and
 * the pacing spot could land somewhere nonsensical, like right in a
 * doorway curtain). The real catch-up conversation (pacing, Choice 1,
 * Choice 2) happens afterward, once Pomni travels into his actual room —
 * see playKaufmoHallway in main.js, which runs this cutscene first, then
 * the travel and the rest of the dialogue.
 */
export function createKaufmoHallwayEncounter({
  scene, camera, player, pomni, renderer, dialogueUI,
  dispose = () => {},
  clearance = (origin, direction, maxDistance) => maxDistance,
  onComplete,
  onCancel,
}) {
  const RUN_SPEED = 4.6;        // a little brisker than the player's own walk — he's in a hurry
  const RUN_PAST_LEAD = 5;      // how far ahead of Pomni he's first visible, along the run direction
  const RUN_PAST_TRAIL = 4;     // how far past her he keeps going before the shot ends
  const RUN_SIDE_OFFSET = 1.4;  // clears Pomni's own position — the run line never actually crosses her
  const CAMERA_SIDE = 2.2;
  const CAMERA_BACK = 1.8;
  const CAMERA_HEIGHT = 0.5;
  const RUN_DURATION_FALLBACK = 1.8;
  const UP = new THREE.Vector3(0, 1, 0);

  function reachAlong(origin, direction, maxDistance) {
    const from = origin.clone();
    from.y -= 0.7;
    return clearance(from, direction, maxDistance);
  }

  /** Sweeps out from Pomni's facing for the clearest line to run Kaufmo along. */
  function clearestDirection(origin, facing) {
    const wanted = RUN_PAST_LEAD + RUN_PAST_TRAIL;
    let best = { forward: facing.clone(), reach: -1 };
    for (let i = 0; i < 12; i++) {
      const step = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const forward = facing.clone().applyAxisAngle(UP, step * Math.PI / 6);
      const reach = reachAlong(origin, forward, wanted + 5.0);
      if (reach >= wanted) return { forward, reach };
      if (reach > best.reach) best = { forward, reach };
    }
    return best;
  }

  /** A side-on camera spot with room for both of them in frame, wall-aware. */
  function cameraSpot(origin, forward) {
    const eye = origin.clone().add(new THREE.Vector3(0, CAMERA_HEIGHT, 0));
    let bestSpot = eye, bestRoom = -1;
    for (const sign of [1, -1]) {
      const offset = new THREE.Vector3().crossVectors(UP, forward).multiplyScalar(sign * CAMERA_SIDE)
        .addScaledVector(forward, -CAMERA_BACK);
      const length = offset.length();
      const direction = offset.clone().divideScalar(length);
      const room = clearance(eye, direction, length);
      if (room >= length - 1e-3) return eye.clone().add(offset);
      if (room > bestRoom) { bestRoom = room; bestSpot = eye.clone().addScaledVector(direction, room); }
    }
    return bestSpot;
  }

  let kaufmoApi = null;
  let disposed = false;
  let phase = 'loading'; // 'loading' | 'running' | 'done'
  let elapsed = 0;
  let runDuration = RUN_DURATION_FALLBACK;

  const camPos = new THREE.Vector3();
  const camLookAt = new THREE.Vector3();
  const initialCamPos = camera.position.clone();

  loadKaufmoRunExtra().then((api) => {
    if (disposed) { dispose(api.kaufmo); return; }
    kaufmoApi = api;
    scene.add(kaufmoApi.kaufmo);

    const pomniFacing = pomni ? pomni.rotation.y : 0;
    const facing = new THREE.Vector3(Math.sin(pomniFacing), 0, Math.cos(pomniFacing)).normalize();
    if (facing.lengthSq() < 1e-4) facing.set(0, 0, -1);
    const { forward } = clearestDirection(player.position, facing);
    const side = new THREE.Vector3().crossVectors(UP, forward);
    const feetY = player.position.y - 1.7; // PLAYER_HEIGHT

    // A line parallel to, not through, Pomni's own position — a straight
    // run from lead to trail along `forward` alone would pass exactly
    // through wherever she's standing.
    const lineCentre = player.position.clone().addScaledVector(side, RUN_SIDE_OFFSET);
    const runFrom = lineCentre.clone().addScaledVector(forward, RUN_PAST_LEAD);
    runFrom.y = feetY;
    const runTo = lineCentre.clone().addScaledVector(forward, -RUN_PAST_TRAIL);
    runTo.y = feetY;

    runDuration = Math.max(runFrom.distanceTo(runTo) / RUN_SPEED, 0.5);
    camPos.copy(cameraSpot(player.position, forward));
    camLookAt.copy(player.position).addScaledVector(forward, RUN_PAST_LEAD * 0.3).add(new THREE.Vector3(0, 0.2, 0));

    kaufmoApi.playPassBy(runFrom, runTo, runDuration);
    dialogueUI.play(level2HallwayDialogue, {
      startAt: 'kaufmoHurriesBy',
      onComplete: () => { cleanup(); phase = 'done'; onComplete?.(); },
      onCancel: () => { cleanup(); phase = 'done'; onCancel?.(); },
    });
    phase = 'running';
    elapsed = 0;
  }).catch((err) => {
    if (disposed) return;
    console.error('Failed to load Kaufmo for the hallway encounter', err);
    phase = 'done';
    onComplete?.();
  });

  function update(deltaSeconds) {
    if (phase === 'loading') { renderer.render(scene, camera); return false; }
    if (phase === 'done') { renderer.render(scene, camera); return true; }

    elapsed += deltaSeconds;
    kaufmoApi.update(deltaSeconds);

    const t = Math.min(1, elapsed / runDuration);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(initialCamPos, camPos, eased);
    camera.lookAt(camLookAt);
    renderer.render(scene, camera);
    return false;
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    kaufmoApi?.kaufmo.removeFromParent();
    if (kaufmoApi) dispose(kaufmoApi.kaufmo);
  }

  return { update, cleanup };
}

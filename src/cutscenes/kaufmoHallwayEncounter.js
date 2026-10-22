import * as THREE from 'three';
import { loadKaufmoRunExtra } from '../characters/kaufmoRunExtra.js';
import { level2HallwayDialogue, level2RoomOpeningDialogue } from '../data/dialogues.js';

/**
 * Level 2's opening, staged entirely in the real Dorm Hall — the same
 * "stay in the live scene, reframe the camera, keep the dialogue box up"
 * technique caineApproachCutscene.js uses, not a cutaway to a separate
 * backdrop copy of the hall (see jaxHallwayCutscene.js for that older
 * approach, still used for Jax's silent pass-by, which has no reason to
 * change).
 *
 * Kaufmo runs past (mumbling, live, dialogue box up the whole time — his
 * line is the point, not a silent beat), then settles into pacing a tight
 * circle a short way down the hall. The run is a fixed-duration animation
 * but the dialogue is player-paced (waits for a click per line), so the
 * two are deliberately decoupled: the camera eases from its start position
 * to the settled two-shot over the run's own duration regardless of how
 * far the player has gotten through the text, and Kaufmo hands off from
 * running to pacing in place the instant the run ends — never just
 * vanishing mid-sentence the way playPassBy alone would. The rest of the
 * conversation (level2RoomOpeningDialogue) plays once the player clicks
 * through the hallway script, with him still pacing throughout. He never
 * actually goes near his own room for this — that happens later,
 * off-screen, before the photo hand-in visits.
 */
export function createKaufmoHallwayEncounter({
  scene, camera, player, pomni, renderer, dialogueUI,
  dispose = () => {},
  clearance = (origin, direction, maxDistance) => maxDistance,
  onComplete,
  onCancel,
}) {
  const RUN_SPEED = 4.2;        // m/s — matches the player's own walk speed, reads as urgent without outrunning the eye
  const RUN_PAST_LEAD = 5;      // how far ahead of Pomni he's first visible, along the run direction
  const RUN_PAST_TRAIL = 3;     // how far past her he keeps running before peeling off to pace
  const PACE_SIDE = 1.6;        // off to the side of his run line, so he isn't pacing on top of where he just ran
  const CAMERA_SIDE = 2.0;
  const CAMERA_BACK = 1.6;
  const CAMERA_HEIGHT = 0.4;
  const RUN_DURATION_FALLBACK = 1.8;
  const UP = new THREE.Vector3(0, 1, 0);

  function reachAlong(origin, direction, maxDistance) {
    const from = origin.clone();
    from.y -= 0.7;
    return clearance(from, direction, maxDistance);
  }

  /** Sweeps out from Pomni's facing for the clearest line to run Kaufmo along. */
  function clearestDirection(origin, facing) {
    const wanted = RUN_PAST_LEAD + RUN_PAST_TRAIL + PACE_SIDE;
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
  let settled = false; // whether the run->pace handoff has happened yet
  let elapsed = 0;
  let runDuration = RUN_DURATION_FALLBACK;

  const paceCenter = new THREE.Vector3();
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
    const feetY = player.position.y - 1.7; // PLAYER_HEIGHT

    const runFrom = player.position.clone().addScaledVector(forward, RUN_PAST_LEAD);
    runFrom.y = feetY;
    const runTo = player.position.clone().addScaledVector(forward, -RUN_PAST_TRAIL);
    runTo.y = feetY;
    const side = new THREE.Vector3().crossVectors(UP, forward);
    paceCenter.copy(runTo).addScaledVector(side, PACE_SIDE);
    paceCenter.y = feetY;

    runDuration = Math.max(runFrom.distanceTo(runTo) / RUN_SPEED, 0.5);
    const toPaceCenter = paceCenter.clone().sub(player.position).setY(0);
    if (toPaceCenter.lengthSq() < 1e-6) toPaceCenter.copy(forward);
    toPaceCenter.normalize();
    camPos.copy(cameraSpot(player.position, toPaceCenter));
    camLookAt.copy(player.position).add(paceCenter).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.2, 0));

    kaufmoApi.playPassBy(runFrom, runTo, runDuration);
    dialogueUI.play(level2HallwayDialogue, {
      startAt: 'kaufmoHurriesBy',
      onComplete: startRoomOpening,
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

  function startRoomOpening() {
    if (pomni) {
      pomni.rotation.y = Math.atan2(paceCenter.x - player.position.x, paceCenter.z - player.position.z);
    }
    dialogueUI.play(level2RoomOpeningDialogue, {
      onComplete: () => { cleanup(); phase = 'done'; onComplete?.(); },
      onCancel: () => { cleanup(); phase = 'done'; onCancel?.(); },
    });
  }

  function update(deltaSeconds) {
    if (phase === 'loading') { renderer.render(scene, camera); return false; }
    if (phase === 'done') { renderer.render(scene, camera); return true; }

    if (!settled) {
      elapsed += deltaSeconds;
      if (elapsed >= runDuration) {
        settled = true;
        kaufmoApi.pace(paceCenter); // hands off from running to pacing in place — never just vanishes
      }
    }
    kaufmoApi.update(deltaSeconds);

    const t = settled ? 1 : elapsed / runDuration;
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

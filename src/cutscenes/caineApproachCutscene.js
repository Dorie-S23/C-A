import * as THREE from 'three';
import { loadCaine } from '../characters/caine.js';
import { level1OpenDialogue } from '../data/dialogues.js';

/**
 * Cutscene where Caine swoops in to meet Pomni after she's had a look round
 * the Dorm Hall (see main.js's triggerCaineArrival),
 * settles into a buoyant hover in front of her, and plays the "Caine's Warning"
 * dialogue with full speech chattering, mood poses, and animated eye tracking.
 */
export function createCaineApproachCutscene({
  scene,
  camera,
  player,
  pomni,
  renderer,
  dialogueUI,
  // (origin, direction, maxDistance) => free distance before a wall; without
  // it every direction counts as open.
  clearance = (origin, direction, maxDistance) => maxDistance,
  onComplete,
  onCancel,
}) {
  const HOVER_DISTANCE = 2.4;
  const MIN_HOVER = 1.2;      // never closer than this, even in a cupboard
  const CAINE_RADIUS = 0.6;   // keep his body this far off the wall
  const PROBE_HEIGHT = -0.7;  // probe at Caine's chest, below the eye height
  const CAMERA_SIDE = 1.7;
  const CAMERA_BACK = 0.7;
  const UP = new THREE.Vector3(0, 1, 0);

  /** Free distance from Pomni along a flat direction, probed at Caine's height. */
  function reachAlong(origin, direction, maxDistance) {
    const from = origin.clone();
    from.y += PROBE_HEIGHT;
    return clearance(from, direction, maxDistance);
  }

  /**
   * Sweeps out from Pomni's facing in 30° steps, alternating sides, and takes
   * the first direction with room for Caine to hover; failing that, the one
   * with the most room.
   */
  function clearestDirection(origin, facing) {
    const wanted = HOVER_DISTANCE + CAINE_RADIUS;
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

  /** Over Pomni's right shoulder, or her left if that's in a wall. */
  function cameraSpot(origin, forward) {
    const eye = origin.clone().add(new THREE.Vector3(0, 0.3, 0));
    let bestSpot = eye;
    let bestRoom = -1;
    for (const sign of [1, -1]) {
      const offset = new THREE.Vector3().crossVectors(UP, forward).multiplyScalar(sign * CAMERA_SIDE)
        .addScaledVector(forward, -CAMERA_BACK);
      const length = offset.length();
      const direction = offset.clone().divideScalar(length);
      const room = clearance(eye, direction, length);
      if (room >= length - 1e-3) return eye.clone().add(offset);
      if (room > bestRoom) {
        bestRoom = room;
        bestSpot = eye.clone().addScaledVector(direction, room);
      }
    }
    return bestSpot;
  }
  let caineApi = null;
  let phase = 'loading'; // 'loading' | 'flying' | 'talking' | 'exiting' | 'done'
  let elapsed = 0;
  const APPROACH_DURATION = 2.2;
  const EXIT_DURATION = 1.6;

  const targetSpot = new THREE.Vector3();
  const startSpot = new THREE.Vector3();
  const exitSpot = new THREE.Vector3();
  const initialCamPos = camera.position.clone();
  const cinematicCamPos = new THREE.Vector3();
  const cinematicCamLookAt = new THREE.Vector3();

  // Load Caine into the active scene
  loadCaine().then((api) => {
    caineApi = api;
    const { caine } = caineApi;

    // Calculate positions relative to Pomni
    const pomniFacing = pomni ? pomni.rotation.y : 0;
    // Direction Pomni is facing (+Z in model space)
    const facing = new THREE.Vector3(Math.sin(pomniFacing), 0, Math.cos(pomniFacing)).normalize();
    if (facing.lengthSq() < 1e-4) facing.set(0, 0, -1);

    // Caine comes in along the clearest line near where Pomni's looking, so
    // facing a wall doesn't put him behind it.
    const { forward, reach } = clearestDirection(player.position, facing);

    const feetY = player.position.y - 1.7; // PLAYER_HEIGHT is 1.7

    // Where Caine will hover to speak (~2.4m in front of Pomni), pulled in
    // if even the clearest line is shorter than that.
    const hoverDistance = Math.max(MIN_HOVER, Math.min(HOVER_DISTANCE, reach - CAINE_RADIUS));
    targetSpot.copy(player.position).addScaledVector(forward, hoverDistance);
    targetSpot.y = feetY;

    // Where Caine swoops in from / flies off to: high up and further along
    // the same line, but no further than the room allows.
    const beyond = Math.max(0, Math.min(5.0, reach - CAINE_RADIUS - hoverDistance));
    startSpot.copy(targetSpot).addScaledVector(forward, beyond).add(new THREE.Vector3(0, 2.6, 0));
    exitSpot.copy(targetSpot).addScaledVector(forward, beyond).add(new THREE.Vector3(0, 5.5, 0));

    caine.position.copy(startSpot);
    // Face Pomni
    caine.rotation.y = Math.atan2(player.position.x - targetSpot.x, player.position.z - targetSpot.z);

    // Frame the shot: camera pulled back and to one side, looking at the
    // space between them — whichever side (right first) has room.
    cinematicCamPos.copy(cameraSpot(player.position, forward));
    cinematicCamLookAt.copy(player.position)
      .add(targetSpot)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0.1, 0));

    scene.add(caine);
    caine.updateMatrixWorld(true);

    caineApi.setPose('happy');
    caineApi.setSpeaking(true); // chatter while swooping in with excitement!

    phase = 'flying';
    elapsed = 0;
  }).catch((err) => {
    console.error('Failed to load Caine for cutscene', err);
    phase = 'done';
    onComplete?.();
  });

  function update(deltaSeconds) {
    if (phase === 'loading') {
      renderer.render(scene, camera);
      return false;
    }

    if (caineApi) {
      caineApi.update(deltaSeconds);
    }

    if (phase === 'flying') {
      elapsed += deltaSeconds;
      const t = Math.min(1, elapsed / APPROACH_DURATION);
      // Smooth swoop curve
      const eased = t * t * (3 - 2 * t);

      // Arc flight down to hover point
      caineApi.caine.position.lerpVectors(startSpot, targetSpot, eased);
      // Small vertical arc peak
      caineApi.caine.position.y += Math.sin(t * Math.PI) * 0.35;

      // Smooth camera transition into dramatic framing
      camera.position.lerpVectors(initialCamPos, cinematicCamPos, eased);
      camera.lookAt(cinematicCamLookAt);
      renderer.render(scene, camera);

      if (t >= 1) {
        phase = 'talking';
        caineApi.caine.position.copy(targetSpot);
        caineApi.setSpeaking(false);
        caineApi.setPose('happy');

        // Turn Pomni to face Caine directly
        if (pomni) {
          pomni.rotation.y = Math.atan2(targetSpot.x - player.position.x, targetSpot.z - player.position.z);
        }

        // Start the conversation
        dialogueUI.play(level1OpenDialogue, {
          lookAt: targetSpot,
          onNode: (node) => {
            if (!node || !caineApi) return;
            if (node.speaker === 'caine') {
              caineApi.setSpeaking(true);
              caineApi.setPose(node.mood || 'happy');
            } else {
              caineApi.setSpeaking(false);
              caineApi.setPose(node.mood === 'annoyed' ? 'worried' : 'happy');
            }
          },
          onComplete: () => {
            // Cutscene exit flourish
            phase = 'exiting';
            elapsed = 0;
            caineApi.setPose('happy');
            caineApi.setSpeaking(false);
          },
          onCancel: () => {
            cleanup();
            // Hand the camera back: update() reports done from here on.
            phase = 'done';
            onCancel?.();
          },
        });
      }
      return false;
    }

    if (phase === 'talking') {
      // Keep camera framed on Caine & Pomni
      camera.position.lerp(cinematicCamPos, Math.min(1, deltaSeconds * 4));
      camera.lookAt(cinematicCamLookAt);
      renderer.render(scene, camera);
      return false;
    }

    if (phase === 'exiting') {
      elapsed += deltaSeconds;
      const t = Math.min(1, elapsed / EXIT_DURATION);
      const eased = t * t; // accelerate upwards

      caineApi.caine.position.lerpVectors(targetSpot, exitSpot, eased);
      caineApi.caine.rotation.y += deltaSeconds * 5; // playful ringmaster twirl on exit

      camera.lookAt(caineApi.caine.position);
      renderer.render(scene, camera);

      if (t >= 1) {
        cleanup();
        phase = 'done';
        onComplete?.();
        return true;
      }
      return false;
    }

    renderer.render(scene, camera);
    return phase === 'done';
  }

  function cleanup() {
    if (caineApi && caineApi.caine.parent) {
      caineApi.caine.parent.remove(caineApi.caine);
    }
  }

  return {
    update,
    cleanup,
  };
}

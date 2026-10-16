import * as THREE from 'three';
import { loadCaine } from '../characters/caine.js';
import { level1OpenDialogue } from '../data/dialogues.js';

/**
 * Cutscene where Caine swoops in to meet Pomni after her 8-second exploration,
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
  onComplete,
  onCancel,
}) {
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
    const forward = new THREE.Vector3(Math.sin(pomniFacing), 0, Math.cos(pomniFacing)).normalize();
    if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);

    // Right vector for camera placement
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();

    const feetY = player.position.y - 1.7; // PLAYER_HEIGHT is 1.7

    // Where Caine will hover to speak (~2.4m in front of Pomni)
    targetSpot.copy(player.position).addScaledVector(forward, 2.4);
    targetSpot.y = feetY;

    // Where Caine swoops in from: high up and further along the forward line
    startSpot.copy(targetSpot).addScaledVector(forward, 5.0).add(new THREE.Vector3(0, 2.6, 0));

    // Where Caine flies off to when finished (soaring up and into the distance)
    exitSpot.copy(targetSpot).addScaledVector(forward, 5.0).add(new THREE.Vector3(0, 5.5, 0));

    caine.position.copy(startSpot);
    // Face Pomni
    caine.rotation.y = Math.atan2(player.position.x - targetSpot.x, player.position.z - targetSpot.z);

    // Frame the shot: camera pulled back and to the right, looking at the space between them
    cinematicCamPos.copy(player.position)
      .addScaledVector(right, 1.7)
      .addScaledVector(forward, -0.7)
      .add(new THREE.Vector3(0, 0.3, 0));
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

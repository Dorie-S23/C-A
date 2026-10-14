import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Built from the team's Ribbit model (characters/Ribbit/ribbit.glb) by
// tools/blender/prepare_ribbit_model.py: her bow head swapped on, cut down
// to 30k triangles, already scaled to 2.2 m with her feet at the origin
// facing +Z, and given a small skeleton with a looping "Idle" clip (arms
// hanging, a withdrawn slouch, breathing, slow sway). Re-run the script if
// the source model changes.
const RIBBIT_URL = './models/characters/Ribbit/ribbit-rigged.glb';
const RIBBIT_HEIGHT = 2.2; // must match the script's RIBBIT_HEIGHT
const IDLE_CLIP = 'Idle';

// Invisible cylinder the player collides with, as for Caine and Kaufmo: a
// skinned mesh moves as it animates and its thin limbs slip between the
// wall probes. It's also what the E-key crosshair ray hits.
const COLLIDER_RADIUS = 0.4;

// How quickly she turns to face someone talking to her.
const TURN_SHARPNESS = 5;

/**
 * Loads Ribbit, idling. Callers only set position and rotation.y.
 *
 * @returns {Promise<{ ribbit: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void }>}
 */
export function loadRibbit() {
  return new GLTFLoader().loadAsync(RIBBIT_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    const ribbit = new THREE.Group();
    ribbit.name = 'Ribbit';
    ribbit.add(model);

    // Start the loop at a random point so she isn't mid-identical-breath
    // every time the room loads.
    const mixer = new THREE.AnimationMixer(model);
    const clip = THREE.AnimationClip.findByName(gltf.animations, IDLE_CLIP) ?? gltf.animations[0];
    if (clip) {
      const idle = mixer.clipAction(clip);
      idle.play();
      idle.time = Math.random() * clip.duration;
    }

    // Raycasts ignore `visible`, so the hidden cylinder still blocks.
    const collider = new THREE.Mesh(
      new THREE.CylinderGeometry(COLLIDER_RADIUS, COLLIDER_RADIUS, RIBBIT_HEIGHT, 16),
      new THREE.MeshBasicMaterial(),
    );
    collider.name = 'RibbitCollider';
    collider.position.y = RIBBIT_HEIGHT / 2;
    collider.visible = false;
    ribbit.add(collider);

    let targetYaw = null;
    const ownPosition = new THREE.Vector3();

    function update(deltaSeconds) {
      mixer.update(deltaSeconds);
      if (targetYaw !== null) {
        const diff = THREE.MathUtils.euclideanModulo(targetYaw - ribbit.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        ribbit.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      }
    }

    /** Turns her (smoothly, in update) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) {
        targetYaw = null;
        return;
      }
      ribbit.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    return { ribbit, collider, update, faceTowards };
  });
}

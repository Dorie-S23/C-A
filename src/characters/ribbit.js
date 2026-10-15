import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// Built from the team's Ribbit model (characters/Ribbit/ribbit.glb) by
// tools/blender/prepare_ribbit_model.py: her expressive head stood upright
// on her neck, cut down to 30k triangles, already scaled to 2.2 m with her
// feet at the origin facing +Z, and given a small skeleton with a looping
// "Idle" clip (arms hanging, a withdrawn slouch, breathing, slow sway).
// Re-run the script if the source model changes.
const RIBBIT_URL = './models/characters/Ribbit/ribbit-rigged.glb';
const RIBBIT_HEIGHT = 2.2; // must match the script's RIBBIT_HEIGHT
const IDLE_CLIP = 'Idle';

// Invisible cylinder the player collides with, as for Caine and Kaufmo: a
// skinned mesh moves as it animates and its thin limbs slip between the
// wall probes. It's also what the E-key crosshair ray hits.
const COLLIDER_RADIUS = 0.4;

// How quickly she turns to face someone talking to her.
const TURN_SHARPNESS = 5;

// Distress (setDistress, 0-3) is layered on top of the Idle clip: per
// level she hunches further forward, drops her head lower and trembles
// harder. It eases toward the target level, so being steadied reads as
// her slowly straightening up rather than snapping.
const DISTRESS_SHARPNESS = 3;
const HUNCH_PER_LEVEL = 0.07;     // radians of extra spine bend
const HEAD_DROP_PER_LEVEL = 0.1;  // radians of extra head bow
const TREMBLE_PER_LEVEL = 0.012;  // radians of head shake amplitude
const TREMBLE_SPEED = 28;         // radians per second

// Poses (setPose), also layered on the Idle clip. On the bed ('curled',
// 'sitting') her whole body is laid down along the outer group's -Z axis,
// pelvis at the group's origin — so a caller places the group on the
// mattress where her hips go, turned so -Z points at the pillow. The rig
// has no leg bones, so her legs stay straight: sitting up means sitting in
// bed, legs out in front, which is exactly "Ribbit sits up slowly".
//   roll:  turn onto her side (radians about her long axis; + faces -X)
//   spine: forward bend at the hips; π/2 brings her torso upright
//   head:  extra bow of the head
const POSES = {
  standing: { lying: false, roll: 0, spine: 0, head: 0 },
  curled: { lying: true, roll: Math.PI / 2, spine: 0.85, head: 0.5 },
  sitting: { lying: true, roll: 0, spine: Math.PI / 2, head: 0.12 },
};
const POSE_SHARPNESS = 1.2; // slow on purpose: "sits up slowly"
const LYING_LIFT = 0.13;    // her body's half-thickness above the mattress

/**
 * Loads Ribbit, idling. Callers only set position and rotation.y.
 *
 * @returns {Promise<{ ribbit: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setDistress: (level: number) => void,
 *   setPose: (name: 'standing' | 'curled' | 'sitting', options?: { immediate?: boolean }) => void }>}
 */
export function loadRibbit() {
  return new GLTFLoader().loadAsync(RIBBIT_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // Laid down or bent over, the skin leaves its bind-pose bounds.
      if (child.isSkinnedMesh) child.frustumCulled = false;
    });

    // ribbit (placed by the room) -> body (pose: standing / lying) -> model.
    // Bends are written in the body's frame, so "forward" stays her forward
    // whether she's standing or lying on her side.
    const ribbit = new THREE.Group();
    ribbit.name = 'Ribbit';
    const body = new THREE.Group();
    body.name = 'RibbitBody';
    ribbit.add(body);
    body.add(model);

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

    const spine = model.getObjectByName('spine');
    const head = model.getObjectByName('head');
    // The spine bone starts at her pelvis: the point the bed poses pivot on.
    model.updateMatrixWorld(true);
    const pelvisHeight = spine ? spine.getWorldPosition(new THREE.Vector3()).y : RIBBIT_HEIGHT * 0.41;

    let targetYaw = null;
    const ownPosition = new THREE.Vector3();
    let distress = 0;
    let distressTarget = 0;
    let time = 0;

    let pose = POSES.standing;
    const current = { roll: 0, spine: 0, head: 0 };
    const lieDown = new THREE.Quaternion().setFromAxisAngle(SIDEWAYS, -Math.PI / 2); // head to -Z, front up
    const rollQ = new THREE.Quaternion();
    const pelvis = new THREE.Vector3();
    const LONG_AXIS = new THREE.Vector3(0, 0, 1);

    function placeBody() {
      if (!pose.lying) {
        body.position.set(0, 0, 0);
        body.quaternion.identity();
        return;
      }
      // Lie her down, roll her about her long axis, then shift so her
      // pelvis — not her feet — sits on the group's origin.
      rollQ.setFromAxisAngle(LONG_AXIS, current.roll);
      body.quaternion.copy(rollQ).multiply(lieDown);
      pelvis.set(0, pelvisHeight, 0).applyQuaternion(body.quaternion);
      body.position.set(-pelvis.x, LYING_LIFT - pelvis.y, -pelvis.z);
    }

    function update(deltaSeconds) {
      mixer.update(deltaSeconds);
      time += deltaSeconds;

      current.roll = THREE.MathUtils.damp(current.roll, pose.roll, POSE_SHARPNESS, deltaSeconds);
      current.spine = THREE.MathUtils.damp(current.spine, pose.spine, POSE_SHARPNESS, deltaSeconds);
      current.head = THREE.MathUtils.damp(current.head, pose.head, POSE_SHARPNESS, deltaSeconds);
      placeBody();

      distress = THREE.MathUtils.damp(distress, distressTarget, DISTRESS_SHARPNESS, deltaSeconds);
      bendBone(spine, body, SIDEWAYS, current.spine + HUNCH_PER_LEVEL * distress);
      bendBone(head, body, SIDEWAYS, current.head + HEAD_DROP_PER_LEVEL * distress);
      if (distress > 0.01) {
        bendBone(head, body, UP, Math.sin(time * TREMBLE_SPEED) * TREMBLE_PER_LEVEL * distress);
      }

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

    /** 0 = calm, up to 3 = badly shaken; she eases toward it over ~a second. */
    function setDistress(level) {
      distressTarget = THREE.MathUtils.clamp(level, 0, 3);
    }

    /**
     * Eases into a pose (see POSES); `immediate` snaps instead, for setting
     * the scene up. Switching between standing and lying always snaps —
     * there's no animation for lying down.
     */
    function setPose(name, { immediate = false } = {}) {
      const next = POSES[name];
      if (!next) throw new Error(`Unknown Ribbit pose: ${name}`);
      const snap = immediate || next.lying !== pose.lying;
      pose = next;
      if (snap) {
        current.roll = next.roll;
        current.spine = next.spine;
        current.head = next.head;
        placeBody();
      }
    }

    return { ribbit, collider, update, faceTowards, setDistress, setPose };
  });
}

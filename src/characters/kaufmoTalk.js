import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// Kaufmo ships with a full rig but no baked animation clips (same
// situation as Caine and Jax — see their own files' comments), so this is
// hand-posed with bendBone, the same technique already proven for his run
// cycle in kaufmoRunExtra.js — not a from-scratch IK system like Caine's
// (caine.js), which is a much bigger, more specialized piece of work.
// Modest on purpose: a believable "alive and talking" read (a weight
// shift, one hand making a point, a head tilt) rather than per-mood
// acting — he was standing completely frozen before this existed.

const TURN_SHARPNESS = 5; // how fast he turns to face whoever he's talking to — matches ribbit.js's own faceTowards

const SWAY_HZ = 0.35; // always-on idle breathing/weight-shift, speaking or not
const SWAY_ANGLE = THREE.MathUtils.degToRad(3);

const GESTURE_HZ = 1.1;
const GESTURE_ARM_SWING = THREE.MathUtils.degToRad(18);
const GESTURE_ARM_LIFT = THREE.MathUtils.degToRad(7); // keeps the gesturing arm mostly raised, not swinging through hanging-at-his-side
const GESTURE_HEAD_TILT = THREE.MathUtils.degToRad(6);
const GESTURE_EASE_SECONDS = 0.2; // speaking starts/stops smoothly, not a hard cut

/** Same loose, punctuation-insensitive bone match as kaufmoRunExtra.js. */
function findBone(root, needle) {
  let found = null;
  root.traverse((child) => {
    if (found || !child.isBone) return;
    const clean = child.name.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.includes(needle)) found = child;
  });
  return found;
}

/**
 * Loads Kaufmo set up to act like he's actually in the conversation:
 * turns to face whoever he's talking to, sways gently at rest, and
 * gestures with one hand plus a head tilt while setSpeaking(true).
 *
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setSpeaking: (speaking: boolean) => void }>}
 */
export function loadKaufmoTalk() {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    const bones = {
      spine: findBone(kaufmo, 'spine'),
      head: findBone(kaufmo, 'head'),
      arm: findBone(kaufmo, 'rupperarm'),
    };
    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }

    let time = 0;
    let speakAmount = 0; // eased 0-1, not a hard on/off, so the gesture doesn't snap
    let speaking = false;
    let targetYaw = null;
    const ownPosition = new THREE.Vector3();

    function update(deltaSeconds) {
      time += deltaSeconds;
      speakAmount += ((speaking ? 1 : 0) - speakAmount) * Math.min(1, deltaSeconds / GESTURE_EASE_SECONDS);

      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);

      // Idle sway, always on — reads as "breathing", not a statue.
      bendBone(bones.spine, kaufmo, UP, Math.sin(time * SWAY_HZ * Math.PI * 2) * SWAY_ANGLE);

      if (speakAmount > 0.001) {
        const phase = time * GESTURE_HZ * Math.PI * 2;
        // One arm making a point, not both — reads as talking, not jumping jacks.
        bendBone(bones.arm, kaufmo, SIDEWAYS, (Math.sin(phase) * GESTURE_ARM_SWING - GESTURE_ARM_LIFT) * speakAmount);
        bendBone(bones.head, kaufmo, SIDEWAYS, Math.sin(phase * 1.3) * GESTURE_HEAD_TILT * speakAmount);
      }

      if (targetYaw !== null) {
        const diff = THREE.MathUtils.euclideanModulo(targetYaw - kaufmo.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        kaufmo.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      }
    }

    /** Turns him (smoothly, in update) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) { targetYaw = null; return; }
      kaufmo.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    function setSpeaking(value) {
      speaking = Boolean(value);
    }

    return { kaufmo, collider, update, faceTowards, setSpeaking };
  });
}

import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// Kaufmo ships with a full rig but no baked animation clips (same
// situation as Caine and Jax — see their own files' comments), so this is
// hand-posed with bendBone, the same technique already proven for his run
// cycle in kaufmoRunExtra.js — not Caine's from-scratch two-bone IK solver
// (caine.js): that solves for exact wrist/hand positions and orientations
// per mood, hand-tuned by someone who could see the result. Posing by
// fixed joint angles can look wrong on this exported rig, so conversation
// movement stays small and is applied only to a few clearly named bones.

const TURN_SHARPNESS = 5; // how fast he turns to face whoever he's talking to — matches ribbit.js's own faceTowards

const SPEAK_EASE_SECONDS = 0.2; // speaking starts/stops smoothly, not a hard cut
const JAW_CHATTER_HZ = 2.4;
const JAW_OPEN_ANGLE = THREE.MathUtils.degToRad(14);
const IDLE_SWAY_HZ = 0.22;
const IDLE_SWAY_ANGLE = THREE.MathUtils.degToRad(1.2);
const HEAD_NOD_ANGLE = THREE.MathUtils.degToRad(2.5);
const GESTURE_PERIOD = 3.6;
const GESTURE_DURATION = 1.35;
const ARM_GESTURE_ANGLE = THREE.MathUtils.degToRad(9);
const FOREARM_GESTURE_ANGLE = THREE.MathUtils.degToRad(7);

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
 * turns to face whoever he's talking to, holds a relaxed idle, and uses
 * subtle jaw, head, and hand beats while setSpeaking(true).
 *
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setPose: (mood: string) => void,
 *   setSpeaking: (speaking: boolean) => void }>}
 */
export function loadKaufmoTalk() {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    const bones = {
      jaw: findBone(kaufmo, 'jaw'),
      spine: findBone(kaufmo, 'spine'),
      head: findBone(kaufmo, 'head'),
      upperArmR: findBone(kaufmo, 'rupperarm'),
      foreArmR: findBone(kaufmo, 'rforearm'),
    };
    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }

    let time = 0;
    let speakAmount = 0; // eased 0-1, not a hard on/off
    let speaking = false;
    let targetYaw = null;
    const ownPosition = new THREE.Vector3();

    function update(deltaSeconds) {
      time += deltaSeconds;
      speakAmount += ((speaking ? 1 : 0) - speakAmount) * Math.min(1, deltaSeconds / SPEAK_EASE_SECONDS);

      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);

      // Keep his posture relaxed. A very small slow weight shift and head
      // nod add life without rocking him between visibly different poses.
      bendBone(bones.spine, kaufmo, UP, Math.sin(time * IDLE_SWAY_HZ * Math.PI * 2) * IDLE_SWAY_ANGLE);
      bendBone(bones.head, kaufmo, SIDEWAYS,
        Math.sin(time * IDLE_SWAY_HZ * Math.PI * 4) * HEAD_NOD_ANGLE * (0.25 + speakAmount * 0.75));

      if (speakAmount > 0.001) {
        // Relaxed speech chatter, plus an occasional held hand beat instead
        // of a constant arm swing. The smooth envelope makes the gesture
        // read as emphasis during a sentence rather than a looping wave.
        const chatter = Math.max(0, Math.sin(time * JAW_CHATTER_HZ * Math.PI * 2) * 0.65
          + Math.sin(time * JAW_CHATTER_HZ * Math.PI * 3.1) * 0.35);
        bendBone(bones.jaw, kaufmo, SIDEWAYS, chatter * JAW_OPEN_ANGLE * speakAmount);

        const gestureTime = THREE.MathUtils.euclideanModulo(time + 0.7, GESTURE_PERIOD);
        const gestureProgress = THREE.MathUtils.clamp(gestureTime / GESTURE_DURATION, 0, 1);
        const gesture = Math.sin(gestureProgress * Math.PI) ** 2 * (gestureTime < GESTURE_DURATION ? 1 : 0);
        bendBone(bones.upperArmR, kaufmo, SIDEWAYS, -ARM_GESTURE_ANGLE * gesture * speakAmount);
        bendBone(bones.foreArmR, kaufmo, SIDEWAYS, -FOREARM_GESTURE_ANGLE * gesture * speakAmount);
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

    // Kept for the shared dialogue interface. Mood-specific body poses are
    // intentionally omitted so he stays relaxed and consistent in the chat.
    function setPose(_mood) {}

    function setSpeaking(value) {
      speaking = Boolean(value);
    }

    return { kaufmo, collider, update, faceTowards, setPose, setSpeaking };
  });
}

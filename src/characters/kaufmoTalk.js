import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// Kaufmo ships with a full rig but no baked animation clips (same
// situation as Caine and Jax — see their own files' comments), so this is
// hand-posed with bendBone, the same technique already proven for his run
// cycle in kaufmoRunExtra.js — not Caine's from-scratch two-bone IK solver
// (caine.js): that solves for exact wrist/hand positions and orientations
// per mood, hand-tuned by someone who could see the result. Posing by
// fixed joint ANGLES instead of solved positions is less precise, but the
// angles here are deliberately simple and one-directional (how far he
// leans/lifts, never which way, picked to mirror ribbit.js's already-
// proven hunch/head-drop convention) specifically so there's nothing here
// that depends on a sign guess I can't see the result of.

const TURN_SHARPNESS = 5; // how fast he turns to face whoever he's talking to — matches ribbit.js's own faceTowards
const POSE_SHARPNESS = 6; // how fast he eases into a new mood's pose — matches caine.js's own POSE_EASE rate

const SWAY_HZ = 0.35; // always-on idle breathing/weight-shift, under whatever mood pose is active
const SWAY_ANGLE = THREE.MathUtils.degToRad(3);

const GESTURE_HZ = 1.1;
const GESTURE_ARM_SWING = THREE.MathUtils.degToRad(16);
const GESTURE_HEAD_TILT = THREE.MathUtils.degToRad(5);
const SPEAK_EASE_SECONDS = 0.2; // speaking starts/stops smoothly, not a hard cut

// Each mood only varies by how far he leans/hunches and how "big" his
// gesture is — spine/head positive = hunched/bowed forward (worried, sad),
// negative = upright/leaned back (happy, shocked), same sign Ribbit's own
// distress hunch already uses; armLift (0-1) scales how far both upper
// arms lift and bend forward, from barely-there to fairly animated.
// Deliberately NOT guessing at distinct hand shapes per mood (crossed
// arms, a hand to the chest, etc.) — that's exactly the kind of detail
// Caine's poses needed to be *seen* to get right.
const POSES = {
  neutral: { spine: 0, head: 0, armLift: 0.12 },
  happy: { spine: -4, head: -6, armLift: 0.6 },
  worried: { spine: 7, head: 9, armLift: 0.3 },
  shocked: { spine: -6, head: -8, armLift: 0.8 },
  sad: { spine: 9, head: 13, armLift: 0.05 },
  annoyed: { spine: 4, head: 3, armLift: 0.45 },
};
const ARM_LIFT_UPPER = THREE.MathUtils.degToRad(26); // at armLift = 1
const ARM_LIFT_FOREARM = THREE.MathUtils.degToRad(22);

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
 * turns to face whoever he's talking to, holds a mood-appropriate pose
 * (setPose — see POSES above), sways gently at rest, and gestures with
 * one hand plus a head tilt on top of that while setSpeaking(true).
 *
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setPose: (mood: keyof typeof POSES) => void,
 *   setSpeaking: (speaking: boolean) => void }>}
 */
export function loadKaufmoTalk() {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    const bones = {
      spine: findBone(kaufmo, 'spine'),
      head: findBone(kaufmo, 'head'),
      upperArmL: findBone(kaufmo, 'lupperarm'),
      upperArmR: findBone(kaufmo, 'rupperarm'),
      foreArmL: findBone(kaufmo, 'lforearm'),
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

    let targetMood = 'neutral';
    const current = { ...POSES.neutral };

    function update(deltaSeconds) {
      time += deltaSeconds;
      speakAmount += ((speaking ? 1 : 0) - speakAmount) * Math.min(1, deltaSeconds / SPEAK_EASE_SECONDS);

      const target = POSES[targetMood] ?? POSES.neutral;
      const ease = 1 - Math.exp(-POSE_SHARPNESS * deltaSeconds);
      current.spine += (target.spine - current.spine) * ease;
      current.head += (target.head - current.head) * ease;
      current.armLift += (target.armLift - current.armLift) * ease;

      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);

      // Idle sway, always on — reads as "breathing", not a statue — plus
      // the held mood lean/hunch.
      bendBone(bones.spine, kaufmo, SIDEWAYS, THREE.MathUtils.degToRad(current.spine));
      bendBone(bones.spine, kaufmo, UP, Math.sin(time * SWAY_HZ * Math.PI * 2) * SWAY_ANGLE);
      bendBone(bones.head, kaufmo, SIDEWAYS, THREE.MathUtils.degToRad(current.head));

      // Both arms lift/bend forward by the mood's armLift; speaking adds an
      // oscillating swing on top of the right arm only, so he's making a
      // point with one hand rather than waving both.
      const liftUpper = -ARM_LIFT_UPPER * current.armLift;
      const liftFore = -ARM_LIFT_FOREARM * current.armLift;
      bendBone(bones.upperArmL, kaufmo, SIDEWAYS, liftUpper);
      bendBone(bones.foreArmL, kaufmo, SIDEWAYS, liftFore);
      bendBone(bones.upperArmR, kaufmo, SIDEWAYS, liftUpper);
      bendBone(bones.foreArmR, kaufmo, SIDEWAYS, liftFore);

      if (speakAmount > 0.001) {
        const phase = time * GESTURE_HZ * Math.PI * 2;
        bendBone(bones.upperArmR, kaufmo, SIDEWAYS, Math.sin(phase) * GESTURE_ARM_SWING * speakAmount);
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

    /** Eases toward one of POSES; unrecognized moods fall back to neutral. */
    function setPose(mood) {
      targetMood = POSES[mood] ? mood : 'neutral';
    }

    function setSpeaking(value) {
      speaking = Boolean(value);
    }

    return { kaufmo, collider, update, faceTowards, setPose, setSpeaking };
  });
}

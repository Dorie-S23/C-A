import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Everything (geometry, skins, textures) is embedded in the .gltf itself,
// so the sibling textures/ folder from the download is not needed.
const CAINE_URL = './models/characters/caine-the-amazing-digital-circus/source/CAINE.gltf';

// The ringmaster towers over the cast, so he's scaled taller than the
// player (PLAYER_HEIGHT in main.js is 1.7).
const CAINE_HEIGHT = 2.6;

// Invisible cylinder the player collides with.
const COLLIDER_RADIUS = 0.45;

/**
 * Loads Caine and normalizes him so his origin sits on the floor between
 * his feet: the source model is ~3.6 units tall with an arbitrary origin,
 * so it's rescaled to CAINE_HEIGHT and recentred. Callers then only need
 * to set position (a floor point) and rotation.y.
 *
 * @returns {Promise<{ caine: THREE.Group, collider: THREE.Mesh, animator: object,
 *   update: (deltaSeconds: number) => void, setPose: (pose: string) => void,
 *   setSpeaking: (speaking: boolean) => void,
 *   flyTo: (target: THREE.Vector3, duration?: number, onArrive?: () => void) => void,
 *   faceTowards: (target: THREE.Vector3) => void, turnTowards: (target: THREE.Vector3 | null) => void,
 *   rollEyes: (options?: { delay?: number }) => void }>}
 */
export function loadCaine() {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      CAINE_URL,
      (gltf) => {
        const model = gltf.scene;

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        updateSkeletons(model);

        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = CAINE_HEIGHT / size.y;

        model.scale.setScalar(scale);
        model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        const caine = new THREE.Group();
        caine.name = 'Caine';
        caine.add(model);

        // Raycasts ignore `visible`, so the hidden cylinder still blocks.
        const collider = new THREE.Mesh(
          new THREE.CylinderGeometry(COLLIDER_RADIUS, COLLIDER_RADIUS, CAINE_HEIGHT, 16),
          new THREE.MeshBasicMaterial(),
        );
        collider.name = 'CaineCollider';
        collider.position.y = CAINE_HEIGHT / 2;
        collider.visible = false;
        caine.add(collider);

        const animator = createCaineAnimator(caine);

        resolve({
          caine,
          collider,
          animator,
          update: animator.update,
          setPose: animator.setPose,
          setSpeaking: animator.setSpeaking,
          flyTo: animator.flyTo,
          faceTowards: animator.faceTowards,
          turnTowards: animator.turnTowards,
          rollEyes: animator.rollEyes,
        });
      },
      undefined,
      reject,
    );
  });
}

function updateSkeletons(root) {
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isSkinnedMesh) child.skeleton.update();
  });
}

const BONE_NAMES = {
  spine: 'Spine2',
  head: 'Caine Head V3',
  mouthTop: 'mouthTopControl',
  mouthBot: 'mouthBotControl',
  leftEye: 'Bone41',
  rightEye: 'Bone82',
  lUpperArm: 'L_UpperArm',
  lForearm: 'L_Forearm',
  lHand: 'L_Hand',
  lKnuckle: 'L_Finger1_',
  lIndex: ['L_Finger1_', 'L_Finger11_', 'L_Finger12_'],
  lFingers: ['L_Finger2_', 'L_Finger21_', 'L_Finger22_', 'L_Finger3_', 'L_Finger31_', 'L_Finger32_'],
  rUpperArm: 'R_UpperArm',
  rForearm: 'R_Forearm',
  rHand: 'R_Hand',
  rKnuckle: 'R_Finger1_',
  lThigh: 'L_Thigh',
  lCalf: 'L_Calf',
  rThigh: 'R_Thigh',
  rCalf: 'R_Calf',
};

const L_PALM_REST = new THREE.Vector3(-1, 0, 0);
const R_PALM_REST = new THREE.Vector3(1, 0, 0);
const L_CURL_AXIS = new THREE.Vector3(0, 0, -1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

// turnTowards: how quickly he swings round to face a point.
const TURN_SHARPNESS = 5;
// rollEyes: a playful, exaggerated eye roll (radians on the eye bones).
const EYE_ROLL_SECONDS = 1.4;
const EYE_ROLL_YAW = 0.55;        // how far across the eyes sweep, either side
const EYE_ROLL_PITCH = 0.7;       // how far up they go
const EYE_ROLL_HEAD_BACK = 0.12;  // head tips back with them
const EYE_ROLL_HEAD_TILT = 0.08;  // and wobbles side to side

// Chin position and prop arm constants for the pondering pose
const CHIN = new THREE.Vector3(0.01, 1.23, 0.33);
const FIST_HEIGHT = 0.25;
const FIST_DIR = new THREE.Vector3(-0.1, 1, 0.1).normalize();
const FIST_PALM = new THREE.Vector3(-0.3, 0, -1).normalize();
const FIST_ELBOW_POLE = new THREE.Vector3(0.7, -1, -0.1);
const FINGER_CURL = 0.75;
const INDEX_CURL = 0.45;
const INDEX_TAP = 0.35;

const PROP_WRIST = new THREE.Vector3(0.02, 0.86, 0.17);
const PROP_DIR = new THREE.Vector3(1, 0.05, 0.1).normalize();
const PROP_PALM = new THREE.Vector3(0, 1, 0);
const PROP_ELBOW_POLE = new THREE.Vector3(-0.8, -1, -0.2);

const IDENTITY = new THREE.Quaternion();

/**
 * Procedural animation system for Caine:
 * Controls his ringmaster poses (happy/showman, worried, shocked, sad, ponder),
 * speech jaw chatter, eye tracking/wander, theatrical gestures, and hovering flight.
 */
export function createCaineAnimator(caine) {
  caine.updateMatrixWorld(true);
  const rig = buildRig(caine);
  const lArm = armChain(rig.lUpperArm, rig.lForearm, rig.lHand, rig.lKnuckle, L_PALM_REST);
  const rArm = armChain(rig.rUpperArm, rig.rForearm, rig.rHand, rig.rKnuckle, R_PALM_REST);
  // rig.head may be null on malformed exports — fall back to a sensible mid-head position.
  const headPivot = rig.head?.restPosition ?? new THREE.Vector3(0, 1.2 * (CAINE_HEIGHT / 2.6), 0.05);

  // Pre-calculate arm IK target poses
  const ponderLWrist = CHIN.clone().sub(headPivot).addScaledVector(FIST_DIR, -FIST_HEIGHT);
  const armTargets = {
    ponder: {
      l: { wrist: ponderLWrist, pole: FIST_ELBOW_POLE, dir: FIST_DIR, palm: FIST_PALM },
      r: { wrist: PROP_WRIST, pole: PROP_ELBOW_POLE, dir: PROP_DIR, palm: PROP_PALM },
      fingerCurl: FINGER_CURL,
      indexCurl: INDEX_CURL,
    },
    happy: {
      l: { wrist: new THREE.Vector3(0.48, 1.05, 0.35), pole: new THREE.Vector3(0.9, -0.4, -0.3), dir: new THREE.Vector3(0.2, 0.7, 0.4).normalize(), palm: new THREE.Vector3(0, 0.7, 0.7).normalize() },
      r: { wrist: new THREE.Vector3(-0.48, 1.15, 0.35), pole: new THREE.Vector3(-0.9, -0.4, -0.3), dir: new THREE.Vector3(-0.2, 0.7, 0.4).normalize(), palm: new THREE.Vector3(0, 0.7, 0.7).normalize() },
      fingerCurl: 0.15,
      indexCurl: 0.1,
    },
    worried: {
      l: { wrist: new THREE.Vector3(0.25, 0.8, 0.25), pole: new THREE.Vector3(0.7, -0.8, -0.2), dir: new THREE.Vector3(0.1, 0.9, 0.3).normalize(), palm: new THREE.Vector3(-0.5, 0.8, 0).normalize() },
      r: { wrist: new THREE.Vector3(-0.12, 1.08, 0.28), pole: new THREE.Vector3(-0.6, -1.0, 0), dir: new THREE.Vector3(-0.1, 0.9, 0.3).normalize(), palm: new THREE.Vector3(0.5, 0.8, 0.2).normalize() },
      fingerCurl: 0.4,
      indexCurl: 0.3,
    },
    shocked: {
      l: { wrist: new THREE.Vector3(0.55, 1.48, 0.15), pole: new THREE.Vector3(1.0, 0.3, -0.4), dir: new THREE.Vector3(0.3, 0.9, 0.2).normalize(), palm: new THREE.Vector3(0.3, 0.5, 0.8).normalize() },
      r: { wrist: new THREE.Vector3(-0.55, 1.48, 0.15), pole: new THREE.Vector3(-1.0, 0.3, -0.4), dir: new THREE.Vector3(-0.3, 0.9, 0.2).normalize(), palm: new THREE.Vector3(-0.3, 0.5, 0.8).normalize() },
      fingerCurl: 0.05,
      indexCurl: 0.0,
    },
    sad: {
      l: { wrist: new THREE.Vector3(0.22, 0.65, 0.18), pole: new THREE.Vector3(0.7, -0.9, -0.3), dir: new THREE.Vector3(0.1, -0.8, 0.5).normalize(), palm: new THREE.Vector3(-0.5, 0.7, 0.5).normalize() },
      r: { wrist: new THREE.Vector3(-0.22, 0.65, 0.18), pole: new THREE.Vector3(-0.7, -0.9, -0.3), dir: new THREE.Vector3(-0.1, -0.8, 0.5).normalize(), palm: new THREE.Vector3(0.5, 0.7, 0.5).normalize() },
      fingerCurl: 0.3,
      indexCurl: 0.25,
    },
  };

  const solvedPoses = {};
  for (const [key, tgt] of Object.entries(armTargets)) {
    const lPose = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), hand: new THREE.Quaternion() };
    const rPose = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), hand: new THREE.Quaternion() };
    solveArm(lArm, tgt.l.wrist, tgt.l.pole, tgt.l.dir, tgt.l.palm, lPose);
    solveArm(rArm, tgt.r.wrist, tgt.r.pole, tgt.r.dir, tgt.r.palm, rPose);
    solvedPoses[key] = { l: lPose, r: rPose, fingerCurl: tgt.fingerCurl, indexCurl: tgt.indexCurl };
  }

  const HEAD_POSES = {
    ponder: { pitch: 0.12, yaw: 0.42, roll: 0.14, eyePitch: 0.55, eyeYaw: 0.35 },
    happy: { pitch: -0.06, yaw: 0.0, roll: -0.04, eyePitch: 0.08, eyeYaw: 0.0 },
    worried: { pitch: 0.06, yaw: 0.18, roll: -0.12, eyePitch: 0.05, eyeYaw: 0.14 },
    shocked: { pitch: -0.25, yaw: 0.0, roll: 0.0, eyePitch: -0.18, eyeYaw: 0.0 },
    sad: { pitch: 0.2, yaw: -0.1, roll: 0.08, eyePitch: 0.22, eyeYaw: -0.06 },
  };

  // State
  let currentMood = 'happy';
  let targetMood = 'happy';
  let isSpeaking = false;
  let jawChatterSuppressed = false;
  let time = 0;
  let jawOpen = 0;
  let floatHeight = 0;

  // Flight state
  let flight = null;
  // An eased turn toward a point (turnTowards); faceTowards snaps instead.
  let turnTarget = null;
  // A playful eye roll in progress (rollEyes): seconds in, and the wait before it.
  let eyeRoll = null;

  // Working quaternions & vectors
  const headQ = new THREE.Quaternion();
  const eyeQ = new THREE.Quaternion();
  const spineQ = new THREE.Quaternion();
  const topJawQ = new THREE.Quaternion();
  const botJawQ = new THREE.Quaternion();
  const lThighQ = new THREE.Quaternion();
  const rThighQ = new THREE.Quaternion();
  const curlQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  // Interpolated pose state
  const currentPose = {
    l: { upper: solvedPoses.happy.l.upper.clone(), fore: solvedPoses.happy.l.fore.clone(), hand: solvedPoses.happy.l.hand.clone() },
    r: { upper: solvedPoses.happy.r.upper.clone(), fore: solvedPoses.happy.r.fore.clone(), hand: solvedPoses.happy.r.hand.clone() },
    head: { pitch: HEAD_POSES.happy.pitch, yaw: HEAD_POSES.happy.yaw, roll: HEAD_POSES.happy.roll, eyePitch: HEAD_POSES.happy.eyePitch, eyeYaw: HEAD_POSES.happy.eyeYaw },
    fingerCurl: solvedPoses.happy.fingerCurl,
    indexCurl: solvedPoses.happy.indexCurl,
  };

  const curl = (entries, angle) => {
    curlQ.setFromAxisAngle(L_CURL_AXIS, angle);
    for (const entry of entries) applyCharacterRotation(entry, curlQ);
  };

  function setPose(mood) {
    if (mood === 'idle') mood = 'ponder';
    if (!solvedPoses[mood]) mood = 'happy';
    targetMood = mood;
  }

  function setSpeaking(speaking) {
    isSpeaking = Boolean(speaking);
    if (isSpeaking) jawChatterSuppressed = false;
  }

  function flyTo(targetWorldPos, duration = 2.0, onArrive = null) {
    flight = {
      from: caine.position.clone(),
      to: targetWorldPos.clone(),
      startRotation: caine.rotation.y,
      targetRotation: Math.atan2(targetWorldPos.x - caine.position.x, targetWorldPos.z - caine.position.z),
      duration,
      elapsed: 0,
      onArrive,
    };
  }

  function faceTowards(worldPoint) {
    turnTarget = null;
    caine.rotation.y = Math.atan2(worldPoint.x - caine.position.x, worldPoint.z - caine.position.z);
  }

  /** Turns him to face a world point over a moment, rather than snapping. */
  function turnTowards(worldPoint) {
    turnTarget = worldPoint ? worldPoint.clone() : null;
  }

  /** A playful eye roll: both eyes sweep up and over the top, head tilting with them. */
  function rollEyes({ delay = 0 } = {}) {
    eyeRoll = { elapsed: -delay };
    jawChatterSuppressed = false;
  }

  function update(deltaSeconds) {
    time += deltaSeconds;

    // Handle flight path if active
    if (flight) {
      flight.elapsed += deltaSeconds;
      const t = Math.min(1, flight.elapsed / flight.duration);
      // Smootherstep easing
      const eased = t * t * t * (t * (t * 6 - 15) + 10);
      caine.position.lerpVectors(flight.from, flight.to, eased);
      // Banking and yaw turn
      caine.rotation.y = THREE.MathUtils.lerp(flight.startRotation, flight.targetRotation, eased);

      if (t >= 1) {
        const cb = flight.onArrive;
        flight = null;
        cb?.();
      }
    }

    if (turnTarget && !flight) {
      const wanted = Math.atan2(turnTarget.x - caine.position.x, turnTarget.z - caine.position.z);
      const diff = THREE.MathUtils.euclideanModulo(wanted - caine.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      caine.rotation.y += diff * Math.min(1, deltaSeconds * TURN_SHARPNESS);
    }

    // Eye roll: s runs 0..1 over EYE_ROLL_SECONDS. The eyes swing up to one
    // side, sweep across the top to the other, and drop back, eased in and
    // out (`lift`) so it starts and ends on his normal gaze.
    let rollPitch = 0, rollYaw = 0, rollHeadPitch = 0, rollHeadRoll = 0;
    if (eyeRoll) {
      eyeRoll.elapsed += deltaSeconds;
      const s = eyeRoll.elapsed / EYE_ROLL_SECONDS;
      if (s >= 1) {
        eyeRoll = null;
        jawChatterSuppressed = true;
      }
      else if (s > 0) {
        const lift = Math.sin(Math.PI * s);
        const sweep = Math.PI * (0.85 - 0.7 * s); // left-and-up, over the top, to right-and-up
        rollYaw = Math.cos(sweep) * EYE_ROLL_YAW * lift;
        rollPitch = (Math.sin(sweep) * EYE_ROLL_PITCH) * lift;
        rollHeadPitch = EYE_ROLL_HEAD_BACK * lift; // head tips back a touch with the eyes
        rollHeadRoll = Math.sin(Math.PI * 2 * s) * EYE_ROLL_HEAD_TILT * lift;
      }
    }

    // Ease pose toward target pose
    const POSE_EASE = Math.min(1, deltaSeconds * 6);
    const targetPoseData = solvedPoses[targetMood] || solvedPoses.happy;
    const targetHeadData = HEAD_POSES[targetMood] || HEAD_POSES.happy;

    currentPose.l.upper.slerp(targetPoseData.l.upper, POSE_EASE);
    currentPose.l.fore.slerp(targetPoseData.l.fore, POSE_EASE);
    currentPose.l.hand.slerp(targetPoseData.l.hand, POSE_EASE);

    currentPose.r.upper.slerp(targetPoseData.r.upper, POSE_EASE);
    currentPose.r.fore.slerp(targetPoseData.r.fore, POSE_EASE);
    currentPose.r.hand.slerp(targetPoseData.r.hand, POSE_EASE);

    currentPose.fingerCurl = THREE.MathUtils.lerp(currentPose.fingerCurl, targetPoseData.fingerCurl, POSE_EASE);
    currentPose.indexCurl = THREE.MathUtils.lerp(currentPose.indexCurl, targetPoseData.indexCurl, POSE_EASE);

    currentPose.head.pitch = THREE.MathUtils.lerp(currentPose.head.pitch, targetHeadData.pitch, POSE_EASE);
    currentPose.head.yaw = THREE.MathUtils.lerp(currentPose.head.yaw, targetHeadData.yaw, POSE_EASE);
    currentPose.head.roll = THREE.MathUtils.lerp(currentPose.head.roll, targetHeadData.roll, POSE_EASE);
    currentPose.head.eyePitch = THREE.MathUtils.lerp(currentPose.head.eyePitch, targetHeadData.eyePitch, POSE_EASE);
    currentPose.head.eyeYaw = THREE.MathUtils.lerp(currentPose.head.eyeYaw, targetHeadData.eyeYaw, POSE_EASE);

    // Floating hover bob and spine sway
    const hoverOffset = Math.sin(time * 2.8) * 0.06;
    floatHeight = hoverOffset;
    const wander = time * 0.9;

    // Spine breathing + theatrical lean
    const spinePitch = Math.sin(time * 1.6) * 0.02 + (targetMood === 'worried' ? 0.05 : targetMood === 'shocked' ? -0.06 : 0.01);
    const spineYaw = Math.sin(time * 0.7) * 0.015;
    spineQ.setFromEuler(euler.set(spinePitch, spineYaw, 0));
    applyCharacterRotation(rig.spine, spineQ);

    // Head rotation + speaking nodding
    // Halved so the nod doesn't beat against jaw chatter and amplify the visual shake.
    const speechNod = isSpeaking ? Math.sin(time * 9.5) * 0.018 : 0;
    headQ.setFromEuler(euler.set(
      -currentPose.head.pitch + Math.sin(wander * 1.3) * 0.03 + speechNod - rollHeadPitch,
      currentPose.head.yaw + Math.sin(wander * 0.8) * 0.05,
      -currentPose.head.roll + Math.sin(wander * 0.6) * 0.04 + rollHeadRoll,
    ));
    applyCharacterRotation(rig.head, headQ);

    // Eyes wander and react
    const eyeDart = Math.sin(time * 3.2) * 0.08;
    const settle = eyeRoll ? 0 : 1; // no darting about mid-roll
    eyeQ.setFromEuler(euler.set(
      -currentPose.head.eyePitch + Math.sin(wander * 2.1) * 0.04 * settle - rollPitch,
      currentPose.head.eyeYaw + eyeDart * settle + rollYaw,
      0,
    ));
    applyCharacterRotation(rig.leftEye, eyeQ);
    applyCharacterRotation(rig.rightEye, eyeQ);

    // Jaws / Teeth speech chatter.
    // Keep rotation angles small to avoid the mesh interpenetration (clipping)
    // that happens when the lower jaw drops too far or the upper jaw tilts back
    // too far, exposing the hollow inside of the mouth.
    let targetJaw = 0;
    if (isSpeaking && !jawChatterSuppressed) {
      const chatter = Math.max(0, Math.sin(time * 15.0) * 0.65 + Math.sin(time * 22.0) * 0.35);
      // Reduced: 0.38 → 0.22 for speech, 0.55 → 0.32 for shocked-speech
      targetJaw = targetMood === 'shocked' ? 0.32 : chatter * 0.22;
    } else if (!jawChatterSuppressed && targetMood === 'shocked') {
      // Reduced: 0.5 → 0.28 for idle-shocked
      targetJaw = 0.28;
    }
    jawOpen = THREE.MathUtils.lerp(jawOpen, targetJaw, Math.min(1, deltaSeconds * 16));

    if (rig.mouthBot) {
      botJawQ.setFromAxisAngle(X_AXIS, jawOpen);
      applyCharacterRotation(rig.mouthBot, botJawQ);
    }
    if (rig.mouthTop) {
      // Top jaw multiplier reduced 0.35 → 0.08: the upper half of Caine's head
      // IS the top jaw bone, so over-rotating it tilts the entire top of his
      // head backward, revealing the hollow interior of the mouth.
      topJawQ.setFromAxisAngle(X_AXIS, -jawOpen * 0.08);
      applyCharacterRotation(rig.mouthTop, topJawQ);
    }

    // Arms
    applyCharacterRotation(rig.lUpperArm, currentPose.l.upper);
    applyCharacterRotation(rig.lForearm, currentPose.l.fore);
    applyCharacterRotation(rig.lHand, currentPose.l.hand);

    applyCharacterRotation(rig.rUpperArm, currentPose.r.upper);
    applyCharacterRotation(rig.rForearm, currentPose.r.fore);
    applyCharacterRotation(rig.rHand, currentPose.r.hand);

    // Finger drumming if in ponder pose, otherwise relaxed/spread
    const drumming = targetMood === 'ponder' && Math.sin(time * 1.4) > 0.3 ? Math.max(0, Math.sin(time * 9)) : 0;
    curl(rig.lFingers, currentPose.fingerCurl);
    curl(rig.lIndex, currentPose.indexCurl + INDEX_TAP * drumming);

    // Floating legs dangle
    if (rig.lThigh && rig.rThigh) {
      lThighQ.setFromAxisAngle(X_AXIS, Math.sin(time * 2.8) * 0.08);
      rThighQ.setFromAxisAngle(X_AXIS, Math.sin(time * 2.8 + Math.PI) * 0.08);
      applyCharacterRotation(rig.lThigh, lThighQ);
      applyCharacterRotation(rig.rThigh, rThighQ);
    }
    if (rig.lCalf && rig.rCalf) {
      lThighQ.setFromAxisAngle(X_AXIS, Math.max(0, Math.sin(time * 2.8)) * 0.12);
      rThighQ.setFromAxisAngle(X_AXIS, Math.max(0, Math.sin(time * 2.8 + Math.PI)) * 0.12);
      applyCharacterRotation(rig.lCalf, lThighQ);
      applyCharacterRotation(rig.rCalf, rThighQ);
    }
  }

  return {
    update,
    setPose,
    setSpeaking,
    flyTo,
    faceTowards,
    turnTowards,
    rollEyes,
    getMood: () => currentMood,
  };
}

/**
 * Builds Caine's idle animation (retained for backward compatibility).
 */
export function createCaineIdle(caine) {
  const animator = createCaineAnimator(caine);
  animator.setPose('ponder');
  return (deltaSeconds) => animator.update(deltaSeconds);
}

function buildRig(caine) {
  // Primary collection: proper Bone nodes (as set by GLTFLoader for skin joints).
  const bones = [];
  // Fallback collection: all named nodes, for models where some joints are
  // plain Object3Ds rather than THREE.Bone instances.
  const allNodes = [];
  caine.traverse((child) => {
    if (child.isBone) bones.push(child);
    if (child.name) allNodes.push(child);
  });
  const find = (name) => {
    // First try proper Bone nodes.
    let node = bones.find((b) => b.name.includes(name));
    // If not found as a Bone, try any named node (handles some GLTF exporters
    // that mark joints as plain Object3D instead of Bone).
    if (!node) node = allNodes.find((n) => n.name.includes(name)) ?? null;
    if (!node) {
      if (import.meta.env?.DEV) console.warn(`[Caine rig] bone not found: "${name}"`);
      return null;
    }
    return node;
  };

  const caineQ = caine.getWorldQuaternion(new THREE.Quaternion()).invert();
  const entry = (bone) => {
    if (!bone) return null;
    return {
      bone,
      restLocal: bone.quaternion.clone(),
      parentRest: bone.parent ? caineQ.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Quaternion(),
      restPosition: caine.worldToLocal(bone.getWorldPosition(new THREE.Vector3())),
    };
  };

  const rig = {};
  for (const [key, name] of Object.entries(BONE_NAMES)) {
    if (Array.isArray(name)) {
      rig[key] = name.map((n) => entry(find(n))).filter(Boolean);
    } else {
      rig[key] = entry(find(name));
    }
  }
  return rig;
}

function applyCharacterRotation(entry, rotation) {
  if (!entry || !entry.bone) return;
  const { bone, restLocal, parentRest } = entry;
  bone.quaternion
    .copy(parentRest)
    .invert()
    .multiply(rotation)
    .multiply(parentRest)
    .multiply(restLocal);
}

function armChain(upper, fore, hand, knuckle, palmRest) {
  if (!upper || !fore || !hand || !knuckle) {
    return {
      shoulder: new THREE.Vector3(),
      upperLength: 0.35,
      foreLength: 0.35,
      upperRestDir: new THREE.Vector3(0, -1, 0),
      foreRestDir: new THREE.Vector3(0, -1, 0),
      handRestInverse: new THREE.Matrix4(),
    };
  }
  const shoulder = upper.restPosition;
  const elbow = fore.restPosition;
  const wrist = hand.restPosition;
  return {
    shoulder,
    upperLength: shoulder.distanceTo(elbow),
    foreLength: elbow.distanceTo(wrist),
    upperRestDir: elbow.clone().sub(shoulder).normalize(),
    foreRestDir: wrist.clone().sub(elbow).normalize(),
    handRestInverse: handBasis(knuckle.restPosition.clone().sub(wrist), palmRest, new THREE.Matrix4()).transpose(),
  };
}

function handBasis(knuckleDir, palmDir, out) {
  const x = ik.basisX.copy(knuckleDir).normalize();
  const y = ik.basisY.copy(palmDir).addScaledVector(x, -palmDir.dot(x)).normalize();
  const z = ik.basisZ.crossVectors(x, y);
  return out.makeBasis(x, y, z);
}

const ik = {
  toTarget: new THREE.Vector3(),
  pole: new THREE.Vector3(),
  elbow: new THREE.Vector3(),
  dir: new THREE.Vector3(),
  inverse: new THREE.Quaternion(),
  basisX: new THREE.Vector3(),
  basisY: new THREE.Vector3(),
  basisZ: new THREE.Vector3(),
  handBasis: new THREE.Matrix4(),
};

function solveArm(chain, wristTarget, pole, handDir, palmDir, out) {
  const { shoulder, upperLength: a, foreLength: b } = chain;

  ik.toTarget.copy(wristTarget).sub(shoulder);
  const reach = THREE.MathUtils.clamp(ik.toTarget.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  ik.toTarget.normalize();

  const along = (a * a - b * b + reach * reach) / (2 * reach);
  const offset = Math.sqrt(Math.max(a * a - along * along, 0));
  ik.pole.copy(pole).addScaledVector(ik.toTarget, -pole.dot(ik.toTarget)).normalize();
  ik.elbow.copy(shoulder).addScaledVector(ik.toTarget, along).addScaledVector(ik.pole, offset);

  ik.dir.copy(ik.elbow).sub(shoulder).normalize();
  out.upper.setFromUnitVectors(chain.upperRestDir, ik.dir);

  ik.dir.copy(shoulder).addScaledVector(ik.toTarget, reach).sub(ik.elbow).normalize();
  ik.inverse.copy(out.upper).invert();
  out.fore.setFromUnitVectors(chain.foreRestDir, ik.dir.applyQuaternion(ik.inverse));

  handBasis(handDir, palmDir, ik.handBasis).multiply(chain.handRestInverse);
  out.hand.setFromRotationMatrix(ik.handBasis);
  ik.inverse.copy(out.upper).multiply(out.fore).invert();
  out.hand.premultiply(ik.inverse);
}

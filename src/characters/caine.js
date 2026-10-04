import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Everything (geometry, skins, textures) is embedded in the .gltf itself,
// so the sibling textures/ folder from the download is not needed.
const CAINE_URL = '../models/characters/caine-the-amazing-digital-circus/source/CAINE.gltf';

// The ringmaster towers over the cast, so he's scaled taller than the
// player (PLAYER_HEIGHT in main.js is 1.7).
const CAINE_HEIGHT = 2.6;

// Invisible cylinder the player collides with. The real meshes are a poor
// collider: the wall probe runs at shin height, where his legs are thin
// enough to slip between, and the skinned meshes move while he animates.
// The radius also keeps the player's camera clear of his overhanging head.
const COLLIDER_RADIUS = 0.45;

/**
 * Loads Caine and normalizes him so his origin sits on the floor between
 * his feet: the source model is ~3.6 units tall with an arbitrary origin,
 * so it's rescaled to CAINE_HEIGHT and recentred. Callers then only need
 * to set position (a floor point) and rotation.y.
 *
 * @returns {Promise<{ caine: THREE.Group, collider: THREE.Mesh }>}
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

        resolve({ caine, collider });
      },
      undefined,
      reject,
    );
  });
}

/**
 * Skinned meshes only fill their bone matrices on the first render, but
 * the bounding box above reads them before that — so refresh them by hand.
 */
function updateSkeletons(root) {
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    if (child.isSkinnedMesh) child.skeleton.update();
  });
}

// --- Idle "thinking" animation ---
//
// The model ships with no animation clips, so the idle is posed bone by
// bone. Bone axes in this (Source-engine-style) rig point every which way,
// so every pose below is written in Caine's own frame instead — +X is his
// left, +Y up, +Z the way he faces — and converted per bone. Arms are
// placed with two-bone IK, so the fist lands under his jaw no matter how
// the bones are oriented.

const BONE_NAMES = {
  spine: 'Spine2',
  head: 'Caine_Head_V3',
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
};

// At rest his arms hang with the palms facing his body.
const L_PALM_REST = new THREE.Vector3(-1, 0, 0);
const R_PALM_REST = new THREE.Vector3(1, 0, 0);
// Bending a hanging left finger about this axis curls it into the palm.
const L_CURL_AXIS = new THREE.Vector3(0, 0, -1);

// Cycle: look ahead, drift into thought, ponder, snap back out of it.
const LOOK_SECONDS = 3;
const ENTER_SECONDS = 1.1;
const PONDER_SECONDS = 5.5;
const EXIT_SECONDS = 0.8;
const CYCLE_SECONDS = LOOK_SECONDS + ENTER_SECONDS + PONDER_SECONDS + EXIT_SECONDS;

// Pondering pose, in Caine's frame (radians / metres). His head is one big
// set of jaws hinged at the back, so tipping it up much reads as a shout —
// the eyes do most of the looking up instead.
const HEAD_YAW = 0.42; // turn toward his left
const HEAD_PITCH = 0.12; // tip up
const HEAD_ROLL = 0.14; // tilt toward his left shoulder
const EYE_YAW = 0.35; // on top of the head turn
const EYE_PITCH = 0.55;

// Left fist props up his jaw. CHIN is the underside of the lower jaw at
// rest; it's carried along with the head turn so the fist stays under it.
const CHIN = new THREE.Vector3(0.01, 1.23, 0.33);
const FIST_HEIGHT = 0.25; // wrist to top of the curled fingers
const FIST_DIR = new THREE.Vector3(-0.1, 1, 0.1).normalize(); // wrist → knuckles
const FIST_PALM = new THREE.Vector3(-0.3, 0, -1).normalize(); // back of hand faces out
const FIST_ELBOW_POLE = new THREE.Vector3(0.7, -1, -0.1);
const FINGER_CURL = 0.75; // per joint
const INDEX_CURL = 0.45; // index stays looser so it can tap
const INDEX_TAP = 0.35;

// Right hand cups the left elbow, palm up.
const PROP_WRIST = new THREE.Vector3(0.02, 0.86, 0.17);
const PROP_DIR = new THREE.Vector3(1, 0.05, 0.1).normalize();
const PROP_PALM = new THREE.Vector3(0, 1, 0);
const PROP_ELBOW_POLE = new THREE.Vector3(-0.8, -1, -0.2);

const IDENTITY = new THREE.Quaternion();

/**
 * Builds Caine's idle animation. Call the returned function every frame
 * with the frame's delta in seconds.
 *
 * @param {THREE.Group} caine the group from loadCaine(), already placed
 * @returns {(deltaSeconds: number) => void}
 */
export function createCaineIdle(caine) {
  caine.updateMatrixWorld(true);
  const rig = buildRig(caine);
  const lArm = armChain(rig.lUpperArm, rig.lForearm, rig.lHand, rig.lKnuckle, L_PALM_REST);
  const rArm = armChain(rig.rUpperArm, rig.rForearm, rig.rHand, rig.rKnuckle, R_PALM_REST);
  const headPivot = rig.head.restPosition;

  const headQ = new THREE.Quaternion();
  const eyeQ = new THREE.Quaternion();
  const breathQ = new THREE.Quaternion();
  const curlQ = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const wrist = new THREE.Vector3();
  const lPose = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), hand: new THREE.Quaternion() };
  const rPose = { upper: new THREE.Quaternion(), fore: new THREE.Quaternion(), hand: new THREE.Quaternion() };
  const blended = new THREE.Quaternion();

  // The prop arm never changes, so it's solved once.
  solveArm(rArm, PROP_WRIST, PROP_ELBOW_POLE, PROP_DIR, PROP_PALM, rPose);

  let time = 0;

  const pose = (entry, target, weight) => {
    blended.slerpQuaternions(IDENTITY, target, weight);
    applyCharacterRotation(entry, blended);
  };
  const curl = (entries, angle) => {
    curlQ.setFromAxisAngle(L_CURL_AXIS, angle);
    for (const entry of entries) applyCharacterRotation(entry, curlQ);
  };

  return function update(deltaSeconds) {
    time += deltaSeconds;
    const weight = thinkWeight(time % CYCLE_SECONDS);
    // Slow wander layered on the pondering pose so it never freezes.
    const wander = time * 0.9;

    breathQ.setFromEuler(euler.set(Math.sin(time * 1.6) * 0.02, Math.sin(time * 0.7) * 0.015, 0));
    applyCharacterRotation(rig.spine, breathQ);

    headQ.setFromEuler(euler.set(
      -HEAD_PITCH + Math.sin(wander * 1.3) * 0.04,
      HEAD_YAW + Math.sin(wander * 0.8) * 0.07,
      -HEAD_ROLL + Math.sin(wander * 0.6) * 0.06,
    ));
    pose(rig.head, headQ, weight);

    eyeQ.setFromEuler(euler.set(
      -EYE_PITCH + Math.sin(wander * 2.1) * 0.05,
      EYE_YAW + Math.sin(wander * 1.7) * 0.08,
      0,
    ));
    pose(rig.leftEye, eyeQ, weight);
    pose(rig.rightEye, eyeQ, weight);

    wrist.copy(CHIN).sub(headPivot).applyQuaternion(headQ).add(headPivot)
      .addScaledVector(FIST_DIR, -FIST_HEIGHT);
    solveArm(lArm, wrist, FIST_ELBOW_POLE, FIST_DIR, FIST_PALM, lPose);
    pose(rig.lUpperArm, lPose.upper, weight);
    pose(rig.lForearm, lPose.fore, weight);
    pose(rig.lHand, lPose.hand, weight);

    pose(rig.rUpperArm, rPose.upper, weight);
    pose(rig.rForearm, rPose.fore, weight);
    pose(rig.rHand, rPose.hand, weight);

    // "Hmm...": the index finger drums twice against the jaw, then rests.
    const drumming = Math.sin(time * 1.4) > 0.3 ? Math.max(0, Math.sin(time * 9)) : 0;
    curl(rig.lFingers, FINGER_CURL * weight);
    curl(rig.lIndex, (INDEX_CURL + INDEX_TAP * drumming) * weight);
  };
}

/** 0 while looking ahead, eased up to 1 while pondering, and back. */
function thinkWeight(t) {
  if (t < LOOK_SECONDS) return 0;
  t -= LOOK_SECONDS;
  if (t < ENTER_SECONDS) return smootherstep(t / ENTER_SECONDS);
  t -= ENTER_SECONDS;
  if (t < PONDER_SECONDS) return 1;
  t -= PONDER_SECONDS;
  return 1 - smootherstep(t / EXIT_SECONDS);
}

function smootherstep(x) {
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Records, for each animated bone, its rest local rotation, its parent's
 * rest rotation and its own rest position, both in Caine's frame — what
 * applyCharacterRotation needs to turn a Caine-frame rotation into a
 * bone-local one.
 */
function buildRig(caine) {
  const bones = [];
  caine.traverse((child) => {
    if (child.isBone) bones.push(child);
  });
  const find = (name) => {
    const bone = bones.find((b) => b.name.includes(name));
    if (!bone) throw new Error(`Caine rig is missing bone "${name}"`);
    return bone;
  };

  const caineQ = caine.getWorldQuaternion(new THREE.Quaternion()).invert();
  const entry = (bone) => ({
    bone,
    restLocal: bone.quaternion.clone(),
    parentRest: caineQ.clone().multiply(bone.parent.getWorldQuaternion(new THREE.Quaternion())),
    restPosition: caine.worldToLocal(bone.getWorldPosition(new THREE.Vector3())),
  });

  const rig = {};
  for (const [key, name] of Object.entries(BONE_NAMES)) {
    rig[key] = Array.isArray(name) ? name.map((n) => entry(find(n))) : entry(find(name));
  }
  return rig;
}

/**
 * Sets a bone so that, relative to its rest pose, it is rotated by `rotation`
 * expressed in Caine's frame. Children inherit it, so chained rotations
 * compose as parent * child, each about the bone's own rest pivot.
 */
function applyCharacterRotation({ bone, restLocal, parentRest }, rotation) {
  bone.quaternion
    .copy(parentRest)
    .invert()
    .multiply(rotation)
    .multiply(parentRest)
    .multiply(restLocal);
}

function armChain(upper, fore, hand, knuckle, palmRest) {
  const shoulder = upper.restPosition;
  const elbow = fore.restPosition;
  const wrist = hand.restPosition;
  return {
    shoulder,
    upperLength: shoulder.distanceTo(elbow),
    foreLength: elbow.distanceTo(wrist),
    upperRestDir: elbow.clone().sub(shoulder).normalize(),
    foreRestDir: wrist.clone().sub(elbow).normalize(),
    // Rotation bases are orthonormal, so the transpose is the inverse.
    handRestInverse: handBasis(knuckle.restPosition.clone().sub(wrist), palmRest, new THREE.Matrix4()).transpose(),
  };
}

/** Rotation basis for a hand: columns are knuckle dir, palm normal, and their cross. */
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

/**
 * Two-bone IK in Caine's frame: puts the wrist on `wristTarget` with the
 * elbow bending toward `pole`, then orients the hand so its knuckles point
 * along `handDir` with the palm facing `palmDir`. Writes the upper arm /
 * forearm / hand rotations into `out`, already in the chained form
 * applyCharacterRotation expects.
 */
function solveArm(chain, wristTarget, pole, handDir, palmDir, out) {
  const { shoulder, upperLength: a, foreLength: b } = chain;

  ik.toTarget.copy(wristTarget).sub(shoulder);
  const reach = THREE.MathUtils.clamp(ik.toTarget.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
  ik.toTarget.normalize();

  // Elbow lies `along` the shoulder→wrist line, `offset` off it toward the pole.
  const along = (a * a - b * b + reach * reach) / (2 * reach);
  const offset = Math.sqrt(Math.max(a * a - along * along, 0));
  ik.pole.copy(pole).addScaledVector(ik.toTarget, -pole.dot(ik.toTarget)).normalize();
  ik.elbow.copy(shoulder).addScaledVector(ik.toTarget, along).addScaledVector(ik.pole, offset);

  ik.dir.copy(ik.elbow).sub(shoulder).normalize();
  out.upper.setFromUnitVectors(chain.upperRestDir, ik.dir);

  ik.dir.copy(shoulder).addScaledVector(ik.toTarget, reach).sub(ik.elbow).normalize();
  ik.inverse.copy(out.upper).invert();
  out.fore.setFromUnitVectors(chain.foreRestDir, ik.dir.applyQuaternion(ik.inverse));

  // Whole-hand rotation (target basis * rest basis⁻¹), minus what the arm
  // above it already contributes.
  handBasis(handDir, palmDir, ik.handBasis).multiply(chain.handRestInverse);
  out.hand.setFromRotationMatrix(ik.handBasis);
  ik.inverse.copy(out.upper).multiply(out.fore).invert();
  out.hand.premultiply(ik.inverse);
}

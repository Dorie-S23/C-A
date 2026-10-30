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
// mattress where her hips go, turned so -Z points at the pillow.
//   roll:  turn onto her side (radians about her long axis; - faces +X,
//          the open side of her bed, where Pomni comes in)
//   spine: forward bend at the hips; π/2 brings her torso upright
//   head:  extra bow of the head
//   hip:   thighs drawn up toward her chest (radians of hip flexion)
//   knee:  shins folded back under the thighs
//   arms:  upper arms brought forward, in toward her knees
// The exported rig has no leg bones; addLegBones gives her thighs and
// shins at load time, so 'curled' is properly curled up asleep and sitting
// up draws her knees up instead of leaving both legs sticking out stiff.
const POSES = {
  standing: { lying: false, roll: 0, spine: 0, head: 0, hip: 0, knee: 0, arms: 0 },
  // On her side facing the room, knees drawn up, hands tucked by her face.
  curled: { lying: true, roll: -Math.PI / 2, spine: 0.55, head: 0.4, hip: 1.65, knee: 2.1, arms: 0.8 },
  // Passed through on the way from curled to sitting (see setPose): she
  // rolls onto her back and her legs loosen before she pushes herself up.
  // Arms back down at her sides: "forward" points them at the ceiling once
  // she's on her back.
  waking: { lying: true, roll: -0.2, spine: 0.35, head: 0.15, hip: 0.9, knee: 1.3, arms: 0 },
  sitting: { lying: true, roll: 0, spine: Math.PI / 2, head: 0.12, hip: 0.85, knee: 1.55, arms: 0.55 },
};
const POSE_SHARPNESS = 1.4; // slow on purpose: "sits up slowly"
// Her arms settle faster than her body, so they're already down at her
// sides by the time rolling onto her back would swing them up.
const ARM_SHARPNESS = 4;
const WAKING_SECONDS = 1.1; // how long she lingers in 'waking' before sitting up
const LYING_LIFT = 0.13;    // her body's half-thickness above the mattress

// Where addLegBones puts her joints, in the model's own (bind) space:
// measured from ribbit-rigged.glb, whose legs are separate meshes-in-one
// from the floor up to the crotch (≈0.88 m), centred at x ≈ ±0.105.
const HIP_JOINT = { x: 0.105, y: 0.86, z: -0.04 };
const KNEE_JOINT = { x: 0.105, y: 0.49, z: -0.03 };
// Vertex weights blend between bones across these height bands, so the
// skin bends smoothly at the hip and knee instead of creasing.
const HIP_BLEND = [0.8, 0.93];   // [all thigh below, all hips above]
const KNEE_BLEND = [0.42, 0.56]; // [all shin below, all thigh above]
const LEG_TOP = 0.95;            // only vertices below this are legs

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
    const legs = addLegBones(model);
    // glTF names lose their '.' on import (upper_arm.L -> upper_armL).
    const arms = ['upper_armL', 'upper_armR'].map((name) => model.getObjectByName(name));
    // The spine bone starts at her pelvis: the point the bed poses pivot on.
    model.updateMatrixWorld(true);
    const pelvisHeight = spine ? spine.getWorldPosition(new THREE.Vector3()).y : RIBBIT_HEIGHT * 0.41;

    let targetYaw = null;
    const ownPosition = new THREE.Vector3();
    let distress = 0;
    let distressTarget = 0;
    let time = 0;

    let pose = POSES.standing;
    let queued = null; // { pose, in: seconds } — sitting, while passing through waking
    const current = { roll: 0, spine: 0, head: 0, hip: 0, knee: 0, arms: 0 };
    const POSE_KEYS = Object.keys(current);
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

      if (queued && (queued.in -= deltaSeconds) <= 0) {
        pose = queued.pose;
        queued = null;
      }
      for (const key of POSE_KEYS) {
        const sharpness = key === 'arms' ? ARM_SHARPNESS : POSE_SHARPNESS;
        current[key] = THREE.MathUtils.damp(current[key], pose[key], sharpness, deltaSeconds);
      }
      placeBody();

      distress = THREE.MathUtils.damp(distress, distressTarget, DISTRESS_SHARPNESS, deltaSeconds);
      bendBone(spine, body, SIDEWAYS, current.spine + HUNCH_PER_LEVEL * distress);
      bendBone(head, body, SIDEWAYS, current.head + HEAD_DROP_PER_LEVEL * distress);
      if (legs) {
        // The Idle clip doesn't key these bones, so nothing resets them
        // each frame the way the mixer does the others: start from rest.
        for (const bone of legs.all) bone.quaternion.identity();
        // A hanging leg swings forward with a negative angle (bendBone's guide).
        for (const thigh of legs.thighs) bendBone(thigh, body, SIDEWAYS, -current.hip);
        for (const shin of legs.shins) bendBone(shin, body, SIDEWAYS, current.knee);
      }
      for (const arm of arms) bendBone(arm, body, SIDEWAYS, -current.arms);
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
     * there's no animation for lying down. Sitting up from curled goes by
     * way of 'waking', so she stirs and rolls over before sitting up rather
     * than levitating straight from asleep on her side to upright.
     */
    function setPose(name, { immediate = false } = {}) {
      const next = POSES[name];
      if (!next) throw new Error(`Unknown Ribbit pose: ${name}`);
      const snap = immediate || next.lying !== pose.lying;
      queued = null;
      if (!snap && next === POSES.sitting && pose === POSES.curled) {
        pose = POSES.waking;
        queued = { pose: next, in: WAKING_SECONDS };
        return;
      }
      pose = next;
      if (snap) {
        for (const key of POSE_KEYS) current[key] = next[key];
        placeBody();
      }
    }

    function dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
    }

    return {
      ribbit, collider, update, faceTowards, setDistress, setPose, dispose,
      rig: { body, head, arms: arms.filter(Boolean), legs: legs?.thighs ?? [] },
    };
  });
}

/**
 * Gives the rig thigh and shin bones and moves the leg vertices onto them,
 * blending across the hip and knee (HIP_BLEND, KNEE_BLEND), so her legs can
 * bend. All her skinned meshes share one skeleton; only the body mesh has
 * leg vertices. Returns null — straight legs, as before — if the model no
 * longer looks like the one these measurements came from.
 */
function addLegBones(model) {
  const meshes = [];
  model.traverse((child) => { if (child.isSkinnedMesh) meshes.push(child); });
  const skeleton = meshes[0]?.skeleton;
  const hips = skeleton?.getBoneByName('hips');
  const body = meshes.find((mesh) => {
    const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox);
    return box.min.y < 0.05;
  });
  if (!hips || !body || meshes.some((mesh) => mesh.skeleton !== skeleton)) return null;

  const hipsIndex = skeleton.bones.indexOf(hips);
  const hipsInverse = skeleton.boneInverses[hipsIndex];
  // A point in the body mesh's geometry, in the hips bone's own frame at rest.
  const inHips = (p) => new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(body.bindMatrix).applyMatrix4(hipsInverse);

  const bones = [...skeleton.bones];
  const inverses = [...skeleton.boneInverses];
  const sides = {};
  for (const [side, sign] of [['L', 1], ['R', -1]]) {
    const hip = inHips({ ...HIP_JOINT, x: HIP_JOINT.x * sign });
    const knee = inHips({ ...KNEE_JOINT, x: KNEE_JOINT.x * sign });
    const thigh = new THREE.Bone();
    thigh.name = `thigh${side}`;
    thigh.position.copy(hip);
    hips.add(thigh);
    const shin = new THREE.Bone();
    shin.name = `shin${side}`;
    shin.position.copy(knee).sub(hip);
    thigh.add(shin);
    // Each new bone, unrotated relative to the hips, sits at its joint: its
    // inverse bind matrix is the hips' one moved to that joint, so at rest
    // it skins every vertex to exactly where the hips would.
    bones.push(thigh, shin);
    inverses.push(
      new THREE.Matrix4().makeTranslation(-hip.x, -hip.y, -hip.z).multiply(hipsInverse),
      new THREE.Matrix4().makeTranslation(-knee.x, -knee.y, -knee.z).multiply(hipsInverse),
    );
    sides[side] = { thigh: bones.length - 2, shin: bones.length - 1, thighBone: thigh, shinBone: shin };
  }

  const position = body.geometry.attributes.position;
  const skinIndex = body.geometry.attributes.skinIndex;
  const skinWeight = body.geometry.attributes.skinWeight;
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    if (y >= LEG_TOP) continue;
    let dominant = 0;
    for (let k = 1; k < 4; k++) if (skinWeight.getComponent(i, k) > skinWeight.getComponent(i, dominant)) dominant = k;
    if (skinIndex.getComponent(i, dominant) !== hipsIndex) continue;
    const side = sides[position.getX(i) >= 0 ? 'L' : 'R'];
    const toThigh = 1 - THREE.MathUtils.smoothstep(y, HIP_BLEND[0], HIP_BLEND[1]);
    const toShin = 1 - THREE.MathUtils.smoothstep(y, KNEE_BLEND[0], KNEE_BLEND[1]);
    skinIndex.setXYZW(i, hipsIndex, side.thigh, side.shin, 0);
    skinWeight.setXYZW(i, 1 - toThigh, toThigh * (1 - toShin), toThigh * toShin, 0);
  }
  skinIndex.needsUpdate = true;
  skinWeight.needsUpdate = true;

  const extended = new THREE.Skeleton(bones, inverses);
  for (const mesh of meshes) mesh.bind(extended, mesh.bindMatrix);
  return {
    thighs: [sides.L.thighBone, sides.R.thighBone],
    shins: [sides.L.shinBone, sides.R.shinBone],
    all: [sides.L.thighBone, sides.L.shinBone, sides.R.thighBone, sides.R.shinBone],
  };
}

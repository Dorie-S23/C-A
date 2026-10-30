import * as THREE from 'three';

/**
 * Plays `clip` on `source` and re-expresses it on `target`, bone by bone
 * (matched by name), sampled at 30 samples per second. `sourceBoneForTarget`
 * can map differently named rigs; `decorate` can attach clip-specific data.
 */
export function retargetClip(source, clip, target, name, {
  targetHipsName = 'mixamorigHips',
  sourceBoneForTarget = (boneName, sourceBones) => sourceBones.get(boneName),
  decorate = () => {},
} = {}) {
  const sourceBones = new Map();
  source.traverse((object) => { if (object.isBone) sourceBones.set(object.name, object); });
  const targetBones = [];
  target.traverse((object) => { if (object.isBone) targetBones.push(object); });
  const sourceHips = sourceBones.get('mixamorigHips');
  const targetHips = target.getObjectByName(targetHipsName);
  if (!sourceHips || !targetHips) throw new Error('No hips to retarget between');

  const saved = targetBones.map((bone) => [bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()]);
  bindPose(source);
  bindPose(target);
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const restWorld = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
  const sourceRest = new Map([...sourceBones].map(([boneName, bone]) => [boneName, restWorld(bone)]));
  const sourceRestInverse = new Map([...sourceRest].map(([boneName, quaternion]) => [boneName, quaternion.clone().invert()]));
  const targetRest = new Map(targetBones.map((bone) => [bone, restWorld(bone)]));
  const targetRestLocal = new Map(targetBones.map((bone) => [bone, bone.quaternion.clone()]));
  const sourceHipsRest = sourceHips.getWorldPosition(new THREE.Vector3());
  const targetHipsRest = targetHips.getWorldPosition(new THREE.Vector3());
  const targetFloor = new THREE.Box3().setFromObject(target).min.y;
  const sourceHipHeight = sourceHipsRest.y - new THREE.Box3().setFromObject(source).min.y;
  const targetHipHeight = targetHipsRest.y - targetFloor;
  const scale = targetHipHeight / sourceHipHeight;
  const hipsParent = targetHips.parent;
  const parentInverse = new THREE.Matrix4().copy(hipsParent.matrixWorld).invert();

  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const count = Math.max(2, Math.round(clip.duration * 30));
  const times = Array.from({ length: count + 1 }, (_, index) => (clip.duration * index) / count);
  const rotations = new Map(targetBones.map((bone) => [bone, []]));
  const hipsPositions = [];
  const footHeights = [];
  const leftFoot = sourceBones.get('mixamorigLeftToeBase') ?? sourceBones.get('mixamorigLeftFoot');
  const rightFoot = sourceBones.get('mixamorigRightToeBase') ?? sourceBones.get('mixamorigRightFoot');
  const restFootY = Math.min(leftFoot?.getWorldPosition(new THREE.Vector3()).y ?? 0, rightFoot?.getWorldPosition(new THREE.Vector3()).y ?? 0);
  let firstHips = null;
  let lastHips = null;

  const world = new Map();
  const turned = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const point = new THREE.Vector3();
  for (const time of times) {
    mixer.setTime(Math.min(time, clip.duration - 1e-4));
    source.updateMatrixWorld(true);
    world.clear();
    for (const bone of targetBones) {
      const parentWorld = world.get(bone.parent) ?? bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const match = sourceBoneForTarget(bone.name, sourceBones);
      let boneWorld;
      if (match) {
        boneWorld = match.getWorldQuaternion(turned).multiply(sourceRestInverse.get(match.name)).multiply(targetRest.get(bone)).clone();
      } else {
        boneWorld = parentWorld.clone().multiply(targetRestLocal.get(bone));
      }
      world.set(bone, boneWorld);
      local.copy(parentWorld).invert().multiply(boneWorld);
      rotations.get(bone).push(local.x, local.y, local.z, local.w);
    }
    const hips = sourceHips.getWorldPosition(point);
    firstHips ??= hips.clone();
    lastHips = hips.clone();
    const rise = (hips.y - sourceHipsRest.y) * scale;
    const up = targetHipsRest.clone().setY(targetHipsRest.y + rise).applyMatrix4(parentInverse);
    hipsPositions.push(up.x, up.y, up.z);
    const leftY = leftFoot?.getWorldPosition(point).y ?? restFootY;
    const rightY = rightFoot?.getWorldPosition(point).y ?? restFootY;
    footHeights.push((Math.min(leftY, rightY) - restFootY) / sourceHipHeight);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  for (const [bone, position, quaternion, boneScale] of saved) {
    bone.position.copy(position);
    bone.quaternion.copy(quaternion);
    bone.scale.copy(boneScale);
  }
  target.updateMatrixWorld(true);

  const tracks = targetBones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations.get(bone)));
  tracks.push(new THREE.VectorKeyframeTrack(`${targetHips.name}.position`, times, hipsPositions));
  const result = new THREE.AnimationClip(name, clip.duration, tracks);
  const travel = Math.hypot(lastHips.x - firstHips.x, lastHips.z - firstHips.z);
  result.userData = { speedPerHipHeight: travel / sourceHipHeight / clip.duration };
  decorate(result, { footHeights, times });
  return result;
}

/** Restores the actual bound pose, including rigs under rotated/scaled armatures. */
function bindPose(root) {
  root.updateMatrixWorld(true);
  const bound = new Map();
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    object.skeleton.bones.forEach((bone, index) => {
      if (!bound.has(bone)) bound.set(bone, object.bindMatrix.clone().multiply(object.skeleton.boneInverses[index].clone().invert()));
    });
  });
  root.traverse((bone) => {
    const world = bound.get(bone);
    if (!world) return;
    bone.matrix.copy(bone.parent.matrixWorld).invert().multiply(world);
    bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrixWorld(true);
  });
}
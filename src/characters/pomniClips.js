import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

// Mixamo animations for Pomni, from the .fbx files in her folder: which
// clip of hers each one becomes. They were made on a different Mixamo
// character (shorter, its own bone rolls), so they're retargeted onto her
// rig (see retarget) rather than played as they are. The paths are spelled
// out in full so tools/package.mjs, which ships only the asset paths the
// bundle mentions, takes these three files and not the whole folder.
export const POMNI_FBX_CLIPS = {
  Walk: './models/characters/pomni/Standard%20Walk.fbx',
  Run: './models/characters/pomni/Running.fbx',
  Jump: './models/characters/pomni/Jumping.fbx',
};
const SAMPLES_PER_SECOND = 30;
// How high a foot rises off the floor, as a fraction of hip height, before
// she counts as in the air (for finding a jump's take-off and landing).
const AIRBORNE_FOOT_LIFT = 0.12;

/**
 * Loads POMNI_FBX_CLIPS and retargets each onto `model` (her glTF scene, in
 * its rest pose). Resolves to clips named as the keys; any file that won't
 * load is left out (with a warning), so she falls back to her own clip.
 * @returns {Promise<THREE.AnimationClip[]>}
 */
export async function loadPomniClips(model) {
  const loader = new FBXLoader();
  const loaded = await Promise.all(Object.entries(POMNI_FBX_CLIPS).map(async ([name, file]) => {
    try {
      const source = await loader.loadAsync(file);
      const clip = retarget(source, source.animations[0], model, name);
      disposeSource(source);
      return clip;
    } catch (error) {
      console.warn(`Pomni's "${file}" animation could not be loaded; keeping her own ${name}.`, error);
      return null;
    }
  }));
  return loaded.filter(Boolean);
}

/** The FBX also carries its own character's mesh and textures: free them. */
function disposeSource(source) {
  source.traverse((object) => {
    object.geometry?.dispose();
    for (const material of [object.material].flat()) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
      material.dispose();
    }
  });
}

/**
 * Plays `clip` on `source` and re-expresses it on `target`, bone by bone
 * (matched by name), sampled at SAMPLES_PER_SECOND.
 *
 * Both rigs rest in a T-pose, but their bones point their own ways, so
 * local rotations can't be copied across. Instead each source bone's turn
 * away from its rest, in world terms, is applied to the target bone's rest:
 *   world_target = world_source · rest_source⁻¹ · rest_target
 * and then taken back into the target bone's parent. Bones the clip
 * doesn't move (her fingers) keep their rest. The hips' height follows the
 * source's bob, scaled by hip height; its travel along the floor is
 * dropped (the game moves her), but its speed is kept on the clip as
 * userData.speedPerHipHeight, so her steps can match how fast she goes.
 */
function retarget(source, clip, target, name) {
  const sourceBones = new Map();
  source.traverse((object) => { if (object.isBone) sourceBones.set(object.name, object); });
  const targetBones = [];
  target.traverse((object) => { if (object.isBone) targetBones.push(object); });
  const sourceHips = sourceBones.get('mixamorigHips');
  const targetHips = target.getObjectByName('mixamorigHips');
  if (!sourceHips || !targetHips) throw new Error('No mixamorigHips to retarget between');

  // Rest poses, in world terms: each rig's bind pose (the T-pose its mesh
  // was skinned in), not whatever pose its file happened to leave it in.
  const saved = targetBones.map((bone) => [bone, bone.position.clone(), bone.quaternion.clone(), bone.scale.clone()]);
  bindPose(source);
  bindPose(target);
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const restWorld = (bone) => bone.getWorldQuaternion(new THREE.Quaternion());
  const sourceRest = new Map([...sourceBones].map(([boneName, bone]) => [boneName, restWorld(bone)]));
  const sourceRestInverse = new Map([...sourceRest].map(([boneName, q]) => [boneName, q.clone().invert()]));
  const targetRest = new Map(targetBones.map((bone) => [bone, restWorld(bone)]));
  const targetRestLocal = new Map(targetBones.map((bone) => [bone, bone.quaternion.clone()]));
  const sourceHipsRest = sourceHips.getWorldPosition(new THREE.Vector3());
  const targetHipsRest = targetHips.getWorldPosition(new THREE.Vector3());
  const targetFloor = new THREE.Box3().setFromObject(target).min.y;
  const sourceHipHeight = sourceHipsRest.y - new THREE.Box3().setFromObject(source).min.y;
  const targetHipHeight = targetHipsRest.y - targetFloor;
  const scale = targetHipHeight / sourceHipHeight;
  // Up, in the hips' parent's frame (its scale and turn), for the bob.
  const hipsParent = targetHips.parent;
  const parentInverse = new THREE.Matrix4().copy(hipsParent.matrixWorld).invert();

  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const count = Math.max(2, Math.round(clip.duration * SAMPLES_PER_SECOND));
  const times = Array.from({ length: count + 1 }, (_, i) => (clip.duration * i) / count);
  const rotations = new Map(targetBones.map((bone) => [bone, []]));
  const hipsPositions = [];
  const footHeights = [];
  const leftFoot = sourceBones.get('mixamorigLeftToeBase') ?? sourceBones.get('mixamorigLeftFoot');
  const rightFoot = sourceBones.get('mixamorigRightToeBase') ?? sourceBones.get('mixamorigRightFoot');
  const restFootY = Math.min(leftFoot?.getWorldPosition(new THREE.Vector3()).y ?? 0, rightFoot?.getWorldPosition(new THREE.Vector3()).y ?? 0);
  let firstHips = null, lastHips = null;

  const world = new Map();
  const turned = new THREE.Quaternion(), local = new THREE.Quaternion(), point = new THREE.Vector3();
  for (const time of times) {
    mixer.setTime(Math.min(time, clip.duration - 1e-4));
    source.updateMatrixWorld(true);
    world.clear();
    // Parents come before children in traverse order, so each bone's
    // parent already has its new world rotation here.
    for (const bone of targetBones) {
      const parentWorld = world.get(bone.parent) ?? bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const match = sourceBones.get(bone.name);
      let boneWorld;
      if (match) {
        boneWorld = match.getWorldQuaternion(turned).multiply(sourceRestInverse.get(bone.name)).multiply(targetRest.get(bone)).clone();
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
    // Just the bob: the source hips' rise over their rest, at her size.
    const rise = (hips.y - sourceHipsRest.y) * scale;
    const up = targetHipsRest.clone().setY(targetHipsRest.y + rise).applyMatrix4(parentInverse);
    hipsPositions.push(up.x, up.y, up.z);
    const leftY = leftFoot?.getWorldPosition(point).y ?? restFootY;
    const rightY = rightFoot?.getWorldPosition(point).y ?? restFootY;
    footHeights.push((Math.min(leftY, rightY) - restFootY) / sourceHipHeight);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(source);
  // Back as it was, for the next clip and for normalize().
  for (const [bone, position, quaternion, boneScale] of saved) {
    bone.position.copy(position); bone.quaternion.copy(quaternion); bone.scale.copy(boneScale);
  }
  target.updateMatrixWorld(true);

  const tracks = targetBones.map((bone) => new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, rotations.get(bone)));
  tracks.push(new THREE.VectorKeyframeTrack(`${targetHips.name}.position`, times, hipsPositions));
  const result = new THREE.AnimationClip(name, clip.duration, tracks);

  const travel = Math.hypot(lastHips.x - firstHips.x, lastHips.z - firstHips.z);
  result.userData = { speedPerHipHeight: travel / sourceHipHeight / clip.duration };
  if (name === 'Jump') Object.assign(result.userData, airborneSpan(footHeights, times));
  return result;
}

/**
 * Puts every skinned mesh's bones under `root` into the pose it was bound
 * in. A bone's bound world matrix is bindMatrix · boneInverse⁻¹: three's own
 * Skeleton.pose() leaves out the bindMatrix, which for a rig under a turned
 * and scaled armature (hers: 90° and 1/100) poses it turned on its side.
 */
function bindPose(root) {
  root.updateMatrixWorld(true);
  const bound = new Map();
  root.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    object.skeleton.bones.forEach((bone, i) => {
      if (!bound.has(bone)) bound.set(bone, object.bindMatrix.clone().multiply(object.skeleton.boneInverses[i].clone().invert()));
    });
  });
  // Parents first (traverse order), so each bone's parent is already posed.
  root.traverse((bone) => {
    const world = bound.get(bone);
    if (!world) return;
    bone.matrix.copy(bone.parent.matrixWorld).invert().multiply(world);
    bone.matrix.decompose(bone.position, bone.quaternion, bone.scale);
    bone.updateMatrixWorld(true);
  });
}

/** When a jump clip's feet leave the floor and come back down (seconds). */
function airborneSpan(footHeights, times) {
  const up = footHeights.findIndex((height) => height > AIRBORNE_FOOT_LIFT);
  if (up < 0) return { takeoff: 0, landing: times.at(-1) };
  let down = footHeights.findIndex((height, i) => i > up && height <= AIRBORNE_FOOT_LIFT);
  if (down < 0) down = footHeights.length - 1;
  return { takeoff: times[Math.max(0, up - 1)], landing: times[down] };
}

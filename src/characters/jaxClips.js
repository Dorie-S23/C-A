import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetClip } from './retargetClip.js';

const JAX_FBX_CLIPS = {
  walk: './models/characters/pomni/Standard%20Walk.fbx',
  run: './models/characters/pomni/Running.fbx',
};

const TARGET_TO_MIXAMO = {
  hips: 'Hips', spine: 'Spine', chest: 'Spine1', neck: 'Neck', head: 'Head',
  shoulderl: 'LeftShoulder', upperarml: 'LeftArm', lowerarml: 'LeftForeArm', handl: 'LeftHand',
  upperlegl: 'LeftUpLeg', lowerlegl: 'LeftLeg', footl: 'LeftFoot', toesl: 'LeftToeBase',
  shoulderr: 'RightShoulder', upperarmr: 'RightArm', lowerarmr: 'RightForeArm', handr: 'RightHand',
  upperlegr: 'RightUpLeg', lowerlegr: 'RightLeg', footr: 'RightFoot', toesr: 'RightToeBase',
};

function sourceBoneForTarget(targetName, sourceBones) {
  const normalized = targetName.toLowerCase().replace(/[^a-z]/g, '');
  const suffix = normalized.replace(/\d+$/g, '');
  const mixamoName = TARGET_TO_MIXAMO[suffix];
  return mixamoName ? sourceBones.get(`mixamorig${mixamoName}`) : null;
}

function lowerArms(clip, model) {
  const lowered = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(-90),
  );
  for (const prefix of ['upperarml', 'upperarmr']) {
    const bone = findBone(model, prefix);
    const track = clip.tracks.find((candidate) => candidate.name === `${bone?.name}.quaternion`);
    if (!track) continue;
    const rotation = new THREE.Quaternion();
    for (let offset = 0; offset < track.values.length; offset += 4) {
      rotation.fromArray(track.values, offset).premultiply(lowered).toArray(track.values, offset);
    }
  }
  return clip;
}

function findBone(root, prefix) {
  let found = null;
  root.traverse((object) => {
    if (found || !object.isBone) return;
    const normalized = object.name.toLowerCase().replace(/[^a-z]/g, '');
    if (normalized.startsWith(prefix)) found = object;
  });
  return found;
}

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

export async function loadJaxClips(model) {
  const loader = new FBXLoader();
  const loaded = await Promise.all(Object.entries(JAX_FBX_CLIPS).map(async ([name, file]) => {
    try {
      const source = await loader.loadAsync(file);
      try {
        return (retargetClip(source, source.animations[0], model, name, {
          targetHipsName: 'hips_58_10',
          sourceBoneForTarget,
          // His arms don't rest as Mixamo's T-pose does.
          matchRestDirections: true,
        }));
      } finally {
        disposeSource(source);
      }
    } catch (error) {
      console.warn(`Jax's "${file}" animation could not be loaded; keeping his procedural ${name}.`, error);
      return null;
    }
  }));
  return loaded.filter(Boolean);
}
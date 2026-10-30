import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetClip } from './retargetClip.js';

// Mixamo animations for Pomni, from the .fbx files in her folder: which
// clip of hers each one becomes. They were made on a different Mixamo
// character (shorter, its own bone rolls), so they're retargeted onto her
// rig rather than played as they are. The paths are spelled
// out in full so tools/package.mjs, which ships only the asset paths the
// bundle mentions, takes these three files and not the whole folder.
export const POMNI_FBX_CLIPS = {
  Walk: './models/characters/pomni/Standard%20Walk.fbx',
  Run: './models/characters/pomni/Running.fbx',
  Jump: './models/characters/pomni/Jumping.fbx',
};
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
      const clip = retargetClip(source, source.animations[0], model, name, {
        decorate: (result, { footHeights, times }) => {
          if (name === 'Jump') Object.assign(result.userData, airborneSpan(footHeights, times));
        },
      });
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

/** When a jump clip's feet leave the floor and come back down (seconds). */
function airborneSpan(footHeights, times) {
  const up = footHeights.findIndex((height) => height > AIRBORNE_FOOT_LIFT);
  if (up < 0) return { takeoff: 0, landing: times.at(-1) };
  let down = footHeights.findIndex((height, i) => i > up && height <= AIRBORNE_FOOT_LIFT);
  if (down < 0) down = footHeights.length - 1;
  return { takeoff: times[Math.max(0, up - 1)], landing: times[down] };
}

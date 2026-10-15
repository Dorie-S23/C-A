import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const POMNI_URL = './models/characters/pomni/pomni.glb';
const POMNI_HEIGHT = 1.8; // Caine is 2.6; agree on this with the team

// The Sketchfab export carries two stray untextured meshes that aren't part
// of Pomni (one is ~18 m wide); both use this material, so drop them.
const STRAY_MATERIAL = 'mat21';

// The Mixamo Walk/Run clips were authored for different arm proportions:
// on Pomni they keep her elbows sharply bent and her wrists twisted, so her
// hands cross in front of her belly. Each clip's forearm and hand rotations
// are eased back toward her rest pose by these amounts (0 = as authored,
// 1 = rest pose). Running keeps some elbow bend, which reads as natural.
const ARM_STRAIGHTENING = {
  walk: { forearm: 1, hand: 1 },
  run: { forearm: 0.4, hand: 1 },
};

// Idle's first two keyframes are the T-pose bind pose (arms straight out);
// the idle itself starts at the third. As the clip loops — and whenever she
// stops walking — that flashed a T-pose, so those frames are cut.
const IDLE_START = 2 / 30; // seconds

// The Walk/Run finger keys clench her hands into a claw with the thumb
// splayed out. Those clips use her relaxed Idle finger pose instead, so
// her hands also stay the same as she starts and stops walking.
const RELAXED_FINGER_CLIPS = ['walk', 'run'];
const FINGER_BONE = /Hand(Thumb|Index|Middle|Ring|Pinky)\d/;

/**
 * Loads Pomni with her origin on the floor between her feet, facing +Z.
 * The model carries Idle, Walk and Run clips (Mixamo, in place) for an
 * AnimationMixer rooted at the returned group.
 * Falls back to a capsule placeholder if the model isn't there yet.
 * @returns {Promise<{ pomni: THREE.Group, animations: THREE.AnimationClip[] }>}
 */
export function loadPomni() {
  return new GLTFLoader().loadAsync(POMNI_URL)
    .then((gltf) => {
      straightenArms(gltf.animations, gltf.scene);
      trimIdleTPose(gltf.animations);
      relaxFingers(gltf.animations);
      return { pomni: normalize(gltf.scene), animations: gltf.animations };
    })
    .catch((err) => {
      console.warn('Pomni model not found, using placeholder', err);
      return { pomni: makePlaceholder(), animations: [] };
    });
}

/** Applies ARM_STRAIGHTENING to the clips, in place. */
function straightenArms(clips, model) {
  const key = new THREE.Quaternion();
  for (const clip of clips) {
    const amounts = ARM_STRAIGHTENING[clip.name.toLowerCase()];
    if (!amounts) continue;
    for (const track of clip.tracks) {
      // e.g. "mixamorigLeftForeArm.quaternion" (fingers are "...HandIndex1")
      const match = track.name.match(/^(.*(ForeArm|Hand))\.quaternion$/);
      if (!match) continue;
      const amount = match[2] === 'ForeArm' ? amounts.forearm : amounts.hand;
      const bone = model.getObjectByName(match[1]);
      if (!bone || !amount) continue;
      // Bones still hold their rest pose here, before any clip has played.
      for (let i = 0; i < track.values.length; i += 4) {
        key.fromArray(track.values, i).slerp(bone.quaternion, amount).toArray(track.values, i);
      }
    }
  }
}

function trimIdleTPose(clips) {
  const idle = clips.find((clip) => clip.name.toLowerCase() === 'idle');
  if (!idle) return;
  for (const track of idle.tracks) track.trim(IDLE_START, idle.duration).shift(-IDLE_START);
  idle.resetDuration();
}

/** Swaps RELAXED_FINGER_CLIPS' finger keys for Idle's opening finger pose. */
function relaxFingers(clips) {
  const idle = clips.find((clip) => clip.name.toLowerCase() === 'idle');
  if (!idle) return;
  const relaxed = idle.tracks
    .filter((track) => FINGER_BONE.test(track.name) && track.name.endsWith('.quaternion'))
    .map((track) => new THREE.QuaternionKeyframeTrack(track.name, [0], Array.from(track.values.slice(0, 4))));

  for (const clip of clips) {
    if (!RELAXED_FINGER_CLIPS.includes(clip.name.toLowerCase())) continue;
    clip.tracks = clip.tracks.filter((track) => !FINGER_BONE.test(track.name)).concat(relaxed);
  }
}

function normalize(model) {
  const strays = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (child.material.name === STRAY_MATERIAL) strays.push(child);
    child.castShadow = true;
    child.receiveShadow = true;
    // Skinned bounds are computed once in the bind pose, so an animated
    // limb can leave them and get her culled at the screen edge.
    if (child.isSkinnedMesh) child.frustumCulled = false;
  });
  for (const stray of strays) stray.removeFromParent();
  updateSkeletons(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = POMNI_HEIGHT / size.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  pomni.add(model);
  return pomni;
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

/** A capsule with a nose so you can see which way she faces. */
function makePlaceholder() {
  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, POMNI_HEIGHT - 0.6, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8312f }),
  );
  body.position.y = POMNI_HEIGHT / 2;
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x2f5bd8 }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, POMNI_HEIGHT - 0.4, 0.35);
  for (const m of [body, nose]) { m.castShadow = true; pomni.add(m); }
  return pomni;
}

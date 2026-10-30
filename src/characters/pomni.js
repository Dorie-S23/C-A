import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { loadPomniClips } from './pomniClips.js';

const POMNI_URL = './models/characters/pomni/pomni.glb';
const POMNI_HEIGHT = 1.6; // Caine is 2.6; agree on this with the team

// The Sketchfab export carries two stray untextured meshes that aren't part
// of Pomni (one is ~18 m wide); both use this material, so drop them.
const STRAY_MATERIAL = 'mat21';

// Her look, restyled to the show's: warm pinkish-white skin, dark grey
// hair (her 2D dialogue icon's), saturated red and blue fabric. The export only has flat colours,
// keyed here by its material names (sRGB hex; roughness 0 = glossy, 1 =
// matte). The rooms light her with a bright reflection environment, which
// washes saturated colour out toward white, so the fabric and skin take
// little of it (`env`); only the eyes stay glossy. Materials not listed
// keep their own.
const LOOK = {
  mat9: { color: '#f7ece9', roughness: 0.7, env: 0.35 },   // face (and her neck)
  Pomni_ClosedLid_White: { color: '#f7ece9', roughness: 0.7, env: 0.35 }, // the opening's shut eyelids
  mat0: { color: '#f3e2de', roughness: 0.65, env: 0.35 },  // arms and legs
  mat5: { color: '#fdfdfd', roughness: 0.25, env: 0.6 },   // eye whites
  mat7: { color: '#fdfdfd', roughness: 0.25, env: 0.6 },
  mat8: { color: '#4d4d4d', roughness: 0.75, env: 0.25 },  // hair: the 2D icon's grey
  mat1: { color: '#3036f2', roughness: 0.65, env: 0.15 },  // blue: hat, suit, glove, shoe
  mat2: { color: '#f01f2b', roughness: 0.65, env: 0.15 },  // red: hat, suit, glove, shoe
  mat3: { color: '#ffc21f', roughness: 0.6, env: 0.3 },    // yellow trim, buttons, bells
  mat13: { color: '#4a4ae6', roughness: 0.3, env: 0.5 },   // pupil pinwheels
  mat17: { color: '#4a4ae6', roughness: 0.3, env: 0.5 },
  mat14: { color: '#ff3d3d', roughness: 0.3, env: 0.5 },
  mat18: { color: '#ff3d3d', roughness: 0.3, env: 0.5 },
};
// Left out for now: her eyebrows.
const HIDDEN_MATERIALS = ['mat4'];

// The show gives her a short, wide neck in her face's skin tone, tapering a
// little up into her head; the model has none (the head sits right on the
// collar). Her head is raised by this much, in the rig's own units along
// the neck, and a neck fills the gap.
const NECK_LENGTH = 9;
const NECK_RADIUS = { top: 12, bottom: 14 };
// Her face, hair, hat and collar are all partly weighted to the neck bone,
// so raising the head alone would stretch her chin down to the collar.
// Everything that belongs to her head goes fully onto the head bone first:
// meshes that are wholly head (face, hair, eyes...) and, of the meshes
// shared with her suit (fabric, trim), the parts above her collar: higher
// than this over the neck joint, in the rig's units.
const BODY_MATERIALS = ['mat0', 'mat1', 'mat2', 'mat3'];
const HEAD_MATERIALS = [
  'mat4', 'mat5', 'mat7', 'mat8', 'mat9', 'mat10', 'mat11', 'mat12', 'mat13', 'mat14',
  'mat15', 'mat16', 'mat17', 'mat18', 'mat19', 'mat20', 'Pomni_ClosedLid_White',
];
const COLLAR_TOP = 33;

// The show draws a pink blush under each eye; the model has none, so two
// soft decals are projected onto her face there (see addBlush). Sizes and
// offsets are fractions of an eye's width, so they hold at any scale.
const FACE_MATERIAL = 'mat9';
const EYE_WHITE_MATERIALS = ['mat5', 'mat7'];
const BLUSH = { color: '#f26878', opacity: 0.85, width: 0.6, height: 0.32, below: 0.72, outward: 0.1 };

// The Mixamo Walk/Run clips' arms were authored for different proportions:
// on Pomni they either pin her arms to her sides or fold her hands across
// her belly. So those clips' arm tracks are rebuilt (see naturalArms):
// her relaxed Idle arm pose, swung from the shoulder opposite each leg,
// the elbow bending a little more as the arm comes forward, and the wrist
// trailing the swing. `spread` turns the arm out a little as it comes
// forward, so a running hand doesn't cross her chest. Angles in degrees;
// `lag` is a fraction of a cycle.
const ARM_SWING = {
  walk: { forward: 15, back: 13, elbow: 10, elbowSwing: 10, spread: 2, wrist: 6, lag: 0.06 },
  // Keep the elbows bent enough to read as a run, but open the hands away
  // from her torso so the compact arm cycle doesn't fold across her chest.
  run: { forward: 28, back: 30, elbow: 40, elbowSwing: 8, spread: 14, wrist: 5, lag: 0.05 },
};
const ARM_SIDES = ['Left', 'Right'];
const ARM_CHAIN = ['Shoulder', 'Arm', 'ForeArm', 'Hand'];
const ARM_SAMPLES_PER_SECOND = 30;

// Idle's first two keyframes are the T-pose bind pose (arms straight out);
// the idle itself starts at the third. As the clip loops — and whenever she
// stops walking — that flashed a T-pose, so those frames are cut.
const IDLE_START = 2 / 30; // seconds

// The Walk/Run finger keys clench her hands into a claw with the thumb
// splayed out (and the Mixamo files in her folder have no finger keys at
// all). Those clips use her relaxed Idle finger pose instead, so her hands
// also stay the same as she starts and stops walking.
const RELAXED_FINGER_CLIPS = ['walk', 'run', 'jump'];
const FINGER_BONE = /Hand(Thumb|Index|Middle|Ring|Pinky)\d/;

/**
 * Loads Pomni with her origin on the floor between her feet, facing +Z.
 * The model carries Idle, Walk and Run clips (Mixamo, in place) for an
 * AnimationMixer rooted at the returned group; the Mixamo files in her
 * folder (pomniClips.js) replace its Walk and Run and add a Jump, with
 * userData.retargeted set on each.
 * Falls back to a capsule placeholder if the model isn't there yet.
 * @returns {Promise<{ pomni: THREE.Group, animations: THREE.AnimationClip[] }>}
 */
export function loadPomni() {
  return new GLTFLoader().loadAsync(POMNI_URL)
    .then(async (gltf) => {
      // Retargeted onto her rest pose, so before anything below moves it.
      const extra = await loadPomniClips(gltf.scene).catch((error) => {
        console.warn('Pomni\'s Mixamo animations could not be loaded; keeping her own.', error);
        return [];
      });
      for (const clip of extra) {
        clip.userData.retargeted = true;
        const same = gltf.animations.findIndex((own) => own.name.toLowerCase() === clip.name.toLowerCase());
        if (same >= 0) gltf.animations[same] = clip;
        else gltf.animations.push(clip);
      }
      trimIdleTPose(gltf.animations);
      naturalArms(gltf.animations, gltf.scene);
      relaxFingers(gltf.animations);
      restylePomni(gltf.scene, gltf.animations);
      return { pomni: normalize(gltf.scene), animations: gltf.animations };
    })
    .catch((err) => {
      console.warn('Pomni model not found, using placeholder', err);
      return { pomni: makePlaceholder(), animations: [] };
    });
}

/**
 * Rebuilds the ARM_SWING clips' shoulder, arm, forearm and hand tracks, in
 * place. Everything else (legs, hips, spine) plays as authored.
 *
 * Swings are rotations about her side-to-side axis (+X; she faces +Z),
 * and the spread about her forward one (+Z), measured in the Idle pose. A rotation about a world axis applied to a
 * bone is that axis taken into its parent's frame, premultiplied onto its
 * local rotation; and since the shoulder swing turns about the same axis
 * as the elbow bend, the elbow's axis in its parent's frame doesn't change
 * as the arm swings — so it can all be worked out once, from Idle.
 */
function naturalArms(clips, model) {
  const idle = clips.find((clip) => clip.name.toLowerCase() === 'idle');
  if (!idle) return;
  const bone = (side, part) => model.getObjectByName(`mixamorig${side}${part}`);
  const leftFoot = bone('Left', 'Foot');
  const rightFoot = bone('Right', 'Foot');
  if (!leftFoot || !rightFoot || ARM_SIDES.some((side) => ARM_CHAIN.some((part) => !bone(side, part)))) return;

  // Sampling the clips poses the bones; put the rest pose back afterwards
  // (normalize() measures her in it).
  const rest = new Map();
  model.traverse((object) => rest.set(object, [object.position.clone(), object.quaternion.clone(), object.scale.clone()]));
  const mixer = new THREE.AnimationMixer(model);
  const pose = (clip, time) => {
    mixer.stopAllAction();
    mixer.clipAction(clip).play();
    mixer.setTime(time);
    model.updateMatrixWorld(true);
  };

  // Idle: how each arm hangs, in world terms (and the shoulder joint's own
  // turn, which stays with the torso).
  pose(idle, 0);
  const idleWorld = {};
  for (const side of ARM_SIDES) {
    idleWorld[side] = {};
    for (const part of ARM_CHAIN) idleWorld[side][part] = bone(side, part).getWorldQuaternion(new THREE.Quaternion());
    idleWorld[side].shoulderLocal = bone(side, 'Shoulder').quaternion.clone();
  }

  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const deg = THREE.MathUtils.DEG2RAD;
  const footA = new THREE.Vector3();
  const footB = new THREE.Vector3();
  const q = () => new THREE.Quaternion();
  const [swingTurn, spreadTurn, bendTurn, wristTurn] = [q(), q(), q(), q()];
  const [shoulderWorld, armWorld, foreWorld, handWorld, local] = [q(), q(), q(), q(), q()];
  for (const clip of clips) {
    const settings = ARM_SWING[clip.name.toLowerCase()];
    // The retargeted Mixamo clips' own arms already clear her body.
    if (!settings || clip.userData.retargeted) continue;
    const count = Math.max(2, Math.round(clip.duration * ARM_SAMPLES_PER_SECOND));
    const times = Array.from({ length: count + 1 }, (_, i) => (clip.duration * i) / count);

    // Through the cycle: which leg's ahead (the left arm swings forward as
    // the right foot does, and vice versa), and how the torso the
    // shoulders hang from is turned.
    const stride = [];
    const torso = { Left: [], Right: [] };
    for (const time of times) {
      pose(clip, Math.min(time, clip.duration - 1e-4));
      leftFoot.getWorldPosition(footA);
      rightFoot.getWorldPosition(footB);
      stride.push(footB.z - footA.z);
      for (const side of ARM_SIDES) torso[side].push(bone(side, 'Shoulder').parent.getWorldQuaternion(q()));
    }
    const reach = Math.max(...stride.map(Math.abs)) || 1;
    const swingAt = (fraction) => {
      // The cycle loops, so read it wrapped (and smoothly between samples).
      const x = THREE.MathUtils.euclideanModulo(fraction, 1) * count;
      const i = Math.floor(x);
      return THREE.MathUtils.lerp(stride[i], stride[(i + 1) % count], x - i) / reach;
    };

    const tracks = [];
    for (const side of ARM_SIDES) {
      const sign = side === 'Left' ? 1 : -1;
      const idleArm = idleWorld[side];
      const values = Object.fromEntries(ARM_CHAIN.map((part) => [part, []]));
      const push = (part, quaternion) => values[part].push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      times.forEach((time, i) => {
        const fraction = time / clip.duration;
        const swing = sign * swingAt(fraction - settings.lag);         // +1 = arm fully forward
        const trail = sign * swingAt(fraction - settings.lag * 2.5);   // the wrist follows behind
        const shoulder = (swing > 0 ? settings.forward : settings.back) * swing;
        const elbow = settings.elbow + settings.elbowSwing * Math.max(0, swing);

        // The arm swings in the world's front-to-back plane, not the
        // torso's: the clip twists her torso as she goes, which would
        // otherwise carry the forward hand across her chest. Forward is a
        // negative turn about +X; out to her side is +Z on the left, -Z on
        // the right.
        swingTurn.setFromAxisAngle(X, -shoulder * deg)
          .multiply(spreadTurn.setFromAxisAngle(Z, sign * settings.spread * Math.max(0, swing) * deg));
        bendTurn.setFromAxisAngle(X, -elbow * deg);
        wristTurn.setFromAxisAngle(X, -settings.wrist * trail * deg);
        shoulderWorld.copy(torso[side][i]).multiply(idleArm.shoulderLocal);
        armWorld.copy(swingTurn).multiply(idleArm.Arm);
        foreWorld.copy(swingTurn).multiply(bendTurn).multiply(idleArm.ForeArm);
        handWorld.copy(swingTurn).multiply(bendTurn).multiply(wristTurn).multiply(idleArm.Hand);

        push('Shoulder', idleArm.shoulderLocal);
        push('Arm', local.copy(shoulderWorld).invert().multiply(armWorld));
        push('ForeArm', local.copy(armWorld).invert().multiply(foreWorld));
        push('Hand', local.copy(foreWorld).invert().multiply(handWorld));
      });
      for (const part of ARM_CHAIN) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`mixamorig${side}${part}.quaternion`, times, values[part]));
      }
    }
    const rebuilt = new Set(tracks.map((track) => track.name));
    clip.tracks = clip.tracks.filter((track) => !rebuilt.has(track.name)).concat(tracks);
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(model);
  for (const [object, [position, quaternion, scale]] of rest) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  }
  model.updateMatrixWorld(true);
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

/**
 * Her look, on any copy of her model (the game's, and the bedroom
 * opening's, which is the same rig and materials): LOOK's colours, the
 * hidden parts, her neck, and the cheek blush. `clips` are the animations
 * that will play on it, so the neck holds in them too. Call it once, in her
 * rest pose, before anything plays.
 * @param {THREE.Object3D} model
 * @param {THREE.AnimationClip[]} [clips]
 */
export function restylePomni(model, clips = []) {
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (HIDDEN_MATERIALS.includes(child.material.name)) child.visible = false;
    const look = LOOK[child.material.name];
    if (look) {
      child.material.color.set(look.color);
      child.material.roughness = look.roughness;
      child.material.envMapIntensity = look.env;
    }
  });
  addNeck(clips, model);
  updateSkeletons(model);
  addBlush(model);
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
 * Raises her head NECK_LENGTH up the neck bone, in the rest pose and in
 * every clip that keys the head's position, and hangs a thin neck (her
 * face's material) on the neck bone to fill the gap.
 */
function addNeck(clips, model) {
  const neck = model.getObjectByName('mixamorigNeck');
  const head = model.getObjectByName('mixamorigHead');
  if (!neck || !head) return;
  model.updateMatrixWorld(true);
  model.traverse((child) => { if (child.isSkinnedMesh) child.skeleton.update(); });
  const vertex = new THREE.Vector3();
  model.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const bones = mesh.skeleton.bones;
    const headIndex = bones.indexOf(head);
    if (headIndex < 0) return;
    // A head-only mesh goes over whole: even its chin's few vertices that
    // were only on the upper spine.
    const isHead = (index) => bones[index] === neck || bones[index] === head || bones[index].parent === head;
    const shared = BODY_MATERIALS.includes(mesh.material.name);
    if (!shared && !HEAD_MATERIALS.includes(mesh.material.name)) return; // e.g. the opening's blanket
    const { skinIndex, skinWeight } = mesh.geometry.attributes;
    for (let i = 0; i < skinIndex.count; i++) {
      let onHead = false;
      for (let k = 0; k < 4; k++) if (skinWeight.getComponent(i, k) > 0 && isHead(skinIndex.getComponent(i, k))) onHead = true;
      if (shared && (!onHead || neck.worldToLocal(mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld)).y < COLLAR_TOP)) continue;
      skinIndex.setXYZW(i, headIndex, 0, 0, 0);
      skinWeight.setXYZW(i, 1, 0, 0, 0);
    }
    skinIndex.needsUpdate = skinWeight.needsUpdate = true;
  });

  const up = head.position.clone().normalize();
  const lift = up.clone().multiplyScalar(NECK_LENGTH);
  head.position.add(lift);
  for (const clip of clips) {
    for (const track of clip.tracks) {
      if (track.name !== 'mixamorigHead.position') continue;
      for (let i = 0; i < track.values.length; i += 3) {
        track.values[i] += lift.x;
        track.values[i + 1] += lift.y;
        track.values[i + 2] += lift.z;
      }
    }
  }

  let skin = null;
  model.traverse((child) => { if (child.isMesh && child.material.name === FACE_MATERIAL) skin = child.material; });
  // From the collar (the neck bone) up into the head, overlapping a little each end.
  const overlap = NECK_RADIUS.bottom;
  const length = head.position.length() + overlap;
  const geometry = new THREE.CylinderGeometry(NECK_RADIUS.top, NECK_RADIUS.bottom, length, 24, 1, true);
  geometry.translate(0, length / 2 - overlap, 0);
  const mesh = new THREE.Mesh(geometry, skin ?? new THREE.MeshStandardMaterial({ color: '#f7ece9' }));
  mesh.name = 'PomniNeck';
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  mesh.castShadow = true;
  neck.add(mesh);
}

/**
 * Projects BLUSH onto her face below each eye, in the rest pose, and hangs
 * the decals on her head bone so they move with it. Skipped quietly if the
 * model's parts aren't the expected ones.
 */
function addBlush(model) {
  let face = null;
  const eyes = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    // (Her neck shares the face's material, but isn't skinned.)
    if (child.isSkinnedMesh && child.material.name === FACE_MATERIAL) face = child;
    if (EYE_WHITE_MATERIALS.includes(child.material.name)) eyes.push(child);
  });
  const head = model.getObjectByName('mixamorigHead');
  if (!face || !head || eyes.length !== 2) return;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, BLUSH.color);
  glow.addColorStop(0.55, BLUSH.color);
  glow.addColorStop(1, 'rgba(242, 112, 126, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 128, 128);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({
    map, transparent: true, opacity: BLUSH.opacity, roughness: 0.5, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4,
  });

  // Worked out in the model's own frame, where she stands upright facing
  // +Z, whatever the scene has done with her (the opening lays her in bed).
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const vertex = new THREE.Vector3();
  const inModel = (mesh, i) => mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld).applyMatrix4(toModel);

  // DecalGeometry reads raw vertices, but her face is skinned: project onto
  // a stand-in holding the face where it actually is, in the rest pose.
  const shape = face.geometry.clone();
  for (let i = 0; i < shape.attributes.position.count; i++) {
    const v = inModel(face, i);
    shape.attributes.position.setXYZ(i, v.x, v.y, v.z);
  }
  shape.computeVertexNormals();
  const surface = new THREE.Mesh(shape);

  const eyeBoxes = eyes.map((eye) => {
    const box = new THREE.Box3();
    for (let i = 0; i < eye.geometry.attributes.position.count; i++) box.expandByPoint(inModel(eye, i));
    return box;
  });
  const middle = (eyeBoxes[0].getCenter(new THREE.Vector3()).x + eyeBoxes[1].getCenter(new THREE.Vector3()).x) / 2;
  for (const eye of eyeBoxes) {
    const centre = eye.getCenter(new THREE.Vector3());
    const width = eye.max.x - eye.min.x;
    const out = Math.sign(centre.x - middle);
    // The decal projects straight back (along -Z) onto her cheek.
    const position = new THREE.Vector3(centre.x + out * BLUSH.outward * width, centre.y - BLUSH.below * width, centre.z);
    // Deep enough to reach back from the bulging eyes to the cheek.
    const size = new THREE.Vector3(BLUSH.width * width, BLUSH.height * width, width * 4);
    const decal = new THREE.Mesh(new DecalGeometry(surface, position, new THREE.Euler(), size), material);
    decal.name = 'PomniBlush';
    // Its vertices are in the model's frame: place it there, then hang it
    // on her head bone keeping that place.
    model.add(decal);
    decal.updateMatrixWorld(true);
    head.attach(decal);
  }
  shape.dispose();
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

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// "jax_from_tadc.glb": rigged (hips/spine/legs/arms down to fingers) but,
// like Caine's model, ships with no baked animation clips — the walk below
// is hand-posed per frame instead of played from a clip.
const JAX_URL = './models/characters/jax/jax_from_tadc.glb';

// Every hip/knee/shoulder joint in this rig swings front-to-back when its
// rotation is premultiplied by a rotation about its PARENT's local Z axis.
// Found offline by composing the rig's bind-pose transforms and checking
// which candidate axis moved the child joint mostly along one world axis
// instead of sideways or straight up — local X swings the leg out to the
// side, Y just twists it in place, Z is the one that reads as a stride.
const HINGE_AXIS = new THREE.Vector3(0, 0, 1);

const STRIDE_HZ = 2.4; // steps/second — brisk, matches "storms past"
const LEG_SWING = THREE.MathUtils.degToRad(30);
const KNEE_BEND = THREE.MathUtils.degToRad(24);
const ARM_SWING = THREE.MathUtils.degToRad(24);
const BOB_HEIGHT = 0.035;

/**
 * Finds a bone by a loose, punctuation-insensitive match on its name.
 * glTF export mangles "upper_leg.L_53_59" in ways that vary by loader
 * version (dots and spaces get sanitized differently), but the letters
 * survive regardless, so matching on those alone is the robust option.
 */
function findBone(root, prefix) {
  let found = null;
  root.traverse((child) => {
    if (found || !child.isBone) return;
    const clean = child.name.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.startsWith(prefix)) found = child;
  });
  return found;
}

/**
 * Loads Jax, hidden and idle until playPassBy() is called. There's no
 * interact/collider here — he's a one-shot background flourish, not a
 * character the player stops and talks to.
 *
 * @returns {Promise<{ jax: THREE.Group,
 *   update: (deltaSeconds: number) => void,
 *   playPassBy: (from: THREE.Vector3, to: THREE.Vector3, duration: number) => void }>}
 */
export function loadJax() {
  return new GLTFLoader().loadAsync(JAX_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    const jax = new THREE.Group();
    jax.name = 'Jax';
    jax.add(model);
    jax.visible = false;

    const bones = {
      upperLegL: findBone(model, 'upperlegl'),
      upperLegR: findBone(model, 'upperlegr'),
      lowerLegL: findBone(model, 'lowerlegl'),
      lowerLegR: findBone(model, 'lowerlegr'),
      upperArmL: findBone(model, 'upperarml'),
      upperArmR: findBone(model, 'upperarmr'),
    };
    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }

    const swing = new THREE.Quaternion();
    function poseLeg(bone, angle) {
      if (!bone) return;
      swing.setFromAxisAngle(HINGE_AXIS, angle);
      bone.quaternion.copy(rest.get(bone)).premultiply(swing);
    }

    let walk = null;

    function playPassBy(from, to, duration) {
      jax.position.copy(from);
      jax.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      jax.visible = true;
      walk = { from: from.clone(), to: to.clone(), duration, elapsed: 0 };
    }

    function update(deltaSeconds) {
      if (!walk) return;
      walk.elapsed += deltaSeconds;
      const t = Math.min(walk.elapsed / walk.duration, 1);
      jax.position.lerpVectors(walk.from, walk.to, t);

      const phase = walk.elapsed * STRIDE_HZ * Math.PI * 2;
      poseLeg(bones.upperLegL, Math.sin(phase) * LEG_SWING);
      poseLeg(bones.upperLegR, -Math.sin(phase) * LEG_SWING);
      // One-sided (never negative) so a knee only ever bends, never
      // hyperextends backward — cheap insurance against a broken-looking pose.
      poseLeg(bones.lowerLegL, Math.max(0, Math.sin(phase + Math.PI / 2)) * KNEE_BEND);
      poseLeg(bones.lowerLegR, Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * KNEE_BEND);
      poseLeg(bones.upperArmL, -Math.sin(phase) * ARM_SWING);
      poseLeg(bones.upperArmR, Math.sin(phase) * ARM_SWING);
      jax.position.y += Math.abs(Math.sin(phase)) * BOB_HEIGHT;

      if (t >= 1) {
        jax.visible = false;
        walk = null;
      }
    }

    return { jax, update, playPassBy };
  });
}

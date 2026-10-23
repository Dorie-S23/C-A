import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// "jax_from_tadc.glb": rigged (hips/spine/legs/arms down to fingers) but,
// like Caine's model, ships with no baked animation clips — the run below
// is hand-posed per frame instead of played from a clip.
const JAX_URL = './models/characters/jax/jax_from_tadc.glb';

// Every hip/knee/shoulder joint in this rig swings front-to-back when its
// rotation is premultiplied by a rotation about its PARENT's local Z axis.
// Found offline by composing the rig's bind-pose transforms and checking
// which candidate axis moved the child joint mostly along one world axis
// instead of sideways or straight up — local X swings the leg out to the
// side, Y just twists it in place, Z is the one that reads as a stride.
const HINGE_AXIS = new THREE.Vector3(0, 0, 1);

// An actual run (he "storms past"), not a walk: quicker cadence, a
// bigger stride, and a real bounce rather than a gentle bob.
const STRIDE_HZ = 3.3; // steps/second
const LEG_SWING = THREE.MathUtils.degToRad(42);
const KNEE_BEND = THREE.MathUtils.degToRad(55);
const ARM_SWING = THREE.MathUtils.degToRad(36);
const BOB_HEIGHT = 0.07;
// A forward body lean reads as "running" on its own, independent of how
// precisely any single joint swings — leaning in over the first few
// frames (rather than snapping to it) sells the "taking off at a sprint"
// moment instead of just gliding forward already at full lean.
const LEAN_ANGLE = THREE.MathUtils.degToRad(14);
const LEAN_IN_SECONDS = 0.25;

// A light of his own, attached to his group so it travels with him and
// doesn't depend on whatever a given room's own lighting happens to be —
// without it he can silhouette against anything bright behind him (e.g.
// a doorway glow) despite his own materials being lit correctly.
//
// Point-light brightness follows an inverse-square falloff, so a light
// sitting AT (or inside) the surface it's meant to light overexposes it
// to near-white — which is exactly what putting this at (0, height, 0),
// dead centre with zero offset, did: it sat inside his own head/torso.
// Offset out to a real working distance instead, like an actual key
// light would be, with intensity/range raised to still reach him from there.
const KEY_LIGHT_COLOR = 0xfff4e0;
const KEY_LIGHT_INTENSITY = 6;
const KEY_LIGHT_RANGE = 5;
const KEY_LIGHT_OFFSET = new THREE.Vector3(0.9, 1.6, 1.1); // forward-up-right of his centre, clear of his own mesh

// Idle hold (e.g. the maze, where he just stands rather than running) reads
// as "frozen like a statue" with nothing layered on top of the bind pose —
// same problem Kaufmo had before kaufmoTalk.js. A slow breathing sway plus
// a faster, smaller shiver on top (he's spent the run getting here scared,
// not calm) sells "alive and on edge" without needing any mood/dialogue
// content to drive it, which isn't written yet.
const IDLE_BREATHE_HZ = 0.3;
const IDLE_BREATHE_ANGLE = THREE.MathUtils.degToRad(2.5);
const IDLE_TREMBLE_HZ = 5.5;
const IDLE_TREMBLE_ANGLE = THREE.MathUtils.degToRad(1.1);
const IDLE_HUNCH_ANGLE = THREE.MathUtils.degToRad(6); // a little drawn in on himself, not standing tall
const TURN_SHARPNESS = 5; // matches ribbit.js's/kaufmoTalk.js's own faceTowards rate

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
 * Loads Jax, hidden and idle until playPassBy() is called. Still no
 * interact/collider here — he has no lines yet (that's pending the team's
 * review of the maze payoff script) — but update() keeps him breathing
 * and trembling while he stands still, and faceTowards() turns him to
 * look at whoever finds him, instead of holding dead still either way.
 *
 * @returns {Promise<{ jax: THREE.Group,
 *   update: (deltaSeconds: number) => void,
 *   playPassBy: (from: THREE.Vector3, to: THREE.Vector3, duration: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void }>}
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

    const keyLight = new THREE.PointLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY, KEY_LIGHT_RANGE, 2);
    keyLight.position.copy(KEY_LIGHT_OFFSET);
    jax.add(keyLight);

    const bones = {
      upperLegL: findBone(model, 'upperlegl'),
      upperLegR: findBone(model, 'upperlegr'),
      lowerLegL: findBone(model, 'lowerlegl'),
      lowerLegR: findBone(model, 'lowerlegr'),
      upperArmL: findBone(model, 'upperarml'),
      upperArmR: findBone(model, 'upperarmr'),
      spine: findBone(model, 'spine'),
      head: findBone(model, 'head'),
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
    let time = 0;
    let targetYaw = null;
    const ownPosition = new THREE.Vector3();

    function playPassBy(from, to, duration, { style = 'run' } = {}) {
      jax.position.copy(from);
      jax.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      jax.rotation.x = 0;
      jax.rotation.z = 0;
      jax.visible = true;
      // Clears any idle hunch/tremble left over from standing still, so
      // the run starts from a clean bind pose rather than a frozen bend.
      if (bones.spine) bones.spine.quaternion.copy(rest.get(bones.spine));
      if (bones.head) bones.head.quaternion.copy(rest.get(bones.head));
      walk = { from: from.clone(), to: to.clone(), duration, elapsed: 0, style };
    }

    /** Turns him (smoothly, while idle) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) { targetYaw = null; return; }
      jax.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    function update(deltaSeconds) {
      time += deltaSeconds;
      if (!walk) {
        // Standing still (e.g. found in the maze) still breathes and
        // shivers instead of holding dead still like a mannequin.
        if (bones.spine) bones.spine.quaternion.copy(rest.get(bones.spine));
        if (bones.head) bones.head.quaternion.copy(rest.get(bones.head));
        bendBone(bones.spine, jax, SIDEWAYS, IDLE_HUNCH_ANGLE);
        bendBone(bones.spine, jax, UP, Math.sin(time * IDLE_BREATHE_HZ * Math.PI * 2) * IDLE_BREATHE_ANGLE);
        bendBone(bones.spine, jax, SIDEWAYS, Math.sin(time * IDLE_TREMBLE_HZ * Math.PI * 2) * IDLE_TREMBLE_ANGLE);
        bendBone(bones.head, jax, SIDEWAYS, Math.sin(time * IDLE_TREMBLE_HZ * Math.PI * 2 + 1.3) * IDLE_TREMBLE_ANGLE);

        if (targetYaw !== null) {
          const diff = THREE.MathUtils.euclideanModulo(targetYaw - jax.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
          jax.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
        }
        return;
      }
      walk.elapsed += deltaSeconds;
      const t = Math.min(walk.elapsed / walk.duration, 1);
      jax.position.lerpVectors(walk.from, walk.to, t);

      const sly = walk.style === 'sly';
      const phase = walk.elapsed * (sly ? 1.4 : STRIDE_HZ) * Math.PI * 2;
      const stride = sly ? THREE.MathUtils.degToRad(26) : LEG_SWING;
      const knee = sly ? THREE.MathUtils.degToRad(28) : KNEE_BEND;
      poseLeg(bones.upperLegL, Math.sin(phase) * stride);
      poseLeg(bones.upperLegR, -Math.sin(phase) * stride);
      // One-sided (never negative) so a knee only ever bends, never
      // hyperextends backward — cheap insurance against a broken-looking pose.
      poseLeg(bones.lowerLegL, Math.max(0, Math.sin(phase + Math.PI / 2)) * knee);
      poseLeg(bones.lowerLegR, Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * knee);
      poseLeg(bones.upperArmL, sly ? 0 : -Math.sin(phase) * ARM_SWING);
      poseLeg(bones.upperArmR, sly ? 0 : Math.sin(phase) * ARM_SWING);
      jax.position.y += Math.abs(Math.sin(phase)) * (sly ? .018 : BOB_HEIGHT);
      jax.rotation.x = sly ? -.035 : LEAN_ANGLE * Math.min(walk.elapsed / LEAN_IN_SECONDS, 1);
      jax.rotation.z = sly ? Math.sin(phase) * .025 : 0;

      if (t >= 1) {
        jax.visible = false;
        walk = null;
      }
    }

    return { jax, update, playPassBy, faceTowards };
  });
}

import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS } from './bendBone.js';

// An actual run: quick cadence, a real stride, a bounce — matches jax.js's
// gait constants (same "storms/hurries past" energy).
const STRIDE_HZ = 3.3;
const LEG_SWING = THREE.MathUtils.degToRad(42);
const KNEE_BEND = THREE.MathUtils.degToRad(55);
const ARM_SWING = THREE.MathUtils.degToRad(36);
const BOB_HEIGHT = 0.06; // he's shorter than Jax — a smaller bounce reads right at his scale

// Same reasoning as Jax's: a light of his own so he isn't just however lit
// the backdrop happens to leave him, positioned clear of his own mesh
// (scaled down from Jax's offset — he's roughly 1.3m to Jax's ~1.8m).
const KEY_LIGHT_COLOR = 0xfff4e0;
const KEY_LIGHT_INTENSITY = 5;
const KEY_LIGHT_RANGE = 4;
const KEY_LIGHT_OFFSET = new THREE.Vector3(0.65, 1.1, 0.8);

/**
 * Finds a bone by a loose, punctuation-insensitive match on its name.
 * Kaufmo's rig names its joints like "ValveBiped.Bip01_L_Thigh_02" (same
 * Source-engine-style convention as Caine's) — glTF sanitizes the dots and
 * digits in loader-version-dependent ways, but the letters survive
 * regardless, so matching on those alone (as a substring, since the
 * descriptive part sits in the middle of the name here, not the front) is
 * the robust option.
 */
function findBone(root, needle) {
  let found = null;
  root.traverse((child) => {
    if (found || !child.isBone) return;
    const clean = child.name.toLowerCase().replace(/[^a-z]/g, '');
    if (clean.includes(needle)) found = child;
  });
  return found;
}

/**
 * Loads Kaufmo as a one-shot "runs past, hidden until playPassBy()"
 * background extra — same idea as characters/jax.js, but posed with
 * bendBone instead of a single fixed local hinge axis. Kaufmo's rig
 * orients each bone's own axes differently from the next (same
 * Source-engine-style convention Caine's idle has to work around — see
 * its own comment), so there's no single local axis that reads as "swing
 * forward" for every joint the way there was for Jax's cleaner rig;
 * bendBone sidesteps that by working in the character's own frame
 * (SIDEWAYS/UP/FORWARD) rather than each bone's.
 *
 * @returns {Promise<{ kaufmo: THREE.Group,
 *   update: (deltaSeconds: number) => void,
 *   playPassBy: (from: THREE.Vector3, to: THREE.Vector3, duration: number) => void }>}
 */
export function loadKaufmoRunExtra() {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    collider.visible = false;
    kaufmo.visible = false;

    const keyLight = new THREE.PointLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY, KEY_LIGHT_RANGE, 2);
    keyLight.position.copy(KEY_LIGHT_OFFSET);
    kaufmo.add(keyLight);

    const bones = {
      thighL: findBone(kaufmo, 'lthigh'),
      thighR: findBone(kaufmo, 'rthigh'),
      calfL: findBone(kaufmo, 'lcalf'),
      calfR: findBone(kaufmo, 'rcalf'),
      armL: findBone(kaufmo, 'lupperarm'),
      armR: findBone(kaufmo, 'rupperarm'),
    };
    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }

    let walk = null;

    function playPassBy(from, to, duration) {
      kaufmo.position.copy(from);
      kaufmo.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      kaufmo.visible = true;
      walk = { from: from.clone(), to: to.clone(), duration, elapsed: 0 };
    }

    function update(deltaSeconds) {
      if (!walk) return;
      walk.elapsed += deltaSeconds;
      const t = Math.min(walk.elapsed / walk.duration, 1);
      kaufmo.position.lerpVectors(walk.from, walk.to, t);

      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);
      const phase = walk.elapsed * STRIDE_HZ * Math.PI * 2;
      // Sign guide (bendBone.js): a negative angle about SIDEWAYS swings
      // a hanging limb forward; positive swings it back. Knees only ever
      // get a non-negative angle (Math.max(0, ...)) so a bend never
      // hyperextends the leg backward past straight.
      bendBone(bones.thighL, kaufmo, SIDEWAYS, -Math.sin(phase) * LEG_SWING);
      bendBone(bones.thighR, kaufmo, SIDEWAYS, Math.sin(phase) * LEG_SWING);
      bendBone(bones.calfL, kaufmo, SIDEWAYS, Math.max(0, Math.sin(phase + Math.PI / 2)) * KNEE_BEND);
      bendBone(bones.calfR, kaufmo, SIDEWAYS, Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * KNEE_BEND);
      bendBone(bones.armL, kaufmo, SIDEWAYS, Math.sin(phase) * ARM_SWING);
      bendBone(bones.armR, kaufmo, SIDEWAYS, -Math.sin(phase) * ARM_SWING);
      kaufmo.position.y += Math.abs(Math.sin(phase)) * BOB_HEIGHT;

      if (t >= 1) {
        kaufmo.visible = false;
        walk = null;
      }
    }

    return { kaufmo, update, playPassBy };
  });
}

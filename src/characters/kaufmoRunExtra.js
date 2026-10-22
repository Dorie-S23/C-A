import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS } from './bendBone.js';

// An actual run: quick cadence, a bounce, a forward lean — matches jax.js's
// gait energy. The swing angles are deliberately smaller than Jax's: his
// rig's hip/knee joints don't resolve to as clean a single hinge axis as
// Jax's did (checked offline — no single axis swings this rig's thigh
// cleanly forward/back without also lifting it, unlike Jax's), so a
// smaller amplitude keeps whatever's imprecise about the arc from
// reading as obviously wrong, while the lean carries most of the "he's
// running" read on its own.
const STRIDE_HZ = 3.3;
const LEG_SWING = THREE.MathUtils.degToRad(26);
const KNEE_BEND = THREE.MathUtils.degToRad(34);
const ARM_SWING = THREE.MathUtils.degToRad(30);
const BOB_HEIGHT = 0.06; // he's shorter than Jax — a smaller bounce reads right at his scale
const LEAN_ANGLE = THREE.MathUtils.degToRad(16); // a little more than Jax's — he's shorter, so it needs to read at a glance
const LEAN_IN_SECONDS = 0.25;

// Same reasoning as Jax's: a light of his own so he isn't just however lit
// the backdrop happens to leave him, positioned clear of his own mesh
// (scaled down from Jax's offset — he's roughly 1.3m to Jax's ~1.8m).
const KEY_LIGHT_COLOR = 0xfff4e0;
const KEY_LIGHT_INTENSITY = 5;
const KEY_LIGHT_RANGE = 4;
const KEY_LIGHT_OFFSET = new THREE.Vector3(0.65, 1.1, 0.8);

// "Pacing in a tight circle" — an anxious, unhurried lap, not a run: the
// same bendBone walk-cycle approach as playPassBy, just a slower cadence,
// smaller swing, and a looping circular path instead of a straight line
// that ends. Loops indefinitely until stopPacing() — unlike playPassBy, it
// never hides itself.
const PACE_HZ = 1.7;
const PACE_LEG_SWING = THREE.MathUtils.degToRad(15);
const PACE_KNEE_BEND = THREE.MathUtils.degToRad(18);
const PACE_ARM_SWING = THREE.MathUtils.degToRad(12);
const PACE_BOB_HEIGHT = 0.025;
const PACE_RADIUS = 0.55; // metres — tight and anxious, not a stroll
const PACE_ANGULAR_SPEED = 1.0; // radians/second around the circle

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
 * @param {{ keyLight?: boolean }} [options] keyLight: false skips his own
 *   point light — meant for the hallway cutscene's empty backdrop; his own
 *   room already has real lighting, so adding this on top there would
 *   overexpose him the same way it did before Jax's own light got moved
 *   off-body earlier this project.
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   playPassBy: (from: THREE.Vector3, to: THREE.Vector3, duration: number) => void,
 *   pace: (center: THREE.Vector3) => void,
 *   stopPacing: () => void }>}
 */
export function loadKaufmoRunExtra({ keyLight = true } = {}) {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    collider.visible = false;
    kaufmo.visible = false;

    if (keyLight) {
      const light = new THREE.PointLight(KEY_LIGHT_COLOR, KEY_LIGHT_INTENSITY, KEY_LIGHT_RANGE, 2);
      light.position.copy(KEY_LIGHT_OFFSET);
      kaufmo.add(light);
    }

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
    let pacing = null;

    function playPassBy(from, to, duration) {
      pacing = null;
      kaufmo.position.copy(from);
      kaufmo.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      kaufmo.rotation.x = 0;
      kaufmo.visible = true;
      walk = { from: from.clone(), to: to.clone(), duration, elapsed: 0 };
    }

    /** Starts (or re-centres) an indefinite pacing loop around `center`. */
    function pace(center) {
      walk = null;
      kaufmo.visible = true;
      kaufmo.rotation.x = 0;
      pacing = { center: center.clone(), angle: Math.random() * Math.PI * 2, elapsed: pacing?.elapsed ?? 0 };
    }

    function stopPacing() {
      pacing = null;
    }

    function animateGait(phase, { legSwing, kneeBend, armSwing, bobHeight }) {
      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);
      // Sign guide (bendBone.js): a negative angle about SIDEWAYS swings
      // a hanging limb forward; positive swings it back. Knees only ever
      // get a non-negative angle (Math.max(0, ...)) so a bend never
      // hyperextends the leg backward past straight.
      bendBone(bones.thighL, kaufmo, SIDEWAYS, -Math.sin(phase) * legSwing);
      bendBone(bones.thighR, kaufmo, SIDEWAYS, Math.sin(phase) * legSwing);
      bendBone(bones.calfL, kaufmo, SIDEWAYS, Math.max(0, Math.sin(phase + Math.PI / 2)) * kneeBend);
      bendBone(bones.calfR, kaufmo, SIDEWAYS, Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * kneeBend);
      bendBone(bones.armL, kaufmo, SIDEWAYS, Math.sin(phase) * armSwing);
      bendBone(bones.armR, kaufmo, SIDEWAYS, -Math.sin(phase) * armSwing);
      kaufmo.position.y += Math.abs(Math.sin(phase)) * bobHeight;
    }

    function update(deltaSeconds) {
      if (walk) {
        walk.elapsed += deltaSeconds;
        const t = Math.min(walk.elapsed / walk.duration, 1);
        kaufmo.position.lerpVectors(walk.from, walk.to, t);
        animateGait(walk.elapsed * STRIDE_HZ * Math.PI * 2,
          { legSwing: LEG_SWING, kneeBend: KNEE_BEND, armSwing: ARM_SWING, bobHeight: BOB_HEIGHT });
        kaufmo.rotation.x = LEAN_ANGLE * Math.min(walk.elapsed / LEAN_IN_SECONDS, 1);

        if (t >= 1) {
          kaufmo.visible = false;
          walk = null;
        }
        return;
      }
      if (pacing) {
        pacing.elapsed += deltaSeconds;
        pacing.angle += PACE_ANGULAR_SPEED * deltaSeconds;
        kaufmo.position.set(
          pacing.center.x + Math.cos(pacing.angle) * PACE_RADIUS,
          pacing.center.y,
          pacing.center.z + Math.sin(pacing.angle) * PACE_RADIUS,
        );
        kaufmo.rotation.y = pacing.angle + Math.PI / 2; // face the direction of travel around the loop
        animateGait(pacing.elapsed * PACE_HZ * Math.PI * 2,
          { legSwing: PACE_LEG_SWING, kneeBend: PACE_KNEE_BEND, armSwing: PACE_ARM_SWING, bobHeight: PACE_BOB_HEIGHT });
      }
    }

    return { kaufmo, collider, update, playPassBy, pace, stopPacing };
  });
}

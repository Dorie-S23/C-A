import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bendBone, SIDEWAYS, UP, FORWARD } from './bendBone.js';
import { loadJaxClips } from './jaxClips.js';

// "jax_from_tadc.glb" has a rig but no baked animation clips. Walk and run
// are retargeted from Pomni's animation-only Mixamo skeleton files.
const JAX_URL = './models/characters/jax/jax_from_tadc.glb';

// Every hip/knee/shoulder joint in this rig swings front-to-back when its
// rotation is premultiplied by a rotation about its PARENT's local Z axis.
// Found offline by composing the rig's bind-pose transforms and checking
// which candidate axis moved the child joint mostly along one world axis
// instead of sideways or straight up — local X swings the leg out to the
// side, Y just twists it in place, Z is the one that reads as a stride.
const HINGE_AXIS = new THREE.Vector3(0, 0, 1);

// This rig's bind pose has both arms held straight out to the sides (a
// T-pose), not hanging down — measured against the real model
// (tools/_tmp_check_jax_arm_lower.mjs, not kept: a one-off bind-pose
// probe, same idea as the HINGE_AXIS comment above but for a different
// question). The run cycle below only ever swung forward/back from
// whatever rest pose it started from, so it was swinging straight,
// shoulder-height, outstretched arms the whole time — reads as stiff/
// wrong because it is: nothing ever brought them down to his sides.
// Rotating -90° about the shoulder's local X (found the same way) does
// that, identically for both arms, and is baked into the rest pose below
// rather than applied per frame, so every other arm pose (the swing, the
// elbow bend) composes on top of "hanging down" instead of "T-pose".
const ARM_LOWER_AXIS = new THREE.Vector3(1, 0, 0);
const ARM_LOWER_ANGLE = THREE.MathUtils.degToRad(-90);

// An actual run (he "storms past"), not a walk: quicker cadence, a
// bigger stride, and a real bounce rather than a gentle bob.
const STRIDE_HZ = 3.3; // steps/second
const LEG_SWING = THREE.MathUtils.degToRad(42);
const KNEE_BEND = THREE.MathUtils.degToRad(55);
const ARM_SWING = THREE.MathUtils.degToRad(36);
// A real sprint holds the elbows bent throughout, not locked straight —
// a straight swinging arm is a big part of what read as "stiff/robotic".
// Constant rather than phase-varying like the knee: lower-confidence
// without being able to see the result, so kept to the one change
// (bent, not straight) that's true the whole cycle either way.
const ELBOW_BEND = THREE.MathUtils.degToRad(70);
const SLY_ELBOW_BEND = THREE.MathUtils.degToRad(25);
const IDLE_ELBOW_BEND = THREE.MathUtils.degToRad(15); // a relaxed bend while just standing, not locked straight
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

// Standing (standNormally): upright, arms relaxed at his sides, with just a
// slow, small breath so he isn't a statue. No shiver, hunch, shuffle or
// twitch on top: those read as him wiggling in place.
const IDLE_BREATHE_HZ = 0.3;
const IDLE_BREATHE_ANGLE = THREE.MathUtils.degToRad(1.2);
// His arms angle out from his sides by this much, so his hands hang clear
// of his hips instead of sinking into them.
const ARM_OUT = 0.12; // radians
// Running, the Mixamo swing brings his hands right across his chest: more.
const RUN_ARM_OUT = 0.32;
// His rig's fingers rest spread flat (a T-pose hand), and nothing animates
// them. They're left straight (no curl at the knuckles; raise these to
// close his hands, toward the palm: see relaxHands), just drawn together.
const FINGER_CURL = 0;
const THUMB_CURL = 0;
const FINGERS = ['index', 'middle', 'ring'];
// They rest fanned wide apart: the outer two are drawn this much of the
// way in toward the middle one, in the palm's plane.
const FINGER_CLOSE = 0.7;
const KNUCKLES = ['proximal', 'intermediate', 'distal'];
// Distressed (the maze nook's final talk): standing the same, head hung a
// little, lifting as he engages with her.
const DISTRESS_HEAD_DROP = THREE.MathUtils.degToRad(10);
const TURN_SHARPNESS = 5; // matches ribbit.js's/kaufmoTalk.js's own faceTowards rate

// Glitching (setGlitching; Level 3's "his idle is jerky, with small
// stutters"): every so often his glitch shader bursts (onStutter, in
// time with the idle's clock skipping), while his body itself stands still.
// glitch() is one bigger tear across him, bursting every frame for a moment.
const STUTTER_GAP = [0.3, 1.0];    // seconds of smooth idle between skips
const STUTTER_HOLD = [0.06, 0.14]; // how long each skip holds
const STUTTER_SKIP = 0.35;         // seconds of idle jumped over
const GLITCH_SECONDS = 0.4;

// Restless (setRestless; the maze, waiting for Pomni with his back to her):
// he stands at his mark facing his wall (homeYaw). Engaged (engage(point)),
// he turns to face her; let go, he turns back to his wall.

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
 * Draws his fingers together (FINGER_CLOSE), curls them toward his palms
 * as far as FINGER_CURL and THUMB_CURL say (none, as set), and makes his
 * gait clips, which would otherwise hold them at the rig's spread rest,
 * keep them that way.
 *
 * The bones' own axes aren't the same from hand to hand (one hand mirrors
 * the other), so the way each finger closes is worked out from the hand
 * itself, in world terms: along the finger (knuckle to next knuckle),
 * across the hand (index knuckle to ring knuckle), and the palm side is
 * the side facing his body (his arms hang at his sides by now, palms in;
 * the thumb's side alone is ambiguous on his right hand). A finger closes
 * by turning about along × palm, which swings it in toward the palm.
 */
function relaxHands(model, clips) {
  model.updateMatrixWorld(true);
  const bone = (name, side) => findBone(model, `${name}${side}`);
  const at = (b) => b.getWorldPosition(new THREE.Vector3());
  const spine = findBone(model, 'spine');
  if (!spine) return;
  const curled = new Map();
  const close = (b, child, palm, angle) => {
    const along = (child ? at(child) : at(b).sub(at(b.parent)).add(at(b))).sub(at(b)).normalize();
    const axis = along.cross(palm).normalize();
    if (axis.lengthSq() < 1e-6) return;
    // Into the bone's own frame, then turned there.
    const local = axis.applyQuaternion(b.getWorldQuaternion(new THREE.Quaternion()).invert());
    b.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(local, angle));
    b.updateMatrixWorld(true);
    curled.set(`${b.name}.quaternion`, b.quaternion);
  };
  for (const side of ['l', 'r']) {
    const index = bone('indexproximal', side), ring = bone('ringproximal', side), thumb = bone('thumbdistal', side);
    if (!index || !ring || !thumb) continue;
    const across = at(ring).sub(at(index));
    const along = at(bone('middleintermediate', side) ?? index).sub(at(bone('middleproximal', side) ?? index));
    const palm = along.clone().cross(across).normalize();
    const towardBody = at(spine).sub(at(index)).setY(0);
    if (palm.dot(towardBody) < 0) palm.negate();
    // Together first: the index and ring fingers turned in toward the
    // middle one about the palm's normal (the way the hand faces).
    const middle = at(bone('middleintermediate', side) ?? index).sub(at(bone('middleproximal', side) ?? index)).normalize();
    for (const finger of ['index', 'ring']) {
      const knuckle = bone(`${finger}proximal`, side), next = bone(`${finger}intermediate`, side);
      if (!knuckle || !next) continue;
      const direction = at(next).sub(at(knuckle)).normalize();
      const flat = (v) => v.clone().addScaledVector(palm, -v.dot(palm)).normalize();
      const spread = flat(direction).angleTo(flat(middle));
      const sign = Math.sign(flat(direction).cross(flat(middle)).dot(palm)) || 1;
      const local = palm.clone().applyQuaternion(knuckle.getWorldQuaternion(new THREE.Quaternion()).invert());
      knuckle.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(local, sign * spread * FINGER_CLOSE));
      knuckle.updateMatrixWorld(true);
    }
    // Knuckle by knuckle from the hand out, so each turn starts from the
    // one before it (the palm side stays the same for the whole hand).
    for (const finger of FINGERS) {
      const chain = KNUCKLES.map((knuckle) => bone(`${finger}${knuckle}`, side));
      chain.forEach((b, i) => b && close(b, chain[i + 1], palm, FINGER_CURL));
    }
    const thumbs = KNUCKLES.map((knuckle) => bone(`thumb${knuckle}`, side));
    thumbs.forEach((b, i) => b && close(b, thumbs[i + 1], palm, THUMB_CURL));
  }
  for (const clip of clips) {
    for (const track of clip.tracks) {
      const quaternion = curled.get(track.name);
      if (!quaternion) continue;
      for (let i = 0; i < track.values.length; i += 4) quaternion.toArray(track.values, i);
    }
  }
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
 *   playPassBy: (from: THREE.Vector3, to: THREE.Vector3, duration: number,
 *     options?: { style?: 'run' | 'walk' | 'sly', stay?: boolean }) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   isRunning: () => boolean,
 *   hasGaitAnimations: () => boolean,
 *   setGlitching: (on: boolean) => void, glitch: () => void,
 *   setShown: (on: boolean) => void,
 *   setDistressed: (on: boolean) => void, engageDistressed: (point: THREE.Vector3 | null) => void,
 *   bindPose: Map<THREE.Bone, THREE.Quaternion> }>}
 */
export function loadJax() {
  return new GLTFLoader().loadAsync(JAX_URL).then(async (gltf) => {
    const model = gltf.scene;
    const gaitClips = await loadJaxClips(model).catch((error) => {
      console.warn('Jax\'s Mixamo animations could not be loaded; keeping his procedural gait.', error);
      return [];
    });
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
      lowerArmL: findBone(model, 'lowerarml'),
      lowerArmR: findBone(model, 'lowerarmr'),
      chest: findBone(model, 'chest'),
      neck: findBone(model, 'neck'),
      shoulderL: findBone(model, 'shoulderl'),
      shoulderR: findBone(model, 'shoulderr'),
      spine: findBone(model, 'spine'),
      head: findBone(model, 'head'),
    };
    // The rig's own bind pose, kept before the arms are lowered below: the
    // bedroom pass-by (jaxBedroomPass.js) builds its hands-in-pockets pose
    // from the T-pose, and starting from the lowered arms lowered them twice.
    const bindPose = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) bindPose.set(bone, bone.quaternion.clone());
    }

    // Bring the T-pose arms down to his sides before anything else reads
    // these as "rest" — see ARM_LOWER_ANGLE above.
    const armLower = new THREE.Quaternion().setFromAxisAngle(ARM_LOWER_AXIS, ARM_LOWER_ANGLE);
    if (bones.upperArmL) bones.upperArmL.quaternion.premultiply(armLower);
    if (bones.upperArmR) bones.upperArmR.quaternion.premultiply(armLower);

    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }
    relaxHands(model, gaitClips);

    const gaitMixer = gaitClips.length ? new THREE.AnimationMixer(model) : null;
    const gaitActions = Object.fromEntries(gaitClips.map((clip) => [clip.name, gaitMixer.clipAction(clip)]));
    model.updateMatrixWorld(true);
    const gaitHip = findBone(model, 'hips');
    const gaitHipHeight = gaitHip
      ? gaitHip.getWorldPosition(new THREE.Vector3()).y - new THREE.Box3().setFromObject(model).min.y
      : 0;
    const gaitSpeeds = Object.fromEntries(gaitClips.map((clip) => [
      clip.name,
      clip.userData.speedPerHipHeight * gaitHipHeight,
    ]));

    const swing = new THREE.Quaternion();
    function poseLeg(bone, angle) {
      if (!bone) return;
      swing.setFromAxisAngle(HINGE_AXIS, angle);
      bone.quaternion.copy(rest.get(bone)).premultiply(swing);
    }

    let distressed=false,engaged=false,engagement=0;
    const restorePose=()=>{for(const [bone,rotation]of rest)bone.quaternion.copy(rotation);};
    function setDistressed(value){distressed=Boolean(value);engaged=false;engagement=0;targetYaw=null;restorePose();}
    let onStutter = null;
    const restless = { on: false, homeYaw: 0 };
    /** Restless: standing at his mark facing `homeYaw` (see the note at the top); off returns him to plain standing. */
    function setRestless(value, homeYaw = jax.rotation.y) {
      restless.on = Boolean(value);
      restless.homeYaw = homeYaw;
      engaged = false; engagement = 0; targetYaw = null; distressed = false;
      restorePose();
      model.position.x = 0;
    }
    /** Restless: stop and turn to face a world point; null goes back to pacing at his wall. */
    function engage(point) {
      engaged = Boolean(point);
      if (point) faceTowards(point);
      else targetYaw = restless.homeYaw;
    }
    function engageDistressed(point){engaged=Boolean(point);faceTowards(point);}
    let walk = null;
    let idleTime = 0;
    let targetYaw = null;
    const ownPosition = new THREE.Vector3();
    let glitching = false;
    const skip = { gap: 0, hold: 0, tear: 0 };
    const between = ([min, max]) => min + Math.random() * (max - min);

    /** Advances the idle's clock, holding and jumping it while glitching. */
    function stutter(deltaSeconds) {
      skip.tear = Math.max(0, skip.tear - deltaSeconds);
      if (!glitching && skip.tear === 0) {
        idleTime += deltaSeconds;
        return;
      }
      if (skip.hold > 0) {
        skip.hold -= deltaSeconds;
        return;
      }
      idleTime += deltaSeconds;
      skip.gap -= deltaSeconds;
      if (skip.gap > 0 && skip.tear === 0) return;
      skip.hold = between(STUTTER_HOLD);
      onStutter?.();
      skip.gap = between(STUTTER_GAP);
      idleTime += STUTTER_SKIP;
    }

    /** Standing normally: rest pose, a slight elbow bend, a slow small breath. */
    function standNormally(time) {
      restorePose();
      bendBone(bones.spine, jax, UP, Math.sin(time * IDLE_BREATHE_HZ * Math.PI * 2) * IDLE_BREATHE_ANGLE);
      poseLeg(bones.lowerArmL, IDLE_ELBOW_BEND);
      poseLeg(bones.lowerArmR, IDLE_ELBOW_BEND);
      bendBone(bones.upperArmL, jax, FORWARD, ARM_OUT);
      bendBone(bones.upperArmR, jax, FORWARD, -ARM_OUT);
      model.position.x = 0;
    }

    /** Turns him toward targetYaw (if any), `rate` as sharp as TURN_SHARPNESS. */
    function turnToTarget(deltaSeconds, rate = 1) {
      if (targetYaw === null) return;
      const diff = THREE.MathUtils.euclideanModulo(targetYaw - jax.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      jax.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * rate * deltaSeconds));
    }

    /** `stay`: stop and stand at `to` (the Lobby chase) rather than vanish there. */
    function playPassBy(from, to, duration, { style = 'run', stay = false } = {}) {
      distressed=false;engaged=false;engagement=0;targetYaw=null;restorePose();
      gaitMixer?.stopAllAction();
      jax.position.copy(from);
      jax.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
      jax.rotation.x = 0;
      jax.rotation.z = 0;
      jax.visible = true;
      // Clears any idle hunch/tremble left over from standing still, so
      // the run starts from a clean bind pose rather than a frozen bend.
      if (bones.spine) bones.spine.quaternion.copy(rest.get(bones.spine));
      if (bones.head) bones.head.quaternion.copy(rest.get(bones.head));
      model.position.x = 0;
      const gaitName = style === 'run' ? 'run' : 'walk';
      const action = gaitSpeeds[gaitName] > 0 ? gaitActions[gaitName] : null;
      if (action) {
        action.reset();
        action.timeScale = from.distanceTo(to) / Math.max(duration, 1e-4) / gaitSpeeds[gaitName];
        action.play();
      }
      walk = { from: from.clone(), to: to.clone(), duration, elapsed: 0, style, stay, action };
    }

    /** Turns him (smoothly, while idle) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) { targetYaw = null; return; }
      jax.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    function update(deltaSeconds) {
      if (!walk) {
        stutter(deltaSeconds);
        const time = idleTime;
        standNormally(time);
        if (restless.on) { turnToTarget(deltaSeconds, 0.5); return; }
        if (distressed) {
          engagement = THREE.MathUtils.lerp(engagement, engaged ? 1 : 0, 1 - Math.exp(-deltaSeconds * 1.4));
          bendBone(bones.head, jax, SIDEWAYS, DISTRESS_HEAD_DROP * (1 - engagement * 0.6));
          if (engaged) turnToTarget(deltaSeconds, 0.16);
          return;
        }
        turnToTarget(deltaSeconds);
        return;
      }
      walk.elapsed += deltaSeconds;
      const t = Math.min(walk.elapsed / walk.duration, 1);
      jax.position.lerpVectors(walk.from, walk.to, t);

      if (walk.action) {
        gaitMixer.update(deltaSeconds);
        // The Mixamo swing brings his hands across his chest: out a little, clear of it.
        bendBone(bones.upperArmL, jax, FORWARD, RUN_ARM_OUT);
        bendBone(bones.upperArmR, jax, FORWARD, -RUN_ARM_OUT);
      } else {
        const walking = walk.style !== 'run';
        const phase = walk.elapsed * (walking ? 1.4 : STRIDE_HZ) * Math.PI * 2;
        const stride = walking ? THREE.MathUtils.degToRad(26) : LEG_SWING;
        const knee = walking ? THREE.MathUtils.degToRad(28) : KNEE_BEND;
        poseLeg(bones.upperLegL, Math.sin(phase) * stride);
        poseLeg(bones.upperLegR, -Math.sin(phase) * stride);
        poseLeg(bones.lowerLegL, Math.max(0, Math.sin(phase + Math.PI / 2)) * knee);
        poseLeg(bones.lowerLegR, Math.max(0, Math.sin(phase + Math.PI / 2 + Math.PI)) * knee);
        poseLeg(bones.upperArmL, walking ? 0 : -Math.sin(phase) * ARM_SWING);
        poseLeg(bones.upperArmR, walking ? 0 : Math.sin(phase) * ARM_SWING);
        poseLeg(bones.lowerArmL, walking ? SLY_ELBOW_BEND : ELBOW_BEND);
        poseLeg(bones.lowerArmR, walking ? SLY_ELBOW_BEND : ELBOW_BEND);
        jax.position.y += Math.abs(Math.sin(phase)) * (walking ? .018 : BOB_HEIGHT);
        jax.rotation.x = walking ? -.035 : LEAN_ANGLE * Math.min(walk.elapsed / LEAN_IN_SECONDS, 1);
        jax.rotation.z = walking ? Math.sin(phase) * .025 : 0;
      }

      if (t >= 1) {
        gaitMixer?.stopAllAction();
        restorePose();
        if (walk.stay) {
          // Back to rest, so the idle branch above starts from a clean pose
          // instead of freezing mid-stride.
          for (const [bone, quaternion] of rest) bone.quaternion.copy(quaternion);
          jax.position.copy(walk.to);
          jax.rotation.x = 0;
          jax.rotation.z = 0;
        } else {
          jax.visible = false;
        }
        walk = null;
      }
    }

    /**
     * Shows or hides him while keeping his light in the scene, just dimmed
     * to nothing: a light coming or going changes the scene's light count,
     * and that recompiles every material in view.
     */
    function setShown(on) {
      jax.visible = true;
      model.visible = on;
      keyLight.intensity = on ? KEY_LIGHT_INTENSITY : 0;
    }

    return {
      jax, update, playPassBy, faceTowards, setDistressed, engageDistressed, bindPose, setShown,
      setRestless, engage,
      hasGaitAnimations: () => Boolean(gaitActions.walk && gaitActions.run),
      /** Called as each glitch stutter starts (for effects in step with it). */
      set onStutter(callback) { onStutter = callback; },
      isRunning: () => walk !== null,
      setGlitching(on) { glitching = on; },
      glitch() { skip.tear = GLITCH_SECONDS; },
    };
  });
}

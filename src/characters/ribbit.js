import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

// Built by tools/buildRibbitMixamo.mjs from Adobe Mixamo's downloads in
// assets-src/ribbit-mixamo/: the team's Ribbit (the cleaned-up, 2.2 m
// ribbit-rigged.glb, exported for Mixamo by tools/exportRibbitForMixamo.mjs)
// on Mixamo's auto-rigged skeleton, feet at the origin, facing +Z, with
// three looping clips. Re-run the build after replacing a download.
const RIBBIT_URL = './models/characters/Ribbit/ribbit-mixamo.glb';
const RIBBIT_HEIGHT = 2.2; // the mesh Mixamo was given is this tall

// Pose name (setPose) -> clip. 'curled' is Mixamo's sleeping loop: on her
// side, knees bent, an arm under her head. 'sitting' is a chair sit, legs
// hanging, so she sits on the edge of her bed with her feet on the floor.
const CLIPS = { standing: 'SadIdle', curled: 'Sleeping', sitting: 'Sitting' };

// Invisible cylinder the player collides with, as for Caine and Kaufmo: a
// skinned mesh moves as it animates and its thin limbs slip between the
// wall probes. It's also what the E-key crosshair ray hits.
const COLLIDER_RADIUS = 0.4;

// How quickly she turns to face someone talking to her.
const TURN_SHARPNESS = 5;

// Distress (setDistress, 0-3) is layered on top of the clips while she's
// upright: per level she hunches further forward, drops her head lower and
// trembles harder. It eases toward the target level, so being steadied
// reads as her slowly straightening up rather than snapping.
const DISTRESS_SHARPNESS = 3;
const HUNCH_PER_LEVEL = 0.07;     // radians of extra spine bend
const HEAD_DROP_PER_LEVEL = 0.1;  // radians of extra head bow
const TREMBLE_PER_LEVEL = 0.012;  // radians of head shake amplitude
const TREMBLE_SPEED = 28;         // radians per second

// The sleeping clip lies her along her own -X (head) to +X (feet) on the
// floor. Turned a quarter, her head points along the group's -Z and she
// faces -X, so a caller places the group where her hips go on the
// mattress, turned so -Z points at the pillow (as the procedural pose
// before it did). Her hips are already their own height off the floor in
// the clip: about a body's half-thickness above the mattress.
const SLEEP_YAW = -Math.PI / 2;

// There's no Mixamo wake-up clip, so waking is staged from the two loops,
// slow on purpose ("sits up slowly"). As fractions of the time: `turn` is
// when she comes round and over to wherever `at` puts her (the edge of the
// bed), still lying, legs out over the edge; `sitUp` when the sleeping loop
// crossfades into sitting and she drops onto the edge, at the same rate as
// her hips rise so they stay on the mattress. Crossfading while she was
// still mid-bed swung her legs down through the mattress and the floor.
// Other changes are quicker.
const WAKE = { seconds: 2.8, turn: [0, 0.55], sitUp: [0.4, 1] };
const SHIFT = { seconds: 0.6, turn: [0, 1], sitUp: [0, 1] };

// Even so, part-way between lying and sitting the blend can swing her feet
// below the floor she's sitting down onto, so while she moves (with `at`)
// she's lifted just enough to keep them on it. Bone -> how far her sole is
// below it, measured with her feet flat on the floor sitting.
const SOLES = {
  LeftFoot: 0.09, RightFoot: 0.09,
  LeftToeBase: 0.006, RightToeBase: 0.006, LeftToe_End: 0.006, RightToe_End: 0.006,
};

/**
 * Loads Ribbit, idling. Callers set position and rotation.y, or pass
 * `at` to setPose to have her move there as she changes pose.
 *
 * @returns {Promise<{ ribbit: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setDistress: (level: number) => void,
 *   setPose: (name: 'standing' | 'curled' | 'sitting', options?: {
 *     immediate?: boolean,
 *     at?: { x: number, y: number, z: number, yaw: number } }) => void }>}
 */
export function loadRibbit() {
  return new GLTFLoader().loadAsync(RIBBIT_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // Lying down or sitting, the skin leaves its T-pose bounds.
      if (child.isSkinnedMesh) child.frustumCulled = false;
    });

    // ribbit (placed by the room) -> body (lines the clip up with it) -> model.
    const ribbit = new THREE.Group();
    ribbit.name = 'Ribbit';
    const body = new THREE.Group();
    body.name = 'RibbitBody';
    ribbit.add(body);
    body.add(model);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [pose, clipName] of Object.entries(CLIPS)) {
      const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
      if (!clip) throw new Error(`ribbit-mixamo.glb has no ${clipName} clip`);
      actions[pose] = mixer.clipAction(clip);
    }

    // Raycasts ignore `visible`, so the hidden cylinder still blocks.
    const collider = new THREE.Mesh(
      new THREE.CylinderGeometry(COLLIDER_RADIUS, COLLIDER_RADIUS, RIBBIT_HEIGHT, 16),
      new THREE.MeshBasicMaterial(),
    );
    collider.name = 'RibbitCollider';
    collider.position.y = RIBBIT_HEIGHT / 2;
    collider.visible = false;
    ribbit.add(collider);

    const spine = model.getObjectByName('mixamorigSpine1');
    const head = model.getObjectByName('mixamorigHead');
    const feet = Object.entries(SOLES)
      .map(([name, sole]) => ({ bone: model.getObjectByName(`mixamorig${name}`), sole }))
      .filter(({ bone }) => bone);

    // Where the body sits in the group for each pose. Asleep, her hips
    // (wherever the clip leaves them, read from its first key) go on the
    // group's origin.
    const sleepHips = hipsAtStart(gltf.animations, CLIPS.curled, model);
    sleepHips.applyAxisAngle(UP, SLEEP_YAW);
    const BODY = {
      standing: { x: 0, z: 0, yaw: 0 },
      sitting: { x: 0, z: 0, yaw: 0 },
      curled: { x: -sleepHips.x, z: -sleepHips.z, yaw: SLEEP_YAW },
    };

    let targetYaw = null;
    const ownPosition = new THREE.Vector3();
    let distress = 0;
    let distressTarget = 0;
    let time = 0;

    // A pose change eases the body (and, given `at`, the whole group) from
    // where it was to where the new pose wants it, and crossfades the clips,
    // over `move.duration` on `move.timing` (WAKE or SHIFT).
    let pose = null;
    const move = {
      elapsed: 0, duration: 0, timing: SHIFT,
      fromBody: { x: 0, z: 0, yaw: 0 }, toBody: BODY.standing,
      fromGroup: new THREE.Vector3(), toGroup: null, fromYaw: 0, toYaw: 0,
      fadeFrom: null, fadeTo: null,
    };

    function lerpYaw(from, to, t) {
      return from + (THREE.MathUtils.euclideanModulo(to - from + Math.PI, Math.PI * 2) - Math.PI) * t;
    }

    function applyMove() {
      const { lerp, smoothstep } = THREE.MathUtils;
      const t = move.duration > 0 ? move.elapsed / move.duration : 1;
      const turn = smoothstep(t, ...move.timing.turn);
      const sitUp = smoothstep(t, ...move.timing.sitUp);
      // The body's own offset goes with the clips: asleep it's a quarter
      // turn from sitting, so she lies with her legs pointing where her
      // sitting legs will hang, and they swing down over the edge of the
      // bed as she sits up rather than through it.
      const { fromBody: a, toBody: b } = move;
      body.position.set(lerp(a.x, b.x, sitUp), 0, lerp(a.z, b.z, sitUp));
      body.rotation.y = lerpYaw(a.yaw, b.yaw, sitUp);
      if (move.toGroup) {
        const { fromGroup: from, toGroup: to } = move;
        ribbit.position.set(lerp(from.x, to.x, turn), lerp(from.y, to.y, sitUp), lerp(from.z, to.z, turn));
        ribbit.rotation.y = lerpYaw(move.fromYaw, move.toYaw, turn);
      }
      if (move.fadeFrom) {
        move.fadeFrom.setEffectiveWeight(1 - sitUp);
        move.fadeTo.setEffectiveWeight(sitUp);
        if (t >= 1) {
          move.fadeFrom.stop();
          move.fadeFrom = null;
        }
      }
    }

    function update(deltaSeconds) {
      mixer.update(deltaSeconds);
      time += deltaSeconds;

      const moving = move.elapsed < move.duration;
      if (moving) {
        move.elapsed = Math.min(move.elapsed + deltaSeconds, move.duration);
        applyMove();
        if (move.toGroup) keepFeetAbove(move.toGroup.y);
      }

      // Hunching and trembling are written for an upright body; asleep
      // (the sleeping clip's weight) they'd bend her the wrong way.
      const upright = 1 - actions.curled.getEffectiveWeight();
      distress = THREE.MathUtils.damp(distress, distressTarget, DISTRESS_SHARPNESS, deltaSeconds);
      const shaken = distress * upright;
      bendBone(spine, body, SIDEWAYS, HUNCH_PER_LEVEL * shaken);
      bendBone(head, body, SIDEWAYS, HEAD_DROP_PER_LEVEL * shaken);
      if (shaken > 0.01) {
        bendBone(head, body, UP, Math.sin(time * TREMBLE_SPEED) * TREMBLE_PER_LEVEL * shaken);
      }

      if (targetYaw !== null && !(moving && move.toGroup)) {
        const diff = THREE.MathUtils.euclideanModulo(targetYaw - ribbit.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        ribbit.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      }
    }

    /** Lifts her (applyMove set her height this frame) so no sole is below floorY. */
    function keepFeetAbove(floorY) {
      ribbit.updateMatrixWorld(true);
      let lowest = Infinity;
      // elements[13]: the bone's world height.
      for (const { bone, sole } of feet) lowest = Math.min(lowest, bone.matrixWorld.elements[13] - sole);
      if (lowest < floorY) ribbit.position.y += floorY - lowest;
    }

    /** Turns her (smoothly, in update) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) {
        targetYaw = null;
        return;
      }
      ribbit.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    /** 0 = calm, up to 3 = badly shaken; she eases toward it over ~a second. */
    function setDistress(level) {
      distressTarget = THREE.MathUtils.clamp(level, 0, 3);
    }

    /**
     * Crossfades into a pose's clip; `immediate` snaps instead, for setting
     * the scene up. `at` (the group's position and yaw in its parent) moves
     * her there over the same time: sitting up from asleep is staged (WAKE)
     * as she comes over to the edge of the bed and sits up on it.
     */
    function setPose(name, { immediate = false, at = null } = {}) {
      const next = actions[name];
      if (!next) throw new Error(`Unknown Ribbit pose: ${name}`);
      const previous = pose && actions[pose];
      move.timing = pose === 'curled' && name === 'sitting' ? WAKE : SHIFT;
      const duration = immediate || !previous ? 0 : move.timing.seconds;

      move.fromBody = { x: body.position.x, z: body.position.z, yaw: body.rotation.y };
      move.toBody = BODY[name];
      move.fromGroup.copy(ribbit.position);
      move.fromYaw = ribbit.rotation.y;
      move.toGroup = at ? new THREE.Vector3(at.x, at.y, at.z) : null;
      move.toYaw = at ? at.yaw : ribbit.rotation.y;
      move.elapsed = 0;
      move.duration = duration;

      if (next !== previous) {
        // A change of mind mid-fade: the clip it was fading out goes now.
        if (move.fadeFrom && move.fadeFrom !== next) move.fadeFrom.stop();
        next.reset().play();
        if (duration > 0) {
          next.setEffectiveWeight(0);
          move.fadeFrom = previous;
          move.fadeTo = next;
        } else {
          next.setEffectiveWeight(1);
          if (previous) previous.stop();
          move.fadeFrom = null;
          // Start a fresh loop at a random point so she isn't
          // mid-identical-breath every time the room loads.
          next.time = Math.random() * next.getClip().duration;
        }
      }
      pose = name;
      applyMove();
    }

    setPose('standing', { immediate: true });
    return { ribbit, collider, update, faceTowards, setDistress, setPose };
  });
}

/** The hips' position in the model's root at a clip's first key, in metres, on the floor plane. */
function hipsAtStart(animations, clipName, model) {
  const track = THREE.AnimationClip.findByName(animations, clipName)
    ?.tracks.find((t) => t.name === 'mixamorigHips.position');
  const hips = model.getObjectByName('mixamorigHips');
  if (!track || !hips) return new THREE.Vector3();
  // The track is in the hips' parent's units (Mixamo's centimetres, scaled
  // down by the root node), so take it through that parent to the model.
  const point = new THREE.Vector3(track.values[0], 0, track.values[2]);
  model.updateMatrixWorld(true);
  point.applyMatrix4(hips.parent.matrixWorld);
  return point.applyMatrix4(model.matrixWorld.clone().invert()).setY(0);
}

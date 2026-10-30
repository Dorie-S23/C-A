import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const RAGATHA_URL = './models/characters/Ragatha/ragatha.glb';
// A little taller than Pomni (1.8), well under Caine (2.6).
const RAGATHA_HEIGHT = 2.0;

// Invisible cylinder the player collides with, as for the rest of the cast:
// her limbs swing as she animates and her skirt is far wider at the hem
// than anywhere the wall probes would catch it.
const COLLIDER_RADIUS = 0.5;

// The model is a static Sketchfab export — no skeleton, no clips — built
// from one mesh per body part, facing +X with her right side towards +Z.
// She's animated by regrouping those parts under pivots at her joints
// (buildRig) and posing the pivots procedurally every frame. Everything
// below is in the model's own units (she's ~3.7 tall before scaling).
//
// Parts are matched by node name with glTF-Transform's "_<n>" suffix
// stripped; anything not listed rides on her chest.
const HEAD_PARTS = /^(Head|EyeButton|EyeNormal|Nose|Bow|Mouth|Plane\d*|Vert\d*)$/;
const HAIR_PARTS = /^Vert\d*$/;
const HIP_PARTS = /^(waistband|dressbottom\d*)$/;
// Both arms are one mesh (and both sleeves, and both legs and shoes), so
// these are cut in half down her middle (z = 0) into a left and a right.
const ARM_PARTS = /^(Arms|armdress)$/;
const LEG_PARTS = /^legs$/;

const HIPS_PIVOT = new THREE.Vector3(0, -0.5, 0);
const CHEST_PIVOT = new THREE.Vector3(-0.02, -0.4, 0);
const NECK_PIVOT = new THREE.Vector3(-0.03, 0.14, 0);
// Where each arm meets the body, and its hand in the exported pose (arms
// held out to the sides, palms up). Index 0 is her right (+Z), 1 her left.
const SHOULDERS = [new THREE.Vector3(-0.17, -0.36, 0.29), new THREE.Vector3(-0.04, -0.4, -0.3)];
const HANDS = [new THREE.Vector3(-0.49, -0.57, 0.925), new THREE.Vector3(0.024, -0.5, -1.06)];
// The legs are exported mid-stride, one foot back and one forward. Each
// pivots at the top of the leg (hidden up her skirt), and that top is
// moved to a hip under her centre so both feet land side by side.
const LEG_TOPS = [new THREE.Vector3(-0.23, -1.57, 0.23), new THREE.Vector3(0.24, -1.56, -0.25)];
const FEET = [new THREE.Vector3(-0.41, -2.56, 0.36), new THREE.Vector3(0.39, -2.57, -0.37)];
const HIPS = [new THREE.Vector3(0, -1.57, 0.2), new THREE.Vector3(0, -1.57, -0.2)];

// How quickly her pose eases into the next one; lower is floatier.
const POSE_SHARPNESS = 6;
const TURN_SHARPNESS = 5;
const WALK_SPEED = 1.2; // metres per second
const STEP_LENGTH = 0.5; // metres per step
const LEG_SWING = 0.32; // shorter, softer stride so her feet don't drag
const ARM_SWING = 0.24;
const WAVE_SECONDS = 2.4; // then the greeting settles into chatting
const LOOK_LIMIT = 1.1; // the furthest (radians) her head and chest turn from her body
const _up = new THREE.Vector3(0, 1, 0);
const _swap = new THREE.Vector3();

/**
 * Loads Ragatha, idling. Callers set position and rotation.y, then drive
 * her with:
 * - setPose(name): one of POSES' keys — idle, listen, wave, chatty,
 *   watch, worried. Poses ease into each other, and replay from their
 *   start (a wave waves again) when set twice.
 * - setSpeaking(bool): nods and small hand beats on top of any pose.
 * - walkTo(point, onArrive): walks there in a straight line, turning to
 *   face where she's going, on whatever pose her upper body is in.
 * - faceTowards(point | null): turns her body to face a point.
 * - lookTowards(point | null): turns her head (and a little of her chest)
 *   to a point her body isn't facing, and waves towards it.
 *
 * Her feet stay on her origin: as she strides she's lowered by however
 * far her lower foot has lifted (applyPose), so callers only set her y to
 * the floor's.
 *
 * @returns {Promise<{ ragatha: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   setPose: (name: string) => void, setSpeaking: (speaking: boolean) => void,
 *   walkTo: (point: THREE.Vector3, onArrive?: () => void) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   lookTowards: (worldPoint: THREE.Vector3 | null) => void }>}
 */
export function loadRagatha() {
  return new GLTFLoader().loadAsync(RAGATHA_URL).then((gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });

    const rig = buildRig(model);
    const pose = createPoseState();
    let poseName = 'idle';
    let poseTime = 0;
    let speaking = false;
    let time = Math.random() * 100; // so her sway isn't in step with anything else
    POSES.idle(pose.target, 0, time);
    pose.current.copy(pose.target);
    applyPose(rig, pose.current, time);
    rig.footFloor = lowestFoot(rig); // where her feet are, standing

    // Scaled so her feet (in the idle stance) sit on the origin. x/z are
    // left alone: the hips are already at the model's origin, and centring
    // on the bounding box would shift her by however her arms are held.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const scale = RAGATHA_HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(scale);
    // Her soles from what's drawn: a split limb's bounds still take in the
    // other half's (undrawn) vertices, which left her 2 cm off the floor.
    model.position.y = -lowestDrawn(model) * scale;
    model.rotation.y = -Math.PI / 2; // face +Z like the rest of the cast

    const ragatha = new THREE.Group();
    ragatha.name = 'Ragatha';
    ragatha.add(model);

    // Raycasts ignore `visible`, so the hidden cylinder still blocks.
    const collider = new THREE.Mesh(
      new THREE.CylinderGeometry(COLLIDER_RADIUS, COLLIDER_RADIUS, RAGATHA_HEIGHT, 16),
      new THREE.MeshBasicMaterial(),
    );
    collider.name = 'RagathaCollider';
    collider.position.y = RAGATHA_HEIGHT / 2;
    collider.visible = false;
    ragatha.add(collider);

    let targetYaw = null;
    let lookPoint = null;
    let walkTarget = null;
    let onArrive = null;
    let walkWeight = 0;
    let walkPhase = 0;
    const toTarget = new THREE.Vector3();
    const ownPosition = new THREE.Vector3();

    function update(deltaSeconds) {
      time += deltaSeconds;
      poseTime += deltaSeconds;

      if (walkTarget) {
        toTarget.subVectors(walkTarget, ragatha.position).setY(0);
        const step = WALK_SPEED * deltaSeconds;
        if (toTarget.length() <= step) {
          ragatha.position.x = walkTarget.x;
          ragatha.position.z = walkTarget.z;
          walkTarget = null;
          const callback = onArrive;
          onArrive = null;
          callback?.();
        } else {
          targetYaw = Math.atan2(toTarget.x, toTarget.z);
          ragatha.position.addScaledVector(toTarget.normalize(), step);
          walkPhase += (step / STEP_LENGTH) * Math.PI;
        }
      }
      // Ease out of the stride rather than snapping both feet together.
      walkWeight = THREE.MathUtils.damp(walkWeight, walkTarget ? 1 : 0, 8, deltaSeconds);
      if (!walkTarget && walkWeight < 0.01) walkPhase = 0;

      if (targetYaw !== null) {
        const diff = THREE.MathUtils.euclideanModulo(targetYaw - ragatha.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        ragatha.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      }

      POSES[poseName](pose.target, poseTime, time);
      if (speaking) addSpeaking(pose.target, time);
      if (lookPoint) {
        ragatha.getWorldPosition(ownPosition);
        const yaw = Math.atan2(lookPoint.x - ownPosition.x, lookPoint.z - ownPosition.z);
        const turn = THREE.MathUtils.clamp(
          THREE.MathUtils.euclideanModulo(yaw - ragatha.rotation.y + Math.PI, Math.PI * 2) - Math.PI,
          -LOOK_LIMIT, LOOK_LIMIT);
        // Only some of the way: turned right round, her face is side-on to
        // whoever's watching her from in front, and lost behind her curls.
        pose.target.head.y += turn * 0.25;
        pose.target.chest.y += turn * 0.1;
        if (poseName === 'wave' && poseTime <= WAVE_SECONDS) {
          // She waves with the hand on their side (the pose raises her right),
          // and it swings the rest of the way round, so she waves at them.
          const { arms } = pose.target;
          if (turn > 0) {
            _swap.copy(arms[0]);
            arms[0].copy(arms[1]).z *= -1;
            arms[1].copy(_swap).z *= -1;
          }
          arms[turn > 0 ? 1 : 0].applyAxisAngle(_up, turn * 0.8);
        }
      }
      if (walkWeight > 0.001) addWalk(pose.target, walkPhase, walkWeight);
      pose.current.dampTowards(pose.target, 1 - Math.exp(-POSE_SHARPNESS * deltaSeconds));
      applyPose(rig, pose.current, time);
    }

    function setPose(name) {
      if (!POSES[name]) return;
      poseName = name;
      poseTime = 0;
    }

    function setSpeaking(value) {
      speaking = value;
    }

    function walkTo(point, callback) {
      walkTarget = point.clone();
      onArrive = callback ?? null;
    }

    /** Turns her (smoothly, in update) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) {
        targetYaw = null;
        return;
      }
      ragatha.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    /** Turns her head (smoothly, as poses ease) toward a world point; null looks ahead again. */
    function lookTowards(worldPoint) {
      lookPoint = worldPoint ? worldPoint.clone() : null;
    }

    return { ragatha, collider, update, setPose, setSpeaking, walkTo, faceTowards, lookTowards };
  });
}

// --- Rig -----------------------------------------------------------------

/**
 * Regroups the model's part meshes under a pivot per joint:
 *   root (bobs as she walks)
 *   ├─ hips ─ chest ─┬─ head ─ one pivot per hair curl
 *   │                └─ arms[0], arms[1]
 *   └─ legs[0], legs[1]
 * At this point the model is unscaled and unparented, so world space is
 * model space and every pivot can be placed with model-space coordinates.
 */
function buildRig(model) {
  const parts = model.children[0]; // the Sketchfab root node, holding every part
  model.updateMatrixWorld(true);

  const root = addPivot(parts, new THREE.Vector3(), 'RigRoot');
  const hips = addPivot(root, HIPS_PIVOT, 'Hips');
  const chest = addPivot(hips, CHEST_PIVOT, 'Chest');
  const head = addPivot(chest, NECK_PIVOT, 'Head');
  const arms = SHOULDERS.map((shoulder, i) => addPivot(chest, shoulder, i === 0 ? 'RightArm' : 'LeftArm'));
  const legs = LEG_TOPS.map((top, i) => addPivot(root, top, i === 0 ? 'RightLeg' : 'LeftLeg'));
  const hair = [];

  for (const node of [...parts.children]) {
    if (node === root) continue;
    const name = node.name.replace(/_\d+$/, '');
    if (ARM_PARTS.test(name)) splitIntoSides(node, arms);
    else if (LEG_PARTS.test(name)) splitIntoSides(node, legs);
    else if (HAIR_PARTS.test(name)) hair.push(addHairCurl(head, node));
    else if (HEAD_PARTS.test(name)) head.attach(node);
    else if (HIP_PARTS.test(name)) hips.attach(node);
    else chest.attach(node);
  }

  // Each foot, in its leg's frame (which turns with the leg).
  const feet = FEET.map((foot, i) => legs[i].worldToLocal(foot.clone()));
  // Each leg is posed about its own top, then moved to sit under her hips.
  legs.forEach((leg, i) => leg.position.copy(root.worldToLocal(HIPS[i].clone())));

  const restDir = (from, to) => new THREE.Vector3().subVectors(to, from).normalize();
  return {
    root,
    hips,
    chest,
    head,
    arms,
    legs,
    feet,
    footFloor: null, // set once she's standing (loadRagatha)
    hair,
    armRest: SHOULDERS.map((shoulder, i) => restDir(shoulder, HANDS[i])),
    legRest: LEG_TOPS.map((top, i) => restDir(top, FEET[i])),
  };
}

function addPivot(parent, modelSpacePoint, name) {
  const pivot = new THREE.Group();
  pivot.name = name;
  parent.add(pivot);
  pivot.position.copy(parent.worldToLocal(modelSpacePoint.clone()));
  pivot.updateMatrixWorld(true);
  return pivot;
}

/**
 * Moves each triangle of every mesh under `node` to sides[0] (z >= 0, her
 * right) or sides[1] (her left), by which side of her middle it's on.
 */
function splitIntoSides(node, sides) {
  const meshes = [];
  node.traverse((child) => { if (child.isMesh) meshes.push(child); });
  const corner = new THREE.Vector3();

  for (const mesh of meshes) {
    const { geometry } = mesh;
    const position = geometry.attributes.position;
    const index = geometry.index ? geometry.index.array : Array.from({ length: position.count }, (_, i) => i);
    const triangles = [[], []];
    for (let i = 0; i < index.length; i += 3) {
      let z = 0;
      for (let k = 0; k < 3; k++) z += corner.fromBufferAttribute(position, index[i + k]).applyMatrix4(mesh.matrixWorld).z;
      triangles[z >= 0 ? 0 : 1].push(index[i], index[i + 1], index[i + 2]);
    }

    triangles.forEach((indices, side) => {
      const half = geometry.clone();
      half.setIndex(indices);
      half.computeBoundingBox();
      half.computeBoundingSphere();
      const halfMesh = new THREE.Mesh(half, mesh.material);
      halfMesh.castShadow = true;
      halfMesh.receiveShadow = true;
      mesh.matrixWorld.decompose(halfMesh.position, halfMesh.quaternion, halfMesh.scale);
      sides[side].attach(halfMesh);
    });
    geometry.dispose();
  }
  node.removeFromParent();
}

/** The lowest point of any triangle drawn under `object`, in world space. */
function lowestDrawn(object) {
  const corner = new THREE.Vector3();
  let lowest = Infinity;
  object.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    const index = child.geometry.index;
    const count = index ? index.count : position.count;
    for (let i = 0; i < count; i++) {
      lowest = Math.min(lowest, corner.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(child.matrixWorld).y);
    }
  });
  return lowest;
}

/** Hangs a hair curl from a pivot at its top so it can sway on its own. */
function addHairCurl(head, node) {
  const box = new THREE.Box3().setFromObject(node);
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  const pivot = addPivot(head, top, `${node.name}Pivot`);
  pivot.attach(node);
  return { pivot, phase: Math.random() * Math.PI * 2, rate: 0.8 + Math.random() * 0.4 };
}

// --- Poses ---------------------------------------------------------------
//
// A pose is a set of targets — a direction for each arm and leg (in her
// chest's/hips' frame: x forward, y up, z out to that side) and Euler
// angles for the head, chest and hips — written by a function of how long
// the pose has been held (t) and a free-running clock (T).

function createPoseState() {
  const make = () => ({
    arms: [new THREE.Vector3(), new THREE.Vector3()],
    legs: [new THREE.Vector3(), new THREE.Vector3()],
    head: new THREE.Vector3(), // pitch (+ looks up), yaw (+ to her left), roll (+ tilts to her left)
    chest: new THREE.Vector3(), // same
    hips: new THREE.Vector3(), // same
    drop: 0, // how far her whole body is lowered, for walking
    hairEnergy: 0, // how much her curls bounce
    copy(other) {
      for (const key of ['arms', 'legs']) this[key].forEach((v, i) => v.copy(other[key][i]));
      for (const key of ['head', 'chest', 'hips']) this[key].copy(other[key]);
      this.drop = other.drop;
      this.hairEnergy = other.hairEnergy;
    },
    dampTowards(other, alpha) {
      for (const key of ['arms', 'legs']) this[key].forEach((v, i) => v.lerp(other[key][i], alpha));
      for (const key of ['head', 'chest', 'hips']) this[key].lerp(other[key], alpha);
      this.drop += (other.drop - this.drop) * alpha;
      this.hairEnergy += (other.hairEnergy - this.hairEnergy) * alpha;
    },
  });
  return { current: make(), target: make() };
}

/** Points arm/leg `side` (0 right, 1 left) forward/up/outward-ish. */
function aim(vector, side, forward, up, outward) {
  vector.set(forward, up, side === 0 ? outward : -outward);
}

/** Feet together under her, the base every pose stands on. */
function stand(p) {
  aim(p.legs[0], 0, 0, -1, 0.06);
  aim(p.legs[1], 1, 0, -1, 0.06);
  p.drop = 0;
}

const POSES = {
  // Arms hanging out from her sides (a rag doll's arms don't quite reach
  // down past that skirt), breathing and swaying from foot to foot.
  idle(p, t, T) {
    stand(p);
    aim(p.arms[0], 0, 0.05, -0.8, 0.6);
    aim(p.arms[1], 1, 0.05, -0.8, 0.6);
    p.head.set(Math.sin(T * 0.6) * 0.03, Math.sin(T * 0.37) * 0.1, 0.06 + Math.sin(T * 0.5) * 0.03);
    p.chest.set(Math.sin(T * 1.6) * 0.015, Math.sin(T * 0.4) * 0.03, 0);
    p.hips.set(0, 0, Math.sin(T * 0.8) * 0.025);
    p.hairEnergy = 0.2;
  },

  // Attentive: head cocked, hands drawn in front, the odd little nod.
  listen(p, t, T) {
    POSES.idle(p, t, T);
    aim(p.arms[0], 0, 0.35, -0.8, 0.45);
    aim(p.arms[1], 1, 0.35, -0.8, 0.45);
    const nod = Math.max(0, Math.sin(T * 1.3)) ** 6;
    p.head.set(-0.04 - nod * 0.1, Math.sin(T * 0.3) * 0.05, 0.16);
  },

  // A friendly wave at the person in front of her (hand raised towards
  // them, swaying side to side across them), then into chatting.
  wave(p, t, T) {
    if (t > WAVE_SECONDS) {
      POSES.chatty(p, t, T);
      return;
    }
    POSES.idle(p, t, T);
    aim(p.arms[0], 0, 0.72, 0.68, 0.12 + Math.sin(t * 8) * 0.2);
    aim(p.arms[1], 1, 0.15, -0.8, 0.6);
    p.head.set(0.06, 0, 0.18);
    p.chest.set(0.04, 0, -0.05);
    p.hips.set(0, 0, -0.03);
    p.drop = -Math.abs(Math.sin(t * 5)) * 0.04 * Math.max(0, 1 - t / WAVE_SECONDS); // a little bounce
    p.hairEnergy = 1;
  },

  // Chatting away: palms up and out, hands bobbing, head wobbling.
  chatty(p, t, T) {
    stand(p);
    aim(p.arms[0], 0, 0.5 + Math.sin(T * 2.2) * 0.15, -0.4 + Math.sin(T * 3.1) * 0.1, 0.7);
    aim(p.arms[1], 1, 0.5 + Math.sin(T * 2.2 + 2) * 0.15, -0.4 + Math.sin(T * 3.1 + 2) * 0.1, 0.7);
    p.head.set(0.04 + Math.sin(T * 1.7) * 0.03, Math.sin(T * 0.8) * 0.12, Math.sin(T * 1.1) * 0.1);
    p.chest.set(0.02, Math.sin(T * 0.9) * 0.05, 0);
    p.hips.set(0, 0, Math.sin(T * 0.8) * 0.025);
    p.hairEnergy = 0.5;
  },

  // Jax storming past behind Pomni: her eyes follow him across the room
  // (her right to her left) and stay on where he went.
  watch(p, t, T) {
    stand(p);
    aim(p.arms[0], 0, 0.3, -0.85, 0.35);
    aim(p.arms[1], 1, 0.3, -0.85, 0.35);
    const sweep = THREE.MathUtils.smootherstep(t, 0, 2.5);
    const yaw = THREE.MathUtils.lerp(-0.5, 0.9, sweep);
    p.head.set(0, yaw * 0.7, 0);
    p.chest.set(Math.sin(T * 1.6) * 0.01, yaw * 0.3, 0);
    p.hips.set(0, 0, 0);
    p.hairEnergy = 0.1;
  },

  // The upbeat act drops: hands wrung together in front, head down and
  // still half turned to where Jax went.
  worried(p, t, T) {
    stand(p);
    const wring = Math.sin(T * 2.4) * 0.05;
    aim(p.arms[0], 0, 0.8, -0.5 + wring, -0.2);
    aim(p.arms[1], 1, 0.8, -0.5 - wring, -0.2);
    p.head.set(-0.24 + Math.sin(T * 0.9) * 0.02, 0.25, -0.08);
    p.chest.set(-0.07 + Math.sin(T * 1.1) * 0.01, 0.06, 0);
    p.hips.set(0, 0, Math.sin(T * 0.5) * 0.01);
    p.hairEnergy = 0.05;
  },
};

/** Nods and hand beats while she's the one talking, on top of any pose. */
function addSpeaking(p, T) {
  p.head.x += Math.sin(T * 7) * 0.035;
  p.head.z += Math.sin(T * 2.3) * 0.03;
  p.arms[0].x += Math.max(0, Math.sin(T * 4.6)) * 0.12;
  p.arms[1].x += Math.max(0, Math.sin(T * 4.6 + 1.5)) * 0.12;
  p.hairEnergy = Math.max(p.hairEnergy, 0.4);
}

/** Legs stride and arms swing against them; the relaxed body stays level. */
function addWalk(p, phase, weight) {
  const swing = Math.sin(phase) * LEG_SWING * weight;
  for (let side = 0; side < 2; side++) {
    const sign = side === 0 ? 1 : -1;
    p.legs[side].set(sign * swing, -1, p.legs[side].z * (1 - weight) + (side === 0 ? 0.06 : -0.06) * weight);
    p.arms[side].x -= sign * swing * (ARM_SWING / LEG_SWING);
  }
  // Her shoulders turn against her hips, the same each step.
  p.chest.y += Math.sin(phase) * 0.05 * weight;
  p.hips.z += Math.cos(phase) * 0.018 * weight;
  p.hairEnergy = Math.max(p.hairEnergy, weight);
}

const _target = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YZX');

function setRotation(object, angles) {
  // pitch turns about her right (+Z), yaw about up, roll about forward (+X)
  object.quaternion.setFromEuler(_euler.set(angles.z, angles.y, angles.x));
}

/** How high her lower foot is in her root's frame, as her legs are posed. */
function lowestFoot(rig) {
  let lowest = Infinity;
  for (let side = 0; side < 2; side++) {
    const leg = rig.legs[side];
    lowest = Math.min(lowest, _target.copy(rig.feet[side]).applyQuaternion(leg.quaternion).add(leg.position).y);
  }
  return lowest;
}

function applyPose(rig, p, T) {
  for (let side = 0; side < 2; side++) {
    rig.arms[side].quaternion.setFromUnitVectors(rig.armRest[side], _target.copy(p.arms[side]).normalize());
    rig.legs[side].quaternion.setFromUnitVectors(rig.legRest[side], _target.copy(p.legs[side]).normalize());
  }
  setRotation(rig.head, p.head);
  setRotation(rig.chest, p.chest);
  setRotation(rig.hips, p.hips);
  // A swung leg reaches less far down: lowered by that, the lower foot stays
  // on the floor whichever leg it is.
  rig.root.position.y = -p.drop + (rig.footFloor === null ? 0 : rig.footFloor - lowestFoot(rig));

  // Curls sway gently all the time and bounce harder the livelier she is.
  for (const curl of rig.hair) {
    const slow = Math.sin(T * 1.7 * curl.rate + curl.phase) * 0.04;
    const bounce = Math.sin(T * 11 * curl.rate + curl.phase) * 0.09 * p.hairEnergy;
    curl.pivot.rotation.set(slow + bounce, 0, Math.cos(T * 1.3 * curl.rate + curl.phase) * 0.03 + bounce * 0.5);
  }
}

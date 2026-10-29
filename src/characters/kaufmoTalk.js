import * as THREE from 'three';
import { loadKaufmo } from './kaufmo.js';
import { bendBone, SIDEWAYS, UP, FORWARD } from './bendBone.js';

// Kaufmo ships with a full rig but no baked animation clips (same
// situation as Caine and Jax — see their own files' comments), so he's
// hand-posed. His body bends by angle with bendBone, the same technique
// as his run cycle in kaufmoRunExtra.js; his arms reach for points in
// his own frame (+X his left, Y up, +Z the way he faces; metres, his
// feet at the origin) with a two-bone solve (reachFor). His rest arms
// hang out to the sides, so bending them joint by joint couldn't put a
// hand on his chin or flat on the floor; a point can. A pose is a set
// of body angles plus a point and an elbow direction for each hand
// (POSE_KEYS); the held pose eases toward whatever mood or activity is
// asked for, and the motion (writing, gesturing, tapping) goes on top
// each frame. Checked by eye on tools/kaufmo-animation-preview.html.

const TURN_SHARPNESS = 5; // how fast he turns to face whoever he's talking to — matches ribbit.js's own faceTowards
const POSE_SHARPNESS = 6; // how fast he eases into a new pose — matches caine.js's own POSE_EASE rate
const SPEAK_EASE_SECONDS = 0.2; // speaking starts/stops smoothly, not a hard cut
const TALK_EASE_SECONDS = 0.35;
const LISTEN_EASE_SECONDS = 0.4;

const SWAY_HZ = 0.35; // always-on idle breathing/weight-shift, under whatever pose is held
const deg = THREE.MathUtils.degToRad;
const v = (x, y, z) => new THREE.Vector3(x, y, z);
const SIDES = [['L', 1], ['R', -1]]; // +1 on his left (+X), -1 on his right

// Body angles in radians (drop in metres): spine/chest/head > 0 bow
// forward, lean > 0 to his right, twist/turn > 0 to his left, tilt > 0
// tips his head to his right; thigh < 0 lifts the knee, knee > 0 folds
// the shin back, foot points the toes, stride swings one leg forward
// and the other back (a step). Hands: where each wrist goes, as
// [x, y, z] on his RIGHT side — the left mirrors it unless given its own
// (handL) — which way the elbow points (elbowR/elbowL), and which way the
// fingers point (pointR/pointL; left out, the hand carries on the line of
// the forearm) and which way the thumb points (thumbR/thumbL, rolling the
// hand round the fingers). His gloves are big, 0.27 m to the knuckles:
// wherever both hands are in front of him they're given a pointing
// direction and, where they're close, thumbs turned out, so neither glove
// cuts into the other (tools/verify_kaufmo_talk_bones.mjs measures it).
const BODY = ['drop', 'spine', 'chest', 'lean', 'twist', 'head', 'turn', 'tilt', 'thigh', 'knee', 'foot', 'stride', 'aimL', 'aimR', 'rollL', 'rollR'];
const VECTORS = ['handL', 'handR', 'elbowL', 'elbowR', 'pointL', 'pointR', 'thumbL', 'thumbR'];
const AIMS = ['aimL', 'aimR', 'rollL', 'rollR'];

// Measured off his rest pose: shoulders at 1.21 m, the upper arm and
// forearm 0.23 + 0.26 m, so a wrist reaches at most 0.48 m from its
// shoulder; the gloved hand runs another 0.27 m to the knuckles. The jaw
// is at 1.41 m, 0.1 m in front.
const HANG = [-0.5, 0.9, 0.02];
const ELBOW_OUT = [-1, -0.3, -0.5];

// Moods for an ordinary conversation: how far he leans/hunches and
// where his hands rest. Spine/head positive = hunched/bowed (worried,
// sad), negative = upright/leaned back (happy, shocked).
const MOODS = {
  neutral: { handR: [-0.46, 0.88, 0.1] },
  happy: { spine: -deg(4), head: -deg(6), handR: [-0.42, 0.95, 0.18] },
  worried: { spine: deg(7), head: deg(9), handR: [-0.22, 0.86, 0.2], elbowR: [-1, -0.6, 0], pointR: [0.15, -0.5, 0.85] },
  shocked: { spine: -deg(6), head: -deg(8), handR: [-0.38, 1.0, 0.2] },
  sad: { spine: deg(9), head: deg(13), handR: [-0.44, 0.84, 0.04] },
  // Hands on his hips.
  annoyed: { spine: deg(4), head: deg(3), handR: [-0.34, 0.74, 0.06], elbowR: [-1, 0.1, -0.2] },
};

// Left to the arm solve, a hand rolls round with however the forearm
// came to point, and in a conversation that left his gloves twisted.
// Unless a pose says otherwise, the thumbs go forward and up: palms in,
// the way a relaxed hand hangs or gestures.
const THUMB_RELAXED = [0, 0.5, 1];
const relaxed = (spec) => ({ thumbR: THUMB_RELAXED, ...spec });
for (const mood of Object.keys(MOODS)) MOODS[mood] = relaxed(MOODS[mood]);

// What he does with his hands while he talks, by mood: `hold` is where
// they settle (replacing the mood's), `beat(t)` the motion, as offsets to
// each wrist and to his head. A neutral point made with one hand; happy,
// arms open; worried, hands fidgeting in front of him; shocked, hands up and open;
// sad, barely moving; annoyed, palms up as if it's obvious.
const TALK = {
  neutral: {
    hold: { handR: [-0.26, 1.1, 0.34], handL: [0.46, 0.88, 0.1] },
    beat: (t) => ({ handR: [0.03 * Math.sin(t * 3.1), 0.05 * Math.max(0, Math.sin(t * 6.3)), 0.02 * Math.sin(t * 2.3)], tilt: deg(4) * Math.sin(t * 2.4) }),
  },
  happy: {
    hold: { handR: [-0.52, 1.1, 0.26] },
    beat: (t) => {
      const bounce = Math.sin(t * 7);
      return { handR: [-0.04 * bounce, 0.02 * bounce, 0], handL: [0.04 * bounce, 0.02 * bounce, 0], head: -deg(3) * Math.abs(bounce), tilt: deg(5) * Math.sin(t * 2.2) };
    },
  },
  worried: {
    hold: { handR: [-0.33, 0.92, 0.22], elbowR: [-1, -0.6, 0] },
    beat: (t) => ({ handR: [0, 0.03 * Math.sin(t * 5), 0], handL: [0, -0.03 * Math.sin(t * 5), 0], turn: deg(5) * Math.sin(t * 1.7) }),
  },
  shocked: {
    hold: { handR: [-0.3, 1.1, 0.26], elbowR: [-1, -0.8, 0] },
    beat: (t) => ({ handR: [0.015 * Math.sin(t * 17), 0, 0], handL: [0.015 * Math.sin(t * 19), 0, 0], head: -deg(3) * Math.sin(t * 9) }),
  },
  sad: {
    hold: { handR: [-0.4, 0.86, 0.12] },
    beat: (t) => ({ handR: [0, 0.03 * Math.max(0, Math.sin(t * 2.5)), 0.02], tilt: deg(3) * Math.sin(t * 1.3) }),
  },
  annoyed: {
    hold: { handR: [-0.34, 0.95, 0.3] },
    beat: (t) => {
      const shrug = 0.05 * Math.max(0, Math.sin(t * 3.4));
      return { handR: [0, shrug, 0], handL: [0, shrug, 0], tilt: deg(7) * Math.sin(t * 1.7) };
    },
  },
};
for (const talk of Object.values(TALK)) talk.hold = relaxed(talk.hold);

// Kneeling over the photos on the floor: knees down, shins flat behind
// him, bowed well forward so his hands reach the floor in front.
const KNEEL = { drop: 0.25, thigh: deg(4), knee: deg(88), foot: deg(40), spine: deg(32), chest: deg(8), head: deg(6) };
const FLOOR_ELBOW = [-1, 0.2, -0.3];
const FLOOR_POINT = [0, -0.5, 1]; // fingers ahead and down, side by side
const PALM_UP = [-1, 0.4, 0];     // thumbs out to the sides: palms up, holding something

// Activities: a held pose of their own, in place of the mood's, and the
// motion for it (`move(t, state)`), for his room and the hand-in scene.
// While he talks in one, his hands stay put; only his head moves with it.
const ACTIVITIES = {
  // At the wall (WRITE_REACH in front of him), marker in his right hand,
  // writing line after line (see writingStroke). The wall, and what the
  // marker leaves on it, are the room's.
  write: {
    hold: { spine: deg(6), head: -deg(8), handR: [-0.12, 1.42, 0.34], elbowR: [-1, -0.6, -0.2], handL: [0.44, 0.86, 0.04] },
    move: (t, state) => {
      const stroke = writingStroke(t);
      state.penDown = stroke.down;
      return { handR: [stroke.x, stroke.y, stroke.down ? 0 : -0.04], turn: -stroke.x * 0.6, tilt: deg(3) * Math.sin(t * 0.7) };
    },
  },
  // A step back from the wall: left arm folded across him, right hand
  // at his chin, head tilting as he scans along what he's written, now
  // and then pointing at something on it.
  theorize: {
    hold: {
      head: -deg(5),
      handR: [-0.05, 1.16, 0.27], elbowR: [-1, -0.8, 0.1],
      handL: [-0.1, 0.92, 0.25], elbowL: [1, -0.4, -0.2],
    },
    move: (t) => {
      // Every 9 s or so he points at the wall for a moment.
      const point = THREE.MathUtils.smoothstep(Math.sin(t * 0.7 - 1.2), 0.7, 0.95);
      return {
        turn: deg(14) * Math.sin(t * 0.45) * (1 - point),
        tilt: deg(9) * Math.sin(t * 0.3 + 1),
        head: -deg(5) * Math.sin(t * 0.37) - deg(6) * point,
        handR: [-0.14 * point, (0.3 + 0.02 * Math.sin(t * 9)) * point, 0.2 * point],
      };
    },
  },
  // Both hands out, about to take the photos from Pomni.
  receive: {
    hold: { spine: deg(8), head: deg(16), handR: [-0.17, 1.0, 0.4], elbowR: [-1, -0.5, -0.3], pointR: [0.05, -0.15, 1], thumbR: PALM_UP },
  },
  // Holding the stack out in front of him, looking it over.
  study: {
    hold: { spine: deg(6), head: deg(28), handR: [-0.17, 1.02, 0.34], elbowR: [-1, -0.7, -0.2], pointR: [0.05, 0.2, 1], thumbR: PALM_UP },
    move: (t) => ({ tilt: deg(4) * Math.sin(t * 1.3), turn: deg(4) * Math.sin(t * 0.9) }),
  },
  // Kneeling, sweeping the photos out across the floor from the middle.
  spread: {
    hold: { ...KNEEL, handR: [-0.2, 0.26, 0.46], elbowR: FLOOR_ELBOW, pointR: FLOOR_POINT },
    move: (t) => {
      const sweep = Math.sin(Math.min(t, 1.6) / 1.6 * Math.PI);
      return { handR: [-0.22 * sweep, 0, 0.05 * sweep], handL: [0.22 * sweep, 0, 0.05 * sweep], turn: deg(6) * Math.sin(t * 1.4) };
    },
  },
  // Kneeling over them, hands resting on the floor, as he talks.
  kneel: {
    hold: { ...KNEEL, handR: [-0.2, 0.28, 0.44], elbowR: FLOOR_ELBOW, pointR: FLOOR_POINT },
    move: (t) => ({ turn: deg(5) * Math.sin(t * 0.8) }),
  },
  // Still kneeling, tapping one photo with his right hand.
  tap: {
    hold: { ...KNEEL, head: deg(12), handR: [-0.06, 0.26, 0.52], elbowR: FLOOR_ELBOW, pointR: [0, -0.7, 1], handL: [0.3, 0.32, 0.36] },
    move: (t) => ({ handR: [0, 0.05 * Math.max(0, Math.sin(t * 9)), 0] }),
  },
  // A few steps, between spots along his wall: legs swinging, a bob,
  // arms swinging against them.
  walk: {
    hold: { spine: deg(4) },
    move: (t) => {
      const phase = Math.sin(t * WALK_HZ * Math.PI * 2);
      return {
        stride: deg(20) * phase, drop: 0.02 * Math.abs(Math.cos(t * WALK_HZ * Math.PI * 2)),
        handR: [0, 0, -0.1 * phase], handL: [0, 0, 0.1 * phase],
      };
    },
  },
  // Holding the stack flat against his chest, one hand above the other
  // so the gloves lie across it without meeting.
  clutch: {
    hold: {
      head: deg(10),
      handR: [-0.17, 1.06, 0.21], elbowR: [-1, -0.9, 0], pointR: [1, 0.3, 0.15], thumbR: [0, 1, 0],
      handL: [0.17, 0.8, 0.22], elbowL: [1, -0.9, 0], pointL: [-1, 0.1, 0.15], thumbL: [0, -1, 0],
    },
    move: (t) => ({ spine: deg(2) * Math.sin(t * 1.2) }),
  },
};

/** What setActivity and setPose accept (for the preview and the checks). */
export const KAUFMO_ACTIVITIES = Object.keys(ACTIVITIES);
export const KAUFMO_MOODS = Object.keys(MOODS);

// Writing: each line runs left to right across his reach in WRITE_LINE
// seconds, the hand looping small letters as it goes, then the pen lifts
// and comes back for the next line, a little lower. Offsets, in metres,
// to the write pose's wrist.
const WRITE_LINE = 3.2;
const WRITE_RETURN = 0.7;
const WRITE_LINES = 4;
const WRITE_WIDTH = 0.36;
const WRITE_LINE_DROP = 0.07;
/** One full block of writing, every line of it, in seconds. */
export const WRITE_SECONDS = (WRITE_LINE + WRITE_RETURN) * WRITE_LINES;
const WALK_HZ = 1.6;
const MARKER_LENGTH = 0.17; // metres, gripped at his knuckles
function writingStroke(t) {
  const cycle = WRITE_LINE + WRITE_RETURN;
  const line = Math.floor(t / cycle) % WRITE_LINES;
  const local = t % cycle;
  const lineY = 0.08 - line * WRITE_LINE_DROP;
  if (local < WRITE_LINE) {
    const along = local / WRITE_LINE;
    // Letters: a fast loop, with a gap between words now and then.
    return {
      down: Math.sin(along * 23) > -0.85,
      x: WRITE_WIDTH * (along - 0.5) + 0.012 * Math.sin(local * 21),
      y: lineY + 0.018 * Math.sin(local * 17 + Math.sin(local * 5)),
    };
  }
  const back = THREE.MathUtils.smootherstep(local - WRITE_LINE, 0, WRITE_RETURN);
  return { down: false, x: WRITE_WIDTH * (0.5 - back), y: lineY - WRITE_LINE_DROP * back + 0.03 * Math.sin(back * Math.PI) };
}

/** A pose's full set of numbers, with the left hand mirrored from the right where it isn't given. */
function resolvePose(spec) {
  const out = {};
  for (const name of BODY) out[name] = spec[name] ?? 0;
  const hand = spec.handR ?? HANG;
  const elbow = spec.elbowR ?? ELBOW_OUT;
  out.handR = v(...hand);
  out.elbowR = v(...elbow);
  out.handL = spec.handL ? v(...spec.handL) : v(-hand[0], hand[1], hand[2]);
  out.elbowL = spec.elbowL ? v(...spec.elbowL) : v(-elbow[0], elbow[1], elbow[2]);
  const point = spec.pointR ?? [0, 0, 1];
  out.pointR = v(...point).normalize();
  out.pointL = (spec.pointL ? v(...spec.pointL) : v(-point[0], point[1], point[2])).normalize();
  out.aimR = spec.pointR ? 1 : 0;
  out.aimL = spec.pointL || spec.pointR ? 1 : 0;
  const thumb = spec.thumbR ?? [-1, 0, 0];
  out.thumbR = v(...thumb).normalize();
  out.thumbL = (spec.thumbL ? v(...spec.thumbL) : v(-thumb[0], thumb[1], thumb[2])).normalize();
  out.rollR = spec.thumbR ? 1 : 0;
  out.rollL = spec.thumbL || spec.thumbR ? 1 : 0;
  return out;
}
const RESOLVED = new Map();
function resolved(spec) {
  if (!RESOLVED.has(spec)) RESOLVED.set(spec, resolvePose(spec));
  return RESOLVED.get(spec);
}

/**
 * The same loose, punctuation-insensitive bone match as kaufmoRunExtra.js,
 * but keeping digits, so 'spine4' and 'rfinger1' can be told apart from
 * the bones before them. The first match in the tree wins ('spine' is the
 * lowest spine bone).
 */
function findBone(root, needle) {
  let found = null;
  root.traverse((child) => {
    if (found || !child.isBone) return;
    const clean = child.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (clean.includes(needle)) found = child;
  });
  return found;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _parent = new THREE.Quaternion();

/** Turns `bone` so the joint after it (`child`) points at a world point. */
function aimBone(bone, child, worldPoint) {
  bone.updateWorldMatrix(true, true);
  const from = bone.getWorldPosition(_a);
  const currentDir = child.getWorldPosition(_b).sub(from).normalize();
  const wantDir = _c.copy(worldPoint).sub(from).normalize();
  _q.setFromUnitVectors(currentDir, wantDir);
  // The world-space turn, taken into the bone's parent space.
  bone.parent.getWorldQuaternion(_parent);
  const local = _parent.clone().invert().multiply(_q).multiply(_parent);
  bone.quaternion.premultiply(local);
}

/**
 * Loads Kaufmo set up to act: he turns to face whoever he's talking to,
 * holds a mood's pose (setPose), talks with his hands in that mood
 * (setSpeaking), nods along while someone else talks (setListening), and
 * can be given something to do instead (setActivity — see ACTIVITIES).
 *
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh,
 *   update: (deltaSeconds: number) => void,
 *   faceTowards: (worldPoint: THREE.Vector3 | null) => void,
 *   setPose: (mood: string) => void,
 *   setSpeaking: (speaking: boolean) => void,
 *   setListening: (listening: boolean) => void,
 *   setActivity: (name: string | null) => void,
 *   activity: string | null, penDown: boolean,
 *   hands: { left: THREE.Bone, right: THREE.Bone },
 *   markerTip: (target?: THREE.Vector3) => THREE.Vector3 }>}
 */
export function loadKaufmoTalk() {
  return loadKaufmo().then(({ kaufmo, collider }) => {
    const model = kaufmo.children.find((child) => child !== collider);
    const modelY = model.position.y;
    const bones = {
      spine: findBone(kaufmo, 'spine'),
      chest: findBone(kaufmo, 'spine4'),
      neck: findBone(kaufmo, 'neck'),
      head: findBone(kaufmo, 'head'),
      thighL: findBone(kaufmo, 'lthigh'), thighR: findBone(kaufmo, 'rthigh'),
      calfL: findBone(kaufmo, 'lcalf'), calfR: findBone(kaufmo, 'rcalf'),
      footL: findBone(kaufmo, 'lfoot'), footR: findBone(kaufmo, 'rfoot'),
      upperArmL: findBone(kaufmo, 'lupperarm'), upperArmR: findBone(kaufmo, 'rupperarm'),
      foreArmL: findBone(kaufmo, 'lforearm'), foreArmR: findBone(kaufmo, 'rforearm'),
      handL: findBone(kaufmo, 'lhand'), handR: findBone(kaufmo, 'rhand'),
      knuckleR: findBone(kaufmo, 'rfinger1'),
      fingersL: findBone(kaufmo, 'lfinger2'), fingersR: findBone(kaufmo, 'rfinger2'),
      thumbL: findBone(kaufmo, 'lfinger0'), thumbR: findBone(kaufmo, 'rfinger0'),
    };
    const rest = new Map();
    for (const bone of Object.values(bones)) {
      if (bone) rest.set(bone, bone.quaternion.clone());
    }
    const canReach = ['upperArm', 'foreArm', 'hand'].every((part) => bones[`${part}L`] && bones[`${part}R`]);

    // A marker for writing on the wall, in his right hand while he writes.
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, MARKER_LENGTH, 10).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x1d1d24, roughness: 0.5 }),
    );
    marker.name = 'KaufmoMarker';
    marker.visible = false;
    kaufmo.add(marker);

    let time = 0;
    let activityTime = 0;
    let speakAmount = 0; // eased 0-1, not a hard on/off
    let listenAmount = 0;
    let speaking = false;
    let listening = false;
    let targetYaw = null;
    const ownPosition = new THREE.Vector3();

    let mood = 'neutral';
    let activity = null;
    const state = { penDown: false };
    const current = resolvePose(MOODS.neutral);
    const talkHold = resolvePose({}); // eased toward the mood's talking hands while he speaks
    let talkAmount = 0;

    function update(deltaSeconds) {
      time += deltaSeconds;
      activityTime += deltaSeconds;
      speakAmount += ((speaking ? 1 : 0) - speakAmount) * Math.min(1, deltaSeconds / SPEAK_EASE_SECONDS);
      listenAmount += ((listening && !speaking ? 1 : 0) - listenAmount) * Math.min(1, deltaSeconds / LISTEN_EASE_SECONDS);

      // Where he's headed: the activity's pose, or the mood's.
      const doing = activity && ACTIVITIES[activity];
      const talk = TALK[mood] ?? TALK.neutral;
      const target = resolved(doing ? doing.hold : MOODS[mood]);
      const ease = 1 - Math.exp(-POSE_SHARPNESS * deltaSeconds);
      for (const name of BODY) current[name] += (target[name] - current[name]) * ease;
      for (const key of VECTORS) current[key].lerp(target[key], ease);

      // His talking hands, eased in over the mood's while he speaks.
      const talkTarget = resolved(talk.hold);
      const talkEase = Math.min(1, deltaSeconds / TALK_EASE_SECONDS);
      for (const key of VECTORS) talkHold[key].lerp(talkTarget[key], talkEase);
      for (const key of AIMS) talkHold[key] += (talkTarget[key] - talkHold[key]) * talkEase;
      talkAmount += ((doing ? 0 : speakAmount) - talkAmount) * talkEase;

      const pose = { ...current };
      for (const key of VECTORS) pose[key] = current[key].clone().lerp(talkHold[key], talkAmount);
      for (const key of AIMS) pose[key] = THREE.MathUtils.lerp(current[key], talkHold[key], talkAmount);
      state.penDown = false;
      if (doing?.move) addInto(pose, doing.move(activityTime, state));
      if (speakAmount > 0.001) {
        const beat = talk.beat(time);
        // Busy hands stay busy: talking in an activity only moves his head.
        for (const name of Object.keys(beat)) {
          if (doing && !['head', 'turn', 'tilt'].includes(name)) continue;
          addInto(pose, { [name]: beat[name] }, speakAmount);
        }
      }
      // Listening: a small nod every so often.
      if (listenAmount > 0.001) pose.head += deg(6) * Math.max(0, Math.sin(time * 2.6)) ** 3 * listenAmount;
      pose.spine += Math.sin(time * SWAY_HZ * Math.PI * 2) * deg(1.2);

      applyPose(pose);
      placeMarker();

      if (targetYaw !== null) {
        const diff = THREE.MathUtils.euclideanModulo(targetYaw - kaufmo.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        kaufmo.rotation.y += diff * (1 - Math.exp(-TURN_SHARPNESS * deltaSeconds));
      }
    }

    function applyPose(p) {
      for (const [bone, restQuat] of rest) bone.quaternion.copy(restQuat);
      model.position.y = modelY - p.drop;
      // Legs and body by angle, from the hips up: bendBone reads each
      // parent's pose, so each bend is in his frame however he's leaning.
      for (const [side, sign] of SIDES) {
        // The leg swinging forward bends at the knee as it comes through.
        const stride = sign * p.stride;
        bendBone(bones[`thigh${side}`], kaufmo, SIDEWAYS, p.thigh - stride);
        bendBone(bones[`calf${side}`], kaufmo, SIDEWAYS, p.knee + Math.max(0, stride) * 1.4);
        bendBone(bones[`foot${side}`], kaufmo, SIDEWAYS, p.foot);
      }
      bendBone(bones.spine, kaufmo, SIDEWAYS, p.spine);
      bendBone(bones.spine, kaufmo, FORWARD, p.lean);
      bendBone(bones.spine, kaufmo, UP, p.twist);
      bendBone(bones.chest, kaufmo, SIDEWAYS, p.chest);
      bendBone(bones.neck, kaufmo, UP, p.turn);
      bendBone(bones.head, kaufmo, SIDEWAYS, p.head);
      bendBone(bones.head, kaufmo, FORWARD, p.tilt);
      if (!canReach) return;
      for (const [side] of SIDES) {
        reachFor(side, p[`hand${side}`], p[`elbow${side}`]);
        pointHand(side, p[`point${side}`], p[`aim${side}`], p[`thumb${side}`], p[`roll${side}`]);
      }
    }

    // Two-bone reach: the elbow goes where the upper arm and forearm (their
    // rest lengths) meet, bowed toward `elbowDir`; then each bone is aimed.
    const lengths = {};
    const shoulder = new THREE.Vector3();
    const wrist = new THREE.Vector3();
    const toWrist = new THREE.Vector3();
    const bow = new THREE.Vector3();
    const elbowAt = new THREE.Vector3();
    function reachFor(side, handLocal, elbowLocal) {
      const upper = bones[`upperArm${side}`];
      const fore = bones[`foreArm${side}`];
      const hand = bones[`hand${side}`];
      kaufmo.updateWorldMatrix(true, true);
      if (!lengths[side]) {
        lengths[side] = {
          upper: upper.getWorldPosition(_a).distanceTo(fore.getWorldPosition(_b)),
          fore: fore.getWorldPosition(_a).distanceTo(hand.getWorldPosition(_b)),
        };
      }
      const { upper: a, fore: b } = lengths[side];
      upper.getWorldPosition(shoulder);
      kaufmo.localToWorld(wrist.copy(handLocal));
      toWrist.copy(wrist).sub(shoulder);
      const d = THREE.MathUtils.clamp(toWrist.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3);
      toWrist.normalize();
      // The elbow direction, in world space and square to shoulder→wrist.
      bow.copy(elbowLocal).transformDirection(kaufmo.matrixWorld);
      bow.addScaledVector(toWrist, -bow.dot(toWrist)).normalize();
      const along = (a * a - b * b + d * d) / (2 * d);
      const out = Math.sqrt(Math.max(0, a * a - along * along));
      elbowAt.copy(shoulder).addScaledVector(toWrist, along).addScaledVector(bow, out);
      aimBone(upper, fore, elbowAt);
      aimBone(fore, hand, wrist.copy(shoulder).addScaledVector(toWrist, d));
    }

    // Turns a hand so its fingers point along `pointLocal` (his frame),
    // `amount` of the way from wherever the forearm left them; then rolls
    // it round them so the thumb points toward `thumbLocal`, `roll` of the way.
    const handAt = new THREE.Vector3();
    const fingerDir = new THREE.Vector3();
    const wantDir = new THREE.Vector3();
    const thumbDir = new THREE.Vector3();
    function pointHand(side, pointLocal, amount, thumbLocal, roll) {
      const hand = bones[`hand${side}`];
      const fingers = bones[`fingers${side}`];
      if (!fingers || (amount < 0.01 && roll < 0.01)) return;
      kaufmo.updateWorldMatrix(true, true);
      hand.getWorldPosition(handAt);
      fingerDir.copy(fingers.getWorldPosition(_b)).sub(handAt).normalize();
      if (amount >= 0.01) {
        wantDir.copy(pointLocal).transformDirection(kaufmo.matrixWorld);
        fingerDir.lerp(wantDir, Math.min(1, amount)).normalize();
        aimBone(hand, fingers, _c.copy(handAt).add(fingerDir));
      }
      const thumb = bones[`thumb${side}`];
      if (!thumb || roll < 0.01) return;
      hand.updateWorldMatrix(true, true);
      // Both the thumb and where it should go, square to the fingers.
      thumbDir.copy(thumb.getWorldPosition(_b)).sub(handAt).projectOnVector(fingerDir).negate()
        .add(_b.sub(handAt)).normalize();
      wantDir.copy(thumbLocal).transformDirection(kaufmo.matrixWorld).projectOnPlane(fingerDir).normalize();
      if (wantDir.lengthSq() < 0.5) return;
      let angle = thumbDir.angleTo(wantDir);
      if (_c.crossVectors(thumbDir, wantDir).dot(fingerDir) < 0) angle = -angle;
      _q.setFromAxisAngle(fingerDir, angle * Math.min(1, roll));
      hand.parent.getWorldQuaternion(_parent);
      hand.quaternion.premultiply(_parent.clone().invert().multiply(_q).multiply(_parent));
    }

    const knuckle = new THREE.Vector3();
    const wristAt = new THREE.Vector3();
    function placeMarker() {
      marker.visible = activity === 'write' && Boolean(bones.knuckleR);
      if (!marker.visible) return;
      kaufmo.updateWorldMatrix(true, true);
      // Gripped at his knuckles, carrying on the line of his hand.
      bones.handR.getWorldPosition(wristAt);
      bones.knuckleR.getWorldPosition(knuckle);
      kaufmo.worldToLocal(wristAt);
      kaufmo.worldToLocal(knuckle);
      marker.position.copy(knuckle);
      marker.lookAt(_a.copy(knuckle).multiplyScalar(2).sub(wristAt));
    }

    /** Turns him (smoothly, in update) toward a world point; null stops turning. */
    function faceTowards(worldPoint) {
      if (!worldPoint) { targetYaw = null; return; }
      kaufmo.getWorldPosition(ownPosition);
      targetYaw = Math.atan2(worldPoint.x - ownPosition.x, worldPoint.z - ownPosition.z);
    }

    /** Eases toward one of MOODS; unrecognized moods fall back to neutral. */
    function setPose(value) {
      mood = MOODS[value] ? value : 'neutral';
    }

    function setSpeaking(value) {
      speaking = Boolean(value);
    }

    function setListening(value) {
      listening = Boolean(value);
    }

    /** One of ACTIVITIES, or null for an ordinary conversation. Restarts its motion. */
    function setActivity(name) {
      const next = ACTIVITIES[name] ? name : null;
      if (next !== activity) activityTime = 0;
      activity = next;
    }

    /** The marker's tip, in world space (where it touches the wall). */
    function markerTip(out = new THREE.Vector3()) {
      marker.updateMatrixWorld(true);
      return out.set(0, 0, MARKER_LENGTH / 2).applyMatrix4(marker.matrixWorld);
    }

    return {
      kaufmo, collider, update, faceTowards, setPose, setSpeaking, setListening, setActivity, markerTip,
      hands: { left: bones.handL, right: bones.handR },
      get activity() { return activity; },
      get penDown() { return state.penDown; },
    };
  });
}


/** Adds `extra` (angles, or [x, y, z] offsets to a hand) into a pose, scaled by `amount`. */
function addInto(pose, extra, amount = 1) {
  for (const [name, value] of Object.entries(extra)) {
    if (Array.isArray(value)) pose[name] = pose[name].clone().add(_a.set(...value).multiplyScalar(amount));
    else pose[name] += value * amount;
  }
}

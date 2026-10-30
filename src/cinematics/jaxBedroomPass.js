import * as THREE from 'three';
import { bendBone, SIDEWAYS, UP, FORWARD } from '../characters/bendBone.js';

export const JAX_PASS_BEAT = 'jaxPassByText';
export const JAX_PASS_RESUME = 'afterJaxPassBy';

// The beat, seen through Pomni's open door: Jax storms up the hall to his
// own door straight across from hers, turns to it reaching for the handle,
// shoves it open and walks in, then grabs its edge and slams it behind him.
const WALK_START = .25, APPROACH_SECONDS = 1.7;
const ARRIVE = WALK_START + APPROACH_SECONDS;
// Turning to the door as his hand goes to the handle, with a last step in:
// he comes up the hall clear of the wall (his shoulders are wide).
const REACH_SECONDS = .45;
const OPEN_START = ARRIVE + REACH_SECONDS, OPEN_FRACTION = .95;
// He pushes it open walking: his hand rides the handle (at about his pace)
// this long, then lets go and the door swings on, slowing to a stop.
const HOLD_SECONDS = .4, PUSH_RATE = .8; // of fully open, per second
const SWING_SECONDS = .9, LET_GO_SECONDS = .35;
const ENTER_START = OPEN_START + .15, ENTER_SECONDS = 1.3;
const INSIDE = ENTER_START + ENTER_SECONDS;
const GRAB_SECONDS = .25; // his other hand back to the door's edge
const SLAM_START = INSIDE + GRAB_SECONDS, SLAM_SECONDS = .24;
const SHUT = SLAM_START + SLAM_SECONDS;
const BOUNCE_SECONDS = .18, BOUNCE = .03; // the leaf jumps off the stop once
export const JAX_PASS_SECONDS = SHUT + .55;
const STEP_SECONDS = 1 / 2.8;

const smooth = (t, a, b) => THREE.MathUtils.smootherstep(t, a, b);

/**
 * Room-owned background action: Jax and his door in the Dorm Hall view
 * through Pomni's doorway. Never moves Pomni's door or the Ragatha cast.
 */
export function createJaxBedroomPass({ room, cast, audio, onComplete }) {
  const preview = room.userData.dormHallPreview;
  const frame = room.getObjectByName('Door_Frame024');
  if (!preview?.group.visible || !frame || !cast) throw new Error('Visible Dorm Hall and Jax are required');
  room.updateMatrixWorld(true);
  const doorway = new THREE.Box3().setFromObject(frame).getCenter(new THREE.Vector3());
  // The preview's native +Z is the real hallway's lengthwise axis; native X=0
  // is its centre line. Derive the crossing station from the actual door.
  const nativeDoor = preview.group.worldToLocal(doorway.clone());
  const crossing = preview.group.localToWorld(new THREE.Vector3(0, 0, nativeDoor.z));
  const floor = preview.meshes.find(m => m.name === 'Cube002');
  if (!floor) throw new Error('Hallway floor is unavailable');
  const floorY = new THREE.Box3().setFromObject(floor).min.y;
  crossing.y = floorY;
  const along = new THREE.Vector3(0, 0, 1).transformDirection(preview.group.matrixWorld);

  const door = hangJaxDoor(preview, crossing);
  const { inward, handleSide } = door;
  // Marks: on the handle side, in front of his door; through it, inside.
  const doorFoot = door.centre.clone().setY(floorY);
  // His arms are short (half a metre, shoulder to wrist): right up to it.
  const atDoor = doorFoot.clone().addScaledVector(inward, -.45).addScaledVector(handleSide, .2);
  const nearDoor = atDoor.clone().addScaledVector(inward, -.28).addScaledVector(handleSide, .12);
  const from = nearDoor.clone().addScaledVector(handleSide, 2.7).addScaledVector(inward, -.1);
  const approachYaw = Math.atan2(nearDoor.x - from.x, nearDoor.z - from.z);
  const inside = doorFoot.clone().addScaledVector(inward, 1.4);
  door.addRoomBehind(floorY);

  const actor = cast.jax;
  const model = actor.children.find(child => !child.isLight);
  actor.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(model);
  const scale = 2.1 / sourceBounds.getSize(new THREE.Vector3()).y;
  actor.scale.setScalar(scale); // 2.1 m including ears; Pomni remains 1.6 m.
  model.position.y -= sourceBounds.min.y;
  actor.children.filter(child => child.isLight).forEach(light => { light.visible = false; });
  // Lower his T-pose shoulders and rest both hands at the overalls' pocket
  // area. These offsets use measured joint directions, not imported axes.
  const arms = [];
  let spine, head;
  model.traverse(bone => {
    if (!bone.isBone) return;
    const name = bone.name.toLowerCase().replace(/[^a-z]/g, '');
    if (!spine && name.startsWith('spine')) spine = bone;
    if (!head && name.startsWith('head')) head = bone;
  });
  for (const side of ['l', 'r']) {
    let upper, lower, hand;
    model.traverse(bone => {
      if (!bone.isBone) return;
      const name = bone.name.toLowerCase().replace(/[^a-z]/g, '');
      if (name.startsWith('upperarm' + side)) upper = bone;
      if (name.startsWith('lowerarm' + side)) lower = bone;
      if (name.startsWith('hand' + side)) hand = bone;
    });
    if (upper && lower) {
      // Measured from, and posed on top of, the rig's own T-pose: loadJax now
      // lowers his arms for every scene, and from there these offsets lowered
      // them a second time (and the elbow, hanging under the shoulder, no
      // longer told which side the arm is on).
      const bind = cast.bindPose?.get(upper);
      if (bind) upper.quaternion.copy(bind);
      actor.updateMatrixWorld(true);
      const a = actor.worldToLocal(upper.getWorldPosition(new THREE.Vector3()));
      const b = actor.worldToLocal(lower.getWorldPosition(new THREE.Vector3()));
      arms.push({ upper, lower, hand, upperRest: upper.quaternion.clone(), lowerRest: lower.quaternion.clone(),
        handRest: hand?.quaternion.clone(), sign: Math.sign(b.x - a.x),
        // +X is his left, so the arm out that way is his left arm.
        left: b.x > a.x });
    }
  }
  const leftArm = arms.find(arm => arm.left), rightArm = arms.find(arm => !arm.left);
  // He comes up on the handle's side, so the near hand opens it and the far
  // one, once he's through, grabs the leaf (on the hinge side) to slam it.
  const facingIn = Math.atan2(inward.x, inward.z);
  const handleOnLeft = new THREE.Vector3(Math.cos(facingIn), 0, -Math.sin(facingIn)).dot(handleSide) > 0;
  const openingArm = handleOnLeft ? leftArm : rightArm, slammingArm = handleOnLeft ? rightArm : leftArm;

  let elapsed = 0, phase = 'playing', paused = false, nextStep = 0, stepCount = 0;
  let reaching = false, walked = false, entered = false, turned = false, creaked = false, slammed = false;
  const bodyBounds = new THREE.Box3();
  const skeletons = new Set();
  actor.traverse(mesh => { if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
  function sound(method, ...args) {
    try { audio?.[method]?.(...args); }
    catch { try { audio?.dispose?.(); } catch {} audio = null; }
  }
  function restore() {
    actor.visible = false; sound('dispose');
    door.release();
    // Generic room cleanup owns meshes/materials; release this one-shot rig's
    // GPU bone textures here too, including when a room is left mid-pass.
    skeletons.forEach(skeleton => skeleton.dispose());
  }
  function finish() {
    if (phase !== 'playing') return;
    phase = 'done'; restore(); onComplete?.();
  }

  /** How open his door is at `t` (0 shut … OPEN_FRACTION). */
  function doorAt(t) {
    if (t < OPEN_START) return 0;
    const pushed = PUSH_RATE * HOLD_SECONDS;
    if (t < OPEN_START + HOLD_SECONDS) return PUSH_RATE * (t - OPEN_START);
    if (t < SLAM_START) {
      // On from where he let go, as fast as he pushed it, easing to a stop.
      const u = Math.min(1, (t - OPEN_START - HOLD_SECONDS) / SWING_SECONDS);
      return pushed * (2 * u ** 3 - 3 * u ** 2 + 1) + SWING_SECONDS * PUSH_RATE * (u ** 3 - 2 * u ** 2 + u)
        + OPEN_FRACTION * (3 * u ** 2 - 2 * u ** 3);
    }
    if (t < SHUT) return OPEN_FRACTION * (1 - ((t - SLAM_START) / SLAM_SECONDS) ** 2); // flung: faster and faster
    const bounce = (t - SHUT) / BOUNCE_SECONDS;
    return bounce < 1 ? BOUNCE * Math.sin(Math.PI * bounce) : 0;
  }

  const target = new THREE.Vector3();
  function pose(t) {
    // Hands in pockets, as he walks.
    for (const arm of arms) {
      arm.upper.quaternion.copy(arm.upperRest); arm.lower.quaternion.copy(arm.lowerRest);
      bendBone(arm.upper, actor, FORWARD, -arm.sign * 1.43);
      bendBone(arm.lower, actor, SIDEWAYS, -.38);
      // Relax the glove down at the pocket instead of projecting the
      // straight bind-pose fingers forward along the bent forearm.
      if (arm.hand) {
        arm.hand.quaternion.copy(arm.handRest);
        bendBone(arm.hand, actor, SIDEWAYS, .38);
        bendBone(arm.hand, actor, FORWARD, arm.sign * .14);
      }
    }
    // One hand on the handle (reaching for it, riding it as the door
    // swings, letting go); later the other on the leaf, flinging it shut.
    const opening = smooth(t, ARRIVE, OPEN_START) * (1 - smooth(t, OPEN_START + HOLD_SECONDS, OPEN_START + HOLD_SECONDS + LET_GO_SECONDS));
    const slamming = smooth(t, INSIDE, SLAM_START) * (1 - smooth(t, SLAM_START + SLAM_SECONDS * .55, SHUT + .2));
    reaching = opening > 0 || slamming > 0;
    let lean = 0, twist = 0;
    if (opening > 0 && openingArm) {
      reach(openingArm, door.handle(-1, target), opening);
      lean += .12 * opening; // into the push
      twist += turnTowards(target) * .5 * opening;
    }
    if (slamming > 0 && slammingArm) {
      reach(slammingArm, door.handle(1, target), slamming);
      twist += turnTowards(target) * .6 * slamming;
    }
    // Reset first: his walk never touches these, so bends would pile up.
    for (const bone of [spine, head]) if (bone && cast.bindPose?.has(bone)) bone.quaternion.copy(cast.bindPose.get(bone));
    bendBone(spine, actor, SIDEWAYS, lean);
    bendBone(spine, actor, UP, twist * .6);
    bendBone(head, actor, UP, twist * .5);
  }
  /** Yaw (+ to his left) from where he faces to a world point, clamped. */
  function turnTowards(point) {
    const local = actor.worldToLocal(point.clone());
    return THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1, 1);
  }
  /** Blends `arm` from its current pose to one with its hand at `point`. */
  function reach(arm, point, weight) {
    const before = [arm.upper.quaternion.clone(), arm.lower.quaternion.clone(), arm.hand?.quaternion.clone()];
    if (arm.hand) arm.hand.quaternion.copy(arm.handRest);
    solveArm(arm, point, actor);
    arm.upper.quaternion.slerpQuaternions(before[0], arm.upper.quaternion.clone(), weight);
    arm.lower.quaternion.slerpQuaternions(before[1], arm.lower.quaternion.clone(), weight);
    if (arm.hand) arm.hand.quaternion.slerpQuaternions(before[2], arm.hand.quaternion.clone(), weight);
    arm.upper.updateMatrixWorld(true);
  }

  function step(previous) {
    const t = elapsed;
    if (t >= WALK_START && !walked) {
      walked = true;
      cast.playPassBy(from, nearDoor, APPROACH_SECONDS, { style: 'sly', stay: true });
    }
    if (t >= ARRIVE && !turned) {
      turned = true;
      cast.playPassBy(nearDoor, atDoor, OPEN_START - ARRIVE, { style: 'sly', stay: true });
    }
    if (t >= ENTER_START && !entered) {
      entered = true;
      cast.playPassBy(actor.position.clone().setY(floorY), inside, ENTER_SECONDS, { style: 'sly', stay: true });
    }
    if (t >= OPEN_START && !creaked) { creaked = true; sound('cue', 'creak', door.centre); }
    door.setOpen(doorAt(t));
    if (t >= SHUT && !slammed) {
      slammed = true; actor.visible = false; // shut in behind it
      sound('cue', 'thud', door.centre);
    }
    if (walked && actor.visible) {
      const walking = cast.isRunning();
      cast.update(t - Math.max(previous, WALK_START));
      // Round to face his door as he steps up to it (a walk faces him the
      // way he's going, all at once).
      if (turned && !entered) {
        const turn = THREE.MathUtils.euclideanModulo(facingIn - approachYaw + Math.PI, Math.PI * 2) - Math.PI;
        actor.rotation.y = approachYaw + turn * smooth(t, ARRIVE, ARRIVE + .5);
      }
      pose(t);
      // The shared procedural knee/lean poses dip below its bind-pose feet.
      // Correct only this room-owned actor, using its evaluated skin bounds.
      actor.updateMatrixWorld(true);
      actor.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox(); });
      bodyBounds.setFromObject(actor);
      if (bodyBounds.min.y < floorY + .003) actor.position.y += floorY + .003 - bodyBounds.min.y;
      if (walking && t >= nextStep) {
        sound('cue', 'step', actor.position); stepCount++; nextStep = t + STEP_SECONDS;
      }
    }
  }

  return {
    get active() { return phase === 'playing'; }, get phase() { return phase; },
    get skippable() { return phase === 'playing'; },
    get diagnostics() { return { phase, elapsed, paused, visible: actor.visible,
      position: actor.position.toArray(), from: from.toArray(), atDoor: atDoor.toArray(), inside: inside.toArray(),
      doorOpen: door.open, reaching, floorY, scale, stepCount, style: 'sly' }; },
    setPaused(value) { if (phase !== 'playing') return; paused = value; sound(value ? 'pause' : 'resume', elapsed); },
    update(delta) {
      if (phase !== 'playing' || paused) return;
      // Substeps prevent a slow frame from skipping the visible action or cues.
      let remaining = Math.max(0, delta);
      while (remaining > 1e-8 && phase === 'playing') {
        const dt = Math.min(remaining, 1 / 60), previous = elapsed;
        elapsed = Math.min(JAX_PASS_SECONDS, elapsed + dt); remaining -= dt;
        step(previous);
        // Ragatha's conversation retains the camera throughout this background beat.
        if (elapsed >= JAX_PASS_SECONDS) finish();
      }
    },
    skip() { if (!paused) finish(); },
    dispose() { if (phase === 'disposed') return; phase = 'disposed'; restore(); },
  };
}

/**
 * Jax's own door in the hall view (straight across from Pomni's), hung on
 * a pivot at its hinge edge to swing into his room, with a dark room behind
 * it: the view stops at the hall's wall, so there'd be nothing through it.
 */
function hangJaxDoor(preview, hallCentre) {
  const slab = preview.group.getObjectByName('Door_Slab018');
  const doorFrame = preview.group.getObjectByName('Door_Frame018');
  const panel = slab?.getObjectByName('Plane_8');
  const handle = slab?.getObjectByName('Plane_9');
  if (!slab || !doorFrame || !panel || !handle) throw new Error('Jax’s door is unavailable');
  preview.group.updateMatrixWorld(true);
  const panelBox = new THREE.Box3().setFromObject(panel);
  const frameBox = new THREE.Box3().setFromObject(doorFrame);
  const centre = panelBox.getCenter(new THREE.Vector3());
  const handleCentre = new THREE.Box3().setFromObject(handle).getCenter(new THREE.Vector3());
  const size = panelBox.getSize(new THREE.Vector3());
  const wide = size.x >= size.z ? 'x' : 'z', thin = wide === 'x' ? 'z' : 'x';
  const inward = new THREE.Vector3(); inward[thin] = Math.sign(centre[thin] - hallCentre[thin]) || 1;
  const handleSide = new THREE.Vector3(); handleSide[wide] = Math.sign(handleCentre[wide] - centre[wide]) || 1;
  // The pin: the edge away from the handle, on the room-side face.
  const hinge = centre.clone();
  hinge[wide] = handleSide[wide] > 0 ? panelBox.min[wide] : panelBox.max[wide];
  hinge[thin] = inward[thin] > 0 ? Math.max(panelBox.max[thin], frameBox.max[thin]) + .002
    : Math.min(panelBox.min[thin], frameBox.min[thin]) - .002;
  const up = new THREE.Vector3(0, 1, 0);
  const freeEdge = centre.clone().addScaledVector(handleSide, size[wide] / 2);
  const swept = angle => freeEdge.clone().sub(hinge).applyAxisAngle(up, angle).add(hinge).sub(freeEdge).dot(inward);
  const openAngle = swept(Math.PI / 2) > swept(-Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2;

  const parent = slab.parent;
  const pivot = new THREE.Group(); pivot.name = 'Door_Frame018Hinge';
  parent.add(pivot); pivot.position.copy(parent.worldToLocal(hinge.clone()));
  pivot.updateMatrixWorld(true); pivot.attach(slab); // its exact closed transform
  // His face sign is its own node, not the slab's: it swings with the door.
  const sign = preview.group.getObjectByName('Jax');
  if (sign && frameBox.containsPoint(new THREE.Box3().setFromObject(sign).getCenter(new THREE.Vector3()))) pivot.attach(sign);
  const localUp = up.clone().transformDirection(parent.matrixWorld.clone().invert()).normalize();
  // The handle's knobs, hall side (-1) and room side (+1), in the slab's frame.
  const halfThickness = (new THREE.Box3().setFromObject(handle).getSize(new THREE.Vector3())[thin]) / 2 * .7;
  const knobs = [-1, 1].map(s => slab.worldToLocal(handleCentre.clone().addScaledVector(inward, s * halfThickness)));

  let open = 0, roomMeshes = [];
  return {
    centre, inward, handleSide,
    get open() { return open; },
    setOpen(fraction) {
      open = fraction;
      pivot.setRotationFromAxisAngle(localUp, openAngle * fraction);
      pivot.updateMatrixWorld(true);
    },
    /** A knob's world position, as the door is now: hall side -1, room side 1. */
    handle(side, out) { return slab.localToWorld(out.copy(knobs[side < 0 ? 0 : 1])); },
    /** Floor, ceiling and walls (thin, axis-aligned boxes, like the door) of an unlit room. */
    addRoomBehind(floorY) {
      const width = size[wide] + 1.2, depth = 2.6, height = frameBox.max.y - floorY + .5, skin = .02;
      const material = new THREE.MeshStandardMaterial({ color: 0x1b1424, roughness: 1 });
      const wall = frameBox.getCenter(new THREE.Vector3()).setY(floorY);
      wall[thin] = inward[thin] > 0 ? frameBox.max[thin] : frameBox.min[thin];
      const add = (across, tall, deep, offsetIn, offsetSide, y) => {
        const box = new THREE.Vector3(); box[wide] = across; box.y = tall; box[thin] = deep;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.x, box.y, box.z), material);
        mesh.position.copy(wall).addScaledVector(inward, offsetIn).addScaledVector(handleSide, offsetSide).setY(y);
        mesh.receiveShadow = true;
        preview.group.attach(mesh);
        roomMeshes.push(mesh);
      };
      add(width, skin, depth, depth / 2, 0, floorY - skin / 2); // floor
      add(width, skin, depth, depth / 2, 0, floorY + height); // ceiling
      add(width, height, skin, depth, 0, floorY + height / 2); // far wall
      for (const s of [-1, 1]) add(skin, height, depth, depth / 2, s * width / 2, floorY + height / 2);
    },
    release() {
      this.setOpen(0);
      for (const mesh of roomMeshes) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      roomMeshes[0]?.material.dispose();
      roomMeshes = [];
    },
  };
}

const HAND_LENGTH = .09;
const _shoulder = new THREE.Vector3(), _elbow = new THREE.Vector3(), _wrist = new THREE.Vector3();
const _pole = new THREE.Vector3(), _toward = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

/**
 * Two-bone reach: puts the hand of `arm` at `point`, the elbow bending
 * down and out to his side (as an arm reaching for a handle does).
 */
function solveArm(arm, point, frame) {
  const { upper, lower, hand } = arm;
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_shoulder);
  lower.getWorldPosition(_elbow);
  (hand ?? lower).getWorldPosition(_wrist);
  const upperLength = _elbow.distanceTo(_shoulder), lowerLength = hand ? _wrist.distanceTo(_elbow) : 0;
  if (!hand) { aimBone(upper, lower, point); return; }
  // The hand bone is the wrist: it stops a hand's length short of the point.
  _toward.subVectors(point, _shoulder);
  _toward.setLength(Math.max(0, _toward.length() - HAND_LENGTH));
  const distance = THREE.MathUtils.clamp(_toward.length(), Math.abs(upperLength - lowerLength) + 1e-3, upperLength + lowerLength - 1e-3);
  _toward.normalize();
  // Out to his side: away from his middle.
  const middle = frame.getWorldPosition(new THREE.Vector3()).setY(_shoulder.y);
  _pole.subVectors(_shoulder, middle).setY(0).normalize().multiplyScalar(.6).add(_down);
  _pole.addScaledVector(_toward, -_pole.dot(_toward)).normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const out = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const elbow = _shoulder.clone().addScaledVector(_toward, along).addScaledVector(_pole, out);
  aimBone(upper, lower, elbow);
  aimBone(lower, hand, _shoulder.clone().addScaledVector(_toward, distance));
}

const _from = new THREE.Vector3(), _to = new THREE.Vector3(), _at = new THREE.Vector3();
const _turn = new THREE.Quaternion(), _parent = new THREE.Quaternion();
/** Turns `bone` so its `child` joint points at the world `point`. */
function aimBone(bone, child, point) {
  bone.updateMatrixWorld(true);
  bone.getWorldPosition(_at);
  _from.subVectors(child.getWorldPosition(_from), _at).normalize();
  _to.subVectors(point, _at).normalize();
  _turn.setFromUnitVectors(_from, _to);
  bone.parent.getWorldQuaternion(_parent);
  bone.quaternion.premultiply(_parent.clone().invert().multiply(_turn).multiply(_parent));
  bone.updateMatrixWorld(true);
}

import * as THREE from 'three';

const parentRotation = new THREE.Quaternion();
const frameRotation = new THREE.Quaternion();
const extra = new THREE.Quaternion();
const axis = new THREE.Vector3();

/**
 * Rotates a bone by `angle` about one of a character's own axes — X her
 * left/right, Y up, Z the way she faces, read from `frame` (the character's
 * root group) — on top of whatever pose an AnimationMixer just gave it.
 *
 * Imported rigs orient each bone's local axes arbitrarily (Mixamo and our
 * Blender-built rig disagree), so poses are written in the character's
 * frame instead and converted into the bone's parent space here. Call it
 * after mixer.update() every frame: the mixer overwrites the bone's
 * rotation each update, so bends never accumulate.
 *
 * Sign guide (right-handed): +X tips a bone's top forward (+Z), so a
 * hanging arm or leg swings forward with a negative X angle.
 *
 * @param {THREE.Object3D | undefined} bone skipped if missing
 * @param {THREE.Object3D} frame the character's root group
 * @param {THREE.Vector3} ownAxis unit axis in the character's frame
 * @param {number} angle radians
 */
export function bendBone(bone, frame, ownAxis, angle) {
  if (!bone || Math.abs(angle) < 1e-5) return;
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(parentRotation);
  frame.getWorldQuaternion(frameRotation);
  axis.copy(ownAxis).applyQuaternion(frameRotation).applyQuaternion(parentRotation.invert());
  bone.quaternion.premultiply(extra.setFromAxisAngle(axis, angle));
}

export const SIDEWAYS = new THREE.Vector3(1, 0, 0);
export const UP = new THREE.Vector3(0, 1, 0);
export const FORWARD = new THREE.Vector3(0, 0, 1);

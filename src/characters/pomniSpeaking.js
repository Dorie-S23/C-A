import * as THREE from 'three';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

/** Small alternating hand beats layered over the live Idle pose, never the R5 rig. */
export function createPomniSpeaking(pomni) {
  const names = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
  const entries = names.map(name => ({ name, bone: pomni.getObjectByName(`mixamorig${name}`), base: new THREE.Quaternion() }))
    .filter(entry => entry.bone);
  const bones = Object.fromEntries(entries.map(entry => [entry.name, entry.bone]));
  let time = 0, weight = 0, applied = false, speaking = false;
  function remove() {
    if (!applied) return;
    for (const entry of entries) entry.bone.quaternion.copy(entry.base);
    applied = false;
  }
  return {
    // Undo the previous layer BEFORE mixer.update(), including unkeyed bones.
    remove,
    update(dt, isSpeaking) {
      speaking = Boolean(isSpeaking);
      time += Math.max(0, dt);
      weight = THREE.MathUtils.damp(weight, speaking ? 1 : 0, 9, Math.max(0, dt));
      if (!speaking && weight < .001) weight = 0;
      if (!weight) return;
      for (const entry of entries) entry.base.copy(entry.bone.quaternion);
      for (const [side, phase] of [['Left', 0], ['Right', 1.5]]) {
        const beat = Math.max(0, Math.sin(time * 4.6 + phase));
        bendBone(bones[`${side}Arm`], pomni, SIDEWAYS, -weight * (.10 + beat * .045));
        bendBone(bones[`${side}ForeArm`], pomni, SIDEWAYS, -weight * (.24 + beat * .09));
        bendBone(bones[`${side}Hand`], pomni, UP, weight * Math.sin(time * 2.3 + phase) * .045);
      }
      applied = true;
    },
    reset() { remove(); time = 0; weight = 0; speaking = false; },
    get diagnostics() {
      return { speaking, weight, time, joints: entries.map(({ name, bone }) => ({ name, rotation: bone.quaternion.toArray() })) };
    },
  };
}

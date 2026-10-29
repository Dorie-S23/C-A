import * as THREE from 'three';
import { bendBone, SIDEWAYS, UP } from './bendBone.js';

const JUMP_BONES = ['Hips', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];

/** Layers a readable, tucked-leg jump pose over Pomni's current animation. */
export function createPomniJump(pomni) {
  const entries = JUMP_BONES
    .map((name) => ({ bone: pomni.getObjectByName(`mixamorig${name}`), base: new THREE.Quaternion() }))
    .filter(({ bone }) => bone);
  const bones = Object.fromEntries(JUMP_BONES.map((name) => [name, pomni.getObjectByName(`mixamorig${name}`)]));
  let applied = false;
  let weight = 0;
  let time = 0;
  let lastJumpsUsed = 0;
  let secondJumpPop = 0;

  function remove() {
    if (!applied) return;
    for (const entry of entries) entry.bone.quaternion.copy(entry.base);
    applied = false;
  }

  return {
    // Call before AnimationMixer.update() so the last procedural pose never
    // becomes the starting pose for the next frame.
    remove,
    update(dt, airborne, verticalVelocity, jumpsUsed, speed = 0) {
      dt = Math.max(0, dt);
      weight = THREE.MathUtils.damp(weight, airborne ? 1 : 0, 12, dt);
      time += dt;
      if (jumpsUsed < lastJumpsUsed) lastJumpsUsed = jumpsUsed;
      if (jumpsUsed > lastJumpsUsed && jumpsUsed === 2) secondJumpPop = 1;
      lastJumpsUsed = jumpsUsed;
      secondJumpPop = Math.max(0, secondJumpPop - dt * 2.8);
      if (weight < 0.001) return;

      for (const entry of entries) entry.base.copy(entry.bone.quaternion);
      const rising = THREE.MathUtils.clamp(verticalVelocity / 4.5, 0, 1);
      const runEnergy = THREE.MathUtils.clamp(speed / 5.1, 0, 1);
      const armLift = weight * (0.62 + 0.16 * rising + 0.28 * secondJumpPop + 0.08 * runEnergy);
      const waddle = Math.sin(time * 11) * (0.035 + 0.045 * runEnergy) * weight;
      const kick = Math.sin(time * 9) * (0.08 + 0.12 * runEnergy) * weight;
      bendBone(bones.Hips, pomni, SIDEWAYS, -0.1 * runEnergy * weight);
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        bendBone(bones[`${side}Arm`], pomni, SIDEWAYS, -armLift);
        bendBone(bones[`${side}Arm`], pomni, UP, sign * (0.08 + waddle));
        bendBone(bones[`${side}ForeArm`], pomni, SIDEWAYS, -0.52 * weight);
        bendBone(bones[`${side}UpLeg`], pomni, SIDEWAYS, (-0.38 - sign * kick) * weight);
        bendBone(bones[`${side}Leg`], pomni, SIDEWAYS, (0.72 + Math.max(0, sign * kick)) * weight);
      }
      applied = true;
    },
  };
}

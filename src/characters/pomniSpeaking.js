import * as THREE from 'three';
import { bendBone, SIDEWAYS, UP, FORWARD } from './bendBone.js';

// How she holds her arms while she talks, by the line's mood, in her own
// frame (see bendBone): arm < 0 raises the upper arm in front of her, out
// > 0 swings it away from her side, fore < 0 bends the elbow up, in > 0
// turns the forearm across her body. Radians. Neutral, small alternating
// hand beats; happy, arms open and bouncing; worried, hands held together
// in front of her; shocked, hands up toward her face; sad, barely moving;
// annoyed, one hand on her hip, the other making the point.
const HOLDS = {
  neutral: { L: { arm: -0.1, fore: -0.24 }, R: { arm: -0.1, fore: -0.24 } },
  happy: { L: { arm: -0.25, out: 0.35, fore: -0.45 }, R: { arm: -0.25, out: 0.35, fore: -0.45 } },
  worried: { L: { arm: -0.3, fore: -1.15, in: 0.75 }, R: { arm: -0.3, fore: -1.15, in: 0.75 } },
  shocked: { L: { arm: -0.45, out: 0.15, fore: -1.65, in: 0.35 }, R: { arm: -0.45, out: 0.15, fore: -1.65, in: 0.35 } },
  sad: { L: { arm: -0.04, fore: -0.12 }, R: { arm: -0.04, fore: -0.12 } },
  annoyed: { L: { arm: 0.1, out: 0.55, fore: -1.35, in: 0.9 }, R: { arm: -0.3, fore: -0.7, in: 0.2 } },
};
// The motion on top, per side (phase: 0 left, 1.5 right).
const BEATS = {
  neutral: (t, phase) => {
    const beat = Math.max(0, Math.sin(t * 4.6 + phase));
    return { arm: -beat * 0.045, fore: -beat * 0.09, hand: Math.sin(t * 2.3 + phase) * 0.045 };
  },
  happy: (t) => {
    const bounce = Math.sin(t * 6.5);
    return { out: bounce * 0.08, fore: -Math.abs(bounce) * 0.1, hand: bounce * 0.06 };
  },
  worried: (t, phase) => ({ fore: Math.sin(t * 5 + phase * 2) * 0.07, hand: Math.sin(t * 3.1) * 0.05 }),
  shocked: (t, phase) => ({ out: Math.sin(t * 15 + phase) * 0.03 }),
  sad: (t, phase) => ({ fore: -Math.max(0, Math.sin(t * 2 + phase)) * 0.05 }),
  annoyed: (t, phase) => (phase ? { arm: -Math.max(0, Math.sin(t * 3.6)) * 0.12, fore: -Math.max(0, Math.sin(t * 3.6)) * 0.2, hand: Math.sin(t * 3.6) * 0.1 } : {}),
};
const PARTS = ['arm', 'out', 'fore', 'in'];
const HOLD_SHARPNESS = 7;

/** Gestures for her lines, by mood, layered over the live Idle pose, never the R5 rig. */
export function createPomniSpeaking(pomni) {
  const names = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];
  const entries = names.map(name => ({ name, bone: pomni.getObjectByName(`mixamorig${name}`), base: new THREE.Quaternion() }))
    .filter(entry => entry.bone);
  const bones = Object.fromEntries(entries.map(entry => [entry.name, entry.bone]));
  const hold = { L: { arm: 0, out: 0, fore: 0, in: 0 }, R: { arm: 0, out: 0, fore: 0, in: 0 } };
  let time = 0, weight = 0, applied = false, speaking = false, mood = 'neutral';
  function remove() {
    if (!applied) return;
    for (const entry of entries) entry.bone.quaternion.copy(entry.base);
    applied = false;
  }
  return {
    // Undo the previous layer BEFORE mixer.update(), including unkeyed bones.
    remove,
    update(dt, isSpeaking, lineMood) {
      speaking = Boolean(isSpeaking);
      if (speaking) mood = HOLDS[lineMood] ? lineMood : 'neutral';
      dt = Math.max(0, dt);
      time += dt;
      weight = THREE.MathUtils.damp(weight, speaking ? 1 : 0, 9, dt);
      if (!speaking && weight < .001) weight = 0;
      for (const side of ['L', 'R']) {
        for (const part of PARTS) hold[side][part] = THREE.MathUtils.damp(hold[side][part], HOLDS[mood][side][part] ?? 0, HOLD_SHARPNESS, dt);
      }
      if (!weight) return;
      for (const entry of entries) entry.base.copy(entry.bone.quaternion);
      for (const [side, Side, sign, phase] of [['L', 'Left', 1, 0], ['R', 'Right', -1, 1.5]]) {
        const beat = BEATS[mood](time, phase);
        const at = (part) => (hold[side][part] + (beat[part] ?? 0)) * weight;
        // +1 on her left: "out" and "in" mirror side to side.
        bendBone(bones[`${Side}Arm`], pomni, FORWARD, sign * at('out'));
        bendBone(bones[`${Side}Arm`], pomni, SIDEWAYS, at('arm'));
        bendBone(bones[`${Side}ForeArm`], pomni, SIDEWAYS, at('fore'));
        bendBone(bones[`${Side}ForeArm`], pomni, UP, -sign * at('in'));
        bendBone(bones[`${Side}Hand`], pomni, UP, weight * (beat.hand ?? 0));
      }
      applied = true;
    },
    reset() {
      remove(); time = 0; weight = 0; speaking = false; mood = 'neutral';
      for (const side of ['L', 'R']) for (const part of PARTS) hold[side][part] = 0;
    },
    get diagnostics() {
      return { speaking, mood, weight, time, joints: entries.map(({ name, bone }) => ({ name, rotation: bone.quaternion.toArray() })) };
    },
  };
}

import * as THREE from 'three';
import { bendBone, FORWARD, SIDEWAYS } from './bendBone.js';

const SIDES = ['Left', 'Right'];
const PARTS = ['Arm', 'ForeArm'];

/** Replace the imported gait clips' awkward arm poses with a stride-led pump. */
export function createPomniGaitArms(pomni, clips) {
  const idle = clips.find((clip) => clip.name.toLowerCase() === 'idle');
  if (!idle) return { remove() {}, update() {} };

  const bones = Object.fromEntries(SIDES.flatMap((side) => PARTS.map((part) => {
    const name = `${side}${part}`;
    return [name, pomni.getObjectByName(`mixamorig${name}`)];
  })));
  const entries = Object.entries(bones)
    .filter(([, bone]) => bone)
    .map(([name, bone]) => ({ name, bone, idle: new THREE.Quaternion(), base: new THREE.Quaternion(), target: new THREE.Quaternion() }));

  // Sample the relaxed arm pose once. This gives the procedural swing a
  // stable hanging-arm base even when a Walk/Run clip has a very different
  // shoulder or elbow pose.
  const rest = new Map();
  pomni.traverse((object) => rest.set(object, [object.position.clone(), object.quaternion.clone(), object.scale.clone()]));
  const sampler = new THREE.AnimationMixer(pomni);
  sampler.clipAction(idle).play();
  sampler.setTime(Math.min(0.12, idle.duration * 0.2));
  for (const entry of entries) entry.idle.copy(entry.bone.quaternion);
  sampler.stopAllAction();
  sampler.uncacheRoot(pomni);
  for (const [object, [position, quaternion, scale]] of rest) {
    object.position.copy(position);
    object.quaternion.copy(quaternion);
    object.scale.copy(scale);
  }
  pomni.updateMatrixWorld(true);

  let applied = false;
  let weight = 0;
  let phase = 0;
  function remove() {
    if (!applied) return;
    for (const entry of entries) entry.bone.quaternion.copy(entry.base);
    applied = false;
  }

  return {
    remove,
    update(dt, speed, airborne) {
      dt = Math.max(0, dt);
      const moving = !airborne && speed > 0.15;
      weight = THREE.MathUtils.damp(weight, moving ? 1 : 0, 10, dt);
      phase += Math.max(0, speed) * dt * Math.PI * 1.04;
      if (weight < 0.001) return;

      const run = THREE.MathUtils.smoothstep(speed, 3.2, 5.2);
      const swing = THREE.MathUtils.lerp(0.18, 0.42, run);
      const elbow = THREE.MathUtils.lerp(0.12, 0.32, run);
      const spread = THREE.MathUtils.lerp(0.025, 0.075, run);
      for (const entry of entries) {
        entry.base.copy(entry.bone.quaternion);
        entry.bone.quaternion.copy(entry.idle);
      }
      for (const [side, sign] of [['Left', 1], ['Right', -1]]) {
        const cycle = Math.sin(phase) * sign;
        const arm = bones[`${side}Arm`];
        const forearm = bones[`${side}ForeArm`];
        bendBone(arm, pomni, SIDEWAYS, -cycle * swing);
        bendBone(arm, pomni, FORWARD, sign * spread);
        bendBone(forearm, pomni, SIDEWAYS, -elbow - Math.max(0, cycle) * elbow * 0.45);
      }
      for (const entry of entries) {
        entry.target.copy(entry.bone.quaternion);
        entry.bone.quaternion.copy(entry.base).slerp(entry.target, weight);
      }
      applied = true;
    },
  };
}

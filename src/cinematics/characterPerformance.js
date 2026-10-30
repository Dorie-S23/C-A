import * as THREE from 'three';
import { bendBone, FORWARD, SIDEWAYS, UP } from '../characters/bendBone.js';

export const ENDING_PERFORMANCE_ACTIONS = Object.freeze([
  'walkTo', 'runTo', 'idle', 'lookTowards', 'turnTowards', 'stepForward',
  'react', 'comfort', 'clutch', 'gesture',
]);

const _point = new THREE.Vector3();
const _own = new THREE.Vector3();

/**
 * A small, update-driven performance interface shared by imported and
 * procedural characters. Native adapters keep authored clips and poses;
 * this layer supplies consistent sequencing and only the missing overlays.
 */
export function createCharacterPerformance({ root, rig = {}, native = {} }) {
  if (!root) throw new Error('A character performance needs a root Object3D');
  const nodes = [...new Set([rig.body, rig.head, rig.chest, ...(rig.arms ?? []), ...(rig.legs ?? [])].filter(Boolean))];
  const rest = new Map(nodes.map(node => [node, {
    position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone(),
  }]));
  const arms = rig.arms ?? [];
  const legs = rig.legs ?? [];
  let time = 0;
  let phase = 0;
  let motion = null;
  let timed = null;
  let turning = null;
  let lookTarget = null;
  let attachedProp = null;
  let currentAction = 'idle';
  let disposed = false;

  function restoreRig() {
    for (const [node, base] of rest) {
      node.position.copy(base.position);
      node.quaternion.copy(base.quaternion);
      node.scale.copy(base.scale);
    }
  }

  function settle(task, result) {
    if (!task) return;
    const resolve = task.resolve;
    task.resolve = null;
    resolve?.(result);
  }

  function clearMotion(result = false) {
    const active = motion;
    motion = null;
    if (active?.native) native.cancelMotion?.();
    settle(active, result);
  }

  function clearTimed(result = false) {
    const active = timed;
    timed = null;
    settle(active, result);
  }

  function clearTurn(result = false) {
    const active = turning;
    turning = null;
    settle(active, result);
  }

  function promiseFor(task) {
    return new Promise(resolve => { task.resolve = resolve; });
  }

  function beginTimed(name, duration, target = null) {
    clearTimed(false);
    currentAction = name;
    native.onAction?.(name, { target });
    timed = { name, duration, elapsed: 0, resolve: null };
    return promiseFor(timed);
  }

  function beginMotion(point, speed, style) {
    if (disposed) return Promise.resolve(false);
    clearMotion(false);
    clearTurn(false);
    const target = point.clone();
    currentAction = style;
    native.onAction?.(style, { target, speed });
    motion = { target, speed, style, resolve: null, native: false };
    const promise = promiseFor(motion);
    if (native.moveTo) {
      motion.native = true;
      native.moveTo(target, {
        speed, style,
        onArrive: result => {
          if (motion?.target === target) {
            const active = motion;
            motion = null;
            currentAction = 'idle';
            native.onAction?.('idle');
            settle(active, result !== false && !disposed);
          }
        },
      });
    }
    return promise;
  }

  function idle() {
    if (disposed) return Promise.resolve(false);
    clearMotion(false);
    clearTimed(false);
    clearTurn(false);
    currentAction = 'idle';
    native.onAction?.('idle');
    return Promise.resolve(true);
  }

  function lookTowards(target) {
    if (disposed) return Promise.resolve(false);
    lookTarget = target ? target.clone() : null;
    native.lookTowards?.(lookTarget);
    return Promise.resolve(true);
  }

  function turnTowards(target) {
    if (disposed || !target) return Promise.resolve(false);
    clearTurn(false);
    root.getWorldPosition(_own);
    const yaw = Math.atan2(target.x - _own.x, target.z - _own.z);
    native.faceTowards?.(target.clone());
    turning = { yaw, resolve: null };
    return promiseFor(turning);
  }

  function walkTo(point, { speed = 1.2 } = {}) {
    return beginMotion(point, speed, 'walk');
  }

  function runTo(point, { speed = 3.4 } = {}) {
    return beginMotion(point, speed, 'run');
  }

  function stepForward(distance = 0.35, options = {}) {
    root.getWorldDirection(_point);
    const target = root.position.clone().addScaledVector(_point, distance);
    target.y = root.position.y;
    return walkTo(target, options);
  }

  function react(kind = 'surprise') {
    if (disposed) return Promise.resolve(false);
    return beginTimed(`react:${kind}`, kind === 'shock' ? 0.85 : 0.65);
  }

  function comfort(target = null) {
    if (disposed) return Promise.resolve(false);
    if (target) lookTowards(target);
    return beginTimed('comfort', 1.15, target);
  }

  function clutch(object = null) {
    if (disposed) return Promise.resolve(false);
    clearTimed(false);
    if (object && rig.propAnchor) {
      rig.propAnchor.attach(object);
      attachedProp = object;
    }
    currentAction = 'clutch';
    native.onAction?.('clutch', { object: attachedProp });
    return Promise.resolve(true);
  }

  function gesture(kind = 'wave') {
    if (disposed) return Promise.resolve(false);
    return beginTimed(`gesture:${kind}`, kind === 'point' ? 0.9 : 1.1);
  }

  function cancel() {
    if (disposed) return;
    clearMotion(false);
    clearTimed(false);
    clearTurn(false);
    lookTarget = null;
    native.lookTowards?.(null);
    currentAction = 'idle';
    native.onAction?.('idle');
    restoreRig();
  }

  function update(deltaSeconds) {
    if (disposed) return;
    const dt = Math.max(0, deltaSeconds);
    time += dt;
    native.update?.(dt);
    if (!native.update) restoreRig();

    if (motion && !motion.native) {
      _point.subVectors(motion.target, root.position).setY(0);
      const distance = _point.length();
      const step = motion.speed * dt;
      if (distance <= step || distance < 1e-6) {
        root.position.x = motion.target.x;
        root.position.z = motion.target.z;
        const active = motion;
        motion = null;
        currentAction = 'idle';
        native.onAction?.('idle');
        settle(active, true);
      } else {
        _point.multiplyScalar(1 / distance);
        root.position.addScaledVector(_point, step);
        const yaw = Math.atan2(_point.x, _point.z);
        const diff = THREE.MathUtils.euclideanModulo(yaw - root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
        root.rotation.y += diff * (1 - Math.exp(-10 * dt));
      }
    } else if (motion?.native && native.isMoving && !native.isMoving()) {
      const active = motion;
      motion = null;
      currentAction = 'idle';
      native.onAction?.('idle');
      settle(active, !disposed);
    }

    if (turning) {
      const diff = THREE.MathUtils.euclideanModulo(turning.yaw - root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      if (!native.turns) root.rotation.y += diff * (1 - Math.exp(-7 * dt));
      if (Math.abs(diff) < 0.015 || dt === 0 && Math.abs(diff) < 0.05) {
        const active = turning;
        turning = null;
        settle(active, true);
      }
    }

    const moving = Boolean(motion);
    const gait = moving ? (motion.style === 'run' ? 1.25 : 0.8) : 0;
    phase += dt * (moving ? motion.speed * 5.2 : 1.4);
    if (rig.body && !native.breathing) {
      const base = rest.get(rig.body);
      const breath = Math.sin(time * 1.7) * 0.008 * (moving ? 0.25 : 1);
      rig.body.scale.set(base.scale.x - breath * 0.3, base.scale.y + breath, base.scale.z - breath * 0.3);
      rig.body.position.y = base.position.y + Math.abs(Math.sin(phase)) * 0.035 * gait;
    }

    const special = currentAction === 'clutch' || currentAction === 'comfort'
      || currentAction.startsWith('react:') || currentAction.startsWith('gesture:');
    arms.forEach((arm, index) => {
      const side = index === 0 ? 1 : -1;
      if (currentAction === 'clutch') {
        bendBone(arm, root, SIDEWAYS, -1.05);
        bendBone(arm, root, FORWARD, side * 0.28);
      } else if (currentAction === 'comfort') {
        bendBone(arm, root, SIDEWAYS, index === 0 ? -1.12 : -0.25);
      } else if (currentAction.startsWith('react:')) {
        bendBone(arm, root, SIDEWAYS, -1.45 + Math.sin(time * 13) * 0.08);
      } else if (currentAction.startsWith('gesture:')) {
        if (index === 0) {
          bendBone(arm, root, SIDEWAYS, -1.55);
          bendBone(arm, root, FORWARD, Math.sin(time * 8) * 0.28);
        }
      } else if (moving && !special) {
        bendBone(arm, root, SIDEWAYS, Math.sin(phase + index * Math.PI) * 0.38 * gait);
      }
    });
    if (!special || moving) legs.forEach((leg, index) => {
      if (moving) bendBone(leg, root, SIDEWAYS, Math.sin(phase + index * Math.PI) * 0.48 * gait);
    });

    if (lookTarget && rig.head && !native.headLook) {
      root.getWorldPosition(_own);
      const yaw = Math.atan2(lookTarget.x - _own.x, lookTarget.z - _own.z);
      const diff = THREE.MathUtils.euclideanModulo(yaw - root.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
      bendBone(rig.head, root, UP, THREE.MathUtils.clamp(diff, -0.85, 0.85) * 0.65);
    }

    if (timed) {
      timed.elapsed += dt;
      if (timed.elapsed >= timed.duration) {
        const active = timed;
        timed = null;
        currentAction = 'idle';
        native.onAction?.('idle');
        settle(active, true);
      }
    }
  }

  function dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    attachedProp = null;
    native.dispose?.();
  }

  return {
    walkTo, runTo, idle, lookTowards, turnTowards, stepForward,
    react, comfort, clutch, gesture, update, cancel, dispose,
    get diagnostics() {
      return {
        action: currentAction, moving: Boolean(motion), turning: Boolean(turning),
        looking: Boolean(lookTarget), disposed, hasProp: Boolean(attachedProp || rig.prop), phase,
      };
    },
  };
}

import * as THREE from 'three';
import { bendBone, SIDEWAYS, FORWARD } from '../characters/bendBone.js';

export const JAX_PASS_BEAT = 'jaxPassByText';
export const JAX_PASS_RESUME = 'afterJaxPassBy';
export const JAX_PASS_SECONDS = 2.9;
const WALK_START = .25, WALK_SECONDS = 2.4, STEP_SECONDS = 1 / 2.8;

/** Room-owned background action. Never moves the door or the Ragatha cast. */
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
  const from = crossing.clone().addScaledVector(along, -2.6);
  const to = crossing.clone().addScaledVector(along, 2.6);
  const actor = cast.jax;
  const model = actor.children.find(child => !child.isLight);
  actor.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(model);
  const scale = 2.1 / sourceBounds.getSize(new THREE.Vector3()).y;
  actor.scale.setScalar(scale); // 2.1 m including ears; Pomni remains 1.6 m.
  model.position.y -= sourceBounds.min.y;
  // Reuse the rig with an optional strut; standalone cutscenes keep their run.
  actor.children.filter(child => child.isLight).forEach(light => { light.visible = false; });
  // Lower his T-pose shoulders and rest both hands at the overalls' pocket
  // area. These offsets use measured joint directions, not imported axes.
  const arms = [];
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
      const a = actor.worldToLocal(upper.getWorldPosition(new THREE.Vector3()));
      const b = actor.worldToLocal(lower.getWorldPosition(new THREE.Vector3()));
      arms.push({ upper, lower, hand, upperRest: upper.quaternion.clone(), lowerRest: lower.quaternion.clone(),
        handRest: hand?.quaternion.clone(), sign: Math.sign(b.x - a.x) });
    }
  }
  let elapsed = 0, phase = 'playing', paused = false, running = false, nextStep = 0;
  let stepCount = 0;
  const bodyBounds = new THREE.Box3();
  const skeletons = new Set();
  actor.traverse(mesh => { if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
  function sound(method, ...args) {
    try { audio?.[method]?.(...args); }
    catch { try { audio?.dispose?.(); } catch {} audio = null; }
  }
  function restore() {
    actor.visible = false; sound('dispose');
    // Generic room cleanup owns meshes/materials; release this one-shot rig's
    // GPU bone textures here too, including when a room is left mid-pass.
    skeletons.forEach(skeleton => skeleton.dispose());
  }
  function finish() {
    if (phase !== 'playing') return;
    phase = 'done'; restore(); onComplete?.();
  }
  return {
    get active() { return phase === 'playing'; }, get phase() { return phase; },
    get skippable() { return phase === 'playing'; },
    get diagnostics() { return { phase, elapsed, paused, visible: actor.visible,
      position: actor.position.toArray(), from: from.toArray(), to: to.toArray(),
      floorY, scale, stepCount, style: 'sly' }; },
    setPaused(value) { if (phase !== 'playing') return; paused = value; sound(value ? 'pause' : 'resume', elapsed); },
    update(delta) {
      if (phase !== 'playing' || paused) return;
      // Substeps prevent a slow frame from skipping the visible crossing or cues.
      let remaining = Math.max(0, delta);
      while (remaining > 1e-8 && phase === 'playing') {
        const dt = Math.min(remaining, 1 / 60), previous = elapsed;
        elapsed = Math.min(JAX_PASS_SECONDS, elapsed + dt); remaining -= dt;
        if (elapsed >= WALK_START && !running) { cast.playPassBy(from, to, WALK_SECONDS, { style: 'sly' }); running = true; }
        if (running) {
          cast.update(Math.max(0, Math.min(elapsed, WALK_START + WALK_SECONDS) - Math.max(previous, WALK_START)));
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
          // The shared procedural knee/lean poses dip below its bind-pose feet.
          // Correct only this room-owned actor, using its evaluated skin bounds.
          actor.updateMatrixWorld(true);
          actor.traverse(mesh => { if (mesh.isSkinnedMesh) mesh.computeBoundingBox(); });
          bodyBounds.setFromObject(actor);
          if (bodyBounds.min.y < floorY + .003) actor.position.y += floorY + .003 - bodyBounds.min.y;
          if (elapsed < WALK_START + WALK_SECONDS && elapsed >= nextStep) {
            sound('cue', 'step', actor.position); stepCount++; nextStep = elapsed + STEP_SECONDS;
          }
        }
        // Ragatha's conversation retains the camera throughout this background beat.
        if (elapsed >= JAX_PASS_SECONDS) finish();
      }
    },
    skip() { if (!paused) finish(); },
    dispose() { if (phase === 'disposed') return; phase = 'disposed'; restore(); },
  };
}

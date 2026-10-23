import * as THREE from 'three';
import { loadKaufmoRunExtra } from '../characters/kaufmoRunExtra.js';

const RUN_SPEED = 4.5;

/** Anchor the shot and route to the real door frames, never the hall entrance. */
export function kaufmoHallwayPlan(room) {
  room.group.updateMatrixWorld(true);
  const centre = name => {
    const frame = room.group.getObjectByName(name);
    if (!frame) throw new Error(`Missing hallway door: ${name}`);
    return new THREE.Box3().setFromObject(frame).getCenter(new THREE.Vector3());
  };
  const ribbit = centre('Door_Frame089');
  const kaufmo = centre('Door_Frame087');
  const y = room.spawn.y;
  // Both doors are on the left wall. The centre lane clears the doors and
  // Pomni, who watches from beside Ribbit's door with controls held.
  const lane = 0.65;
  const direction = Math.sign(kaufmo.z - ribbit.z);
  if (!direction || !room.hallDoors?.kaufmo?.control) throw new Error('Kaufmo route unavailable');
  return {
    points: [
      new THREE.Vector3(lane, y, ribbit.z - direction * 3),
      new THREE.Vector3(lane, y, kaufmo.z),
      new THREE.Vector3(kaufmo.x - 1.2, y, kaufmo.z),
    ],
    pomni: { x: ribbit.x + 1.8, y, z: ribbit.z, lookAt: { x: lane, z: ribbit.z + direction * 3 } },
    camera: new THREE.Vector3(1.8, y + 1.65, ribbit.z - direction * 6.5),
    target: new THREE.Vector3(-1.3, y + 0.9, ribbit.z + direction * 7),
  };
}

export async function preloadKaufmoHallwayCutscene() {
  return { kaufmoApi: await loadKaufmoRunExtra() };
}

/** Film the loaded Dorm Hall; the extra never joins player collision/portal lists. */
export function playKaufmoHallwayCutscene(renderer, { scene, room, kaufmoApi, plan = kaufmoHallwayPlan(room) }) {
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 150);
  camera.position.copy(plan.camera);
  camera.lookAt(plan.target);
  kaufmoApi.kaufmo.name = 'KaufmoHallwayRunner';
  scene.add(kaufmoApi.kaufmo);
  let segment = 0;
  let elapsed = 0;
  let finished = false;
  const duration = i => plan.points[i].distanceTo(plan.points[i + 1]) / RUN_SPEED;
  kaufmoApi.playPassBy(plan.points[0], plan.points[1], duration(0));

  return {
    cleanup() {
      if (finished) return;
      finished = true;
      kaufmoApi.kaufmo.removeFromParent();
    },
    update(deltaSeconds) {
      if (finished) return true;
      let remaining = deltaSeconds;
      while (segment < plan.points.length - 1) {
        const step = Math.min(remaining, duration(segment) - elapsed);
        kaufmoApi.update(step);
        elapsed += step;
        remaining -= step;
        if (elapsed < duration(segment) - 1e-8) break;
        segment++;
        elapsed = 0;
        if (segment < plan.points.length - 1) {
          // Open only as he turns in; the final leg crosses the actual doorway.
          const door = room.hallDoors.kaufmo.control;
          door.open({ immediate: true });
          door.update(0);
          room.group.updateMatrixWorld(true);
          kaufmoApi.playPassBy(plan.points[segment], plan.points[segment + 1], duration(segment));
        } else break;
      }
      renderer.render(scene, camera);
      return segment === plan.points.length - 1;
    },
  };
}

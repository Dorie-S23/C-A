import * as THREE from 'three';

const TRIGGER_DEPTH = 1.0;     // how far in front of the curtain walking in counts
const TRIGGER_SIDE_INSET = 0.3; // keep the edges of the arch from triggering it
const TRIGGER_HEIGHT = 4;
const ARRIVAL_DISTANCE = 3.5;  // where a player coming the other way appears

/**
 * A curtained archway that leads to another room: walking up into the
 * curtain's open side travels there. The same archway is also where a
 * player arrives when coming back the other way.
 *
 * @param {THREE.Group} group the loaded room
 * @param {string} curtainName the curtain mesh filling the arch
 * @param {1 | -1} facing which way along Z the arch opens into this room
 * @param {string} to the ROOM_LOADERS key it leads to
 * @returns {{ box: THREE.Box3, to: string, arrival: { spawn: THREE.Vector3, facing: number } } | null}
 */
export function createCurtainPortal(group, curtainName, facing, to) {
  const curtain = group.getObjectByName(curtainName);
  if (!curtain) return null;
  group.updateMatrixWorld(true);
  const curtainBox = new THREE.Box3().setFromObject(curtain);

  const front = facing > 0 ? curtainBox.max.z : curtainBox.min.z;
  const back = facing > 0 ? curtainBox.min.z : curtainBox.max.z;
  // From the curtain's back to TRIGGER_DEPTH in front of it: on a slow
  // frame a sprint covers over a metre, which could hop a thinner box.
  const depthEdge = front + facing * TRIGGER_DEPTH;
  const box = new THREE.Box3(
    new THREE.Vector3(curtainBox.min.x + TRIGGER_SIDE_INSET, curtainBox.min.y - 1, Math.min(back, depthEdge)),
    new THREE.Vector3(curtainBox.max.x - TRIGGER_SIDE_INSET, curtainBox.min.y + TRIGGER_HEIGHT, Math.max(back, depthEdge)),
  );

  const x = (curtainBox.min.x + curtainBox.max.x) / 2;
  const z = front + facing * ARRIVAL_DISTANCE;
  const spawn = new THREE.Vector3(x, floorBelow(group, x, curtainBox.max.y + 5, z) ?? curtainBox.min.y, z);
  // Yaw 0 faces -Z, so facing into a room that opens toward +Z is a half turn.
  const arrivalFacing = facing > 0 ? Math.PI : 0;

  return { box, to, arrival: { spawn, facing: arrivalFacing } };
}

function floorBelow(group, x, fromY, z) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(group, true);
  return hits.length > 0 ? hits[hits.length - 1].point.y : null;
}

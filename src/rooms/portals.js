import * as THREE from 'three';

const TRIGGER_DEPTH = 1.0;     // how far in front of the curtain walking in counts
const TRIGGER_SIDE_INSET = 0.3; // keep the edges of the arch from triggering it
const TRIGGER_HEIGHT = 4;
const ARRIVAL_DISTANCE = 3.5;  // where a player coming the other way appears

const DOOR_TRIGGER_DEPTH = 1.0;
const DOOR_TRIGGER_SIDE_INSET = 0.1;
const DOOR_ARRIVAL_DISTANCE = 1.8;

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

/**
 * A portal through an already-open hinged door (see doors.js), rather than
 * a walk-through curtain. Unlike createCurtainPortal, which direction leads
 * into the room isn't a hand-specified sign — it's worked out from `spawn`,
 * the same point doors.js already uses to decide which way the leaf swings.
 *
 * @param {THREE.Group} group the loaded room
 * @param {THREE.Box3} frameBox the opened door's frame bounding box
 * @param {THREE.Vector3} spawn a point inside the room (the doorway's trigger
 *   and arrival direction are both worked out relative to this)
 * @param {string} to the ROOM_LOADERS key it leads to
 * @returns {{ box: THREE.Box3, to: string, arrival: { spawn: THREE.Vector3, facing: number } }}
 */
export function createDoorPortal(group, frameBox, spawn, to) {
  const size = frameBox.getSize(new THREE.Vector3());
  const wideAxis = size.x >= size.z ? 'x' : 'z';
  const thinAxis = wideAxis === 'x' ? 'z' : 'x';
  const center = frameBox.getCenter(new THREE.Vector3());

  const intoRoom = new THREE.Vector3().subVectors(spawn, center).setY(0);
  if (intoRoom.lengthSq() < 1e-6) intoRoom.set(0, 0, 1); // spawn directly on the doorway: arbitrary but valid
  intoRoom.normalize();

  const box = frameBox.clone();
  box.min[wideAxis] += DOOR_TRIGGER_SIDE_INSET;
  box.max[wideAxis] -= DOOR_TRIGGER_SIDE_INSET;
  box.min[thinAxis] -= DOOR_TRIGGER_DEPTH;
  box.max[thinAxis] += DOOR_TRIGGER_DEPTH;
  box.min.y -= 0.2;

  // This function is called once per room, by that room's own loader, using
  // a point inside THAT room as `spawn` — so "arrival" always means landing
  // back inside the room that called it (the far side of the door from
  // wherever the player is coming from), not out past the doorway into
  // whatever this room doesn't model beyond it.
  const arrivalSpawn = center.clone().addScaledVector(intoRoom, DOOR_ARRIVAL_DISTANCE);
  arrivalSpawn.y = floorBelow(group, arrivalSpawn.x, frameBox.max.y + 5, arrivalSpawn.z) ?? frameBox.min.y;
  const arrivalFacing = Math.atan2(intoRoom.x, intoRoom.z);

  return { box, to, arrival: { spawn: arrivalSpawn, facing: arrivalFacing } };
}

function floorBelow(group, x, fromY, z) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(group, true);
  return hits.length > 0 ? hits[hits.length - 1].point.y : null;
}

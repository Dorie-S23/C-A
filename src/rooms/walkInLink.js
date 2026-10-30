import * as THREE from 'three';
import { sill } from './connectRooms.js';

// How far past the doorway Pomni can step before main.js swaps the hall in
// (beyond it there's no floor of the room's own); as pomniRoom.js's.
const REACH = 0.6;
const WALL_MARGIN = 0.4; // main.js's
// The two rooms' walls around the doorway are modelled on the same line
// (Kaufmo's is 1 cm behind the hall's), both double-sided: that close they
// flicker through each other. Sliding the room a little further back keeps
// each room's wall in front from its own side.
const SEAM = 0.04;

/**
 * Where a room sits behind its door in the Dorm Hall, for main.js to show it
 * there and walk Pomni between the two (as pomniRoom.js's createHallLink
 * does for her room): the room is turned and moved so its doorway lines up
 * with the hall's, sill to sill.
 *
 * @param {{ bounds: THREE.Box3 }} room the loaded room; its bounds are
 *   widened out through the doorway so she can reach the swap
 * @param {{ frameBox: THREE.Box3, inside: THREE.Vector3, control: object,
 *   parts: THREE.Object3D[] }} door the room's own door: its frame's bounds,
 *   any point inside the room, its openable control, and everything of it
 *   that's hidden while the room is shown from the hall
 * @param {{ sill: THREE.Vector3, into: THREE.Vector3 }} hallDoorway
 *   dormHallRoom.js's walkInDoorway for it
 */
export function linkToHall(room, door, hallDoorway) {
  const size = door.frameBox.getSize(new THREE.Vector3());
  const centre = door.frameBox.getCenter(new THREE.Vector3());
  const axis = size.x < size.z ? 'x' : 'z';
  const wide = axis === 'x' ? 'z' : 'x';
  const outward = door.inside[axis] < centre[axis] ? 1 : -1;
  const out = new THREE.Vector3();
  out[axis] = outward;

  // Out of the room is into the hall, which is the hall doorway's -into:
  // turn the room by that difference (yaw 0 is +Z; atan2(x, z) is a
  // direction's yaw), then line the sills up.
  const yawOf = (v) => Math.atan2(v.x, v.z);
  const yaw = yawOf(hallDoorway.into.clone().negate()) - yawOf(out);
  const rotation = new THREE.Matrix4().makeRotationY(yaw);
  const roomSill = sill(door.frameBox).applyMatrix4(rotation);
  const target = hallDoorway.sill.clone().addScaledVector(hallDoorway.into, SEAM);
  const toHall = new THREE.Matrix4().makeTranslation(target.sub(roomSill)).multiply(rotation);

  const reach = centre.clone();
  reach[axis] += outward * (REACH + WALL_MARGIN);
  room.bounds = room.bounds.clone().expandByPoint(reach);

  return {
    toHall,
    yawToHall: yaw,
    // Out through the doorway, in the hall's coordinates and the room's.
    outward: out.clone().transformDirection(toHall),
    outwardInRoom: out,
    depthPast: (point) => (point[axis] - centre[axis]) * outward,
    door: door.parts,
    isOpen: () => door.control.ajar,
    crossed: (point) => (point[axis] - centre[axis]) * outward > 0
      && Math.abs(point[wide] - centre[wide]) < size[wide] / 2,
  };
}

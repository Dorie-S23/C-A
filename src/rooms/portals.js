import * as THREE from 'three';

const TRIGGER_DEPTH = 1.0;     // how far in front of the curtain walking in counts
const TRIGGER_SIDE_INSET = 0.3; // keep the edges of the arch from triggering it
const TRIGGER_HEIGHT = 4;
const ARRIVAL_DISTANCE = 3.5;  // where a player coming the other way appears

const DOOR_TRIGGER_DEPTH = 1.0;
const DOOR_TRIGGER_SIDE_INSET = 0.1;
const DOOR_ARRIVAL_DISTANCE = 1.8;
// A plain open doorway shows the scene's background colour through it —
// reads as a black void, not "there's a hallway through here". A warm
// glow just past the frame (plus a soft light bleeding back onto the
// frame itself) suggests a lit passage instead, without needing an
// actual rendered view of the other room.
//
// This used to be a flat, hard-edged, fully opaque colour — which, lit
// head-on and filling almost the whole opening, read as a solid painted
// wall rather than an opening ("it's as if the door's closed"), and gave
// anything crossing in front of it zero rim/fill light of its own, so it
// silhouetted. A radial gradient (bright, warm centre fading to fully
// transparent at the edges) keeps the same "something's glowing back
// there" cue without the hard rectangle, and letting the room's own dark
// show through at the edges is what actually reads as depth/an opening.
const GLIMPSE_INSET = 0.92; // shrink from the frame's full opening so it doesn't poke past the trim
const GLIMPSE_CORE_COLOR = 'rgba(247, 208, 150, 0.92)';
const GLIMPSE_MID_COLOR = 'rgba(214, 160, 104, 0.5)';
const GLIMPSE_EDGE_COLOR = 'rgba(214, 160, 104, 0)';
const GLIMPSE_LIGHT_COLOR = 0xffce8a;
const GLIMPSE_LIGHT_INTENSITY = 2.5;
const GLIMPSE_LIGHT_RANGE = 4.5;

let glimpseTexture = null;
function getGlimpseTexture() {
  if (glimpseTexture) return glimpseTexture;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, GLIMPSE_CORE_COLOR);
  gradient.addColorStop(0.55, GLIMPSE_MID_COLOR);
  gradient.addColorStop(1, GLIMPSE_EDGE_COLOR);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  glimpseTexture = new THREE.CanvasTexture(canvas);
  return glimpseTexture;
}

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

  addDoorwayGlimpse(group, frameBox, center, intoRoom, wideAxis);

  return { box, to, arrival: { spawn: arrivalSpawn, facing: arrivalFacing } };
}

/**
 * A warm glowing panel + soft light just past the open door, facing back
 * into the room — so looking at an open doorway shows a dim lit passage
 * instead of the flat black of empty, unmodelled space beyond it.
 */
function addDoorwayGlimpse(group, frameBox, center, intoRoom, wideAxis) {
  const size = frameBox.getSize(new THREE.Vector3());
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(size[wideAxis] * GLIMPSE_INSET, size.y * GLIMPSE_INSET),
    new THREE.MeshBasicMaterial({
      map: getGlimpseTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  panel.name = 'DoorwayGlimpse';
  panel.position.copy(center).addScaledVector(intoRoom, -0.25);
  panel.rotation.y = Math.atan2(intoRoom.x, intoRoom.z);
  group.add(panel);

  const glow = new THREE.PointLight(GLIMPSE_LIGHT_COLOR, GLIMPSE_LIGHT_INTENSITY, GLIMPSE_LIGHT_RANGE, 2);
  glow.position.copy(center).addScaledVector(intoRoom, -0.4);
  group.add(glow);
}

function floorBelow(group, x, fromY, z) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(group, true);
  return hits.length > 0 ? hits[hits.length - 1].point.y : null;
}

import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';
import { addMirrorReflections } from './mirrors.js';
import { openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';

const CAINE_DISTANCE = 3; // how far in front of the spawn point Caine stands
const CAINE_WALL_GAP = 0.8; // keep him at least this far off any wall in the way

const PICTURE_ID = 'ca1';
const PICTURE_URL = './models/objects/ca1.png';
const PICTURE_HEIGHT = 1.4;
// Tucked beside the toy blocks rather than hung on the nearest wall — the
// story has this photo kicked around the circus, not framed and displayed.
const PICTURE_ANCHOR = 'Number_Cube';
const PICTURE_OFFSET = new THREE.Vector3(-0.5, 0, 0.35);

// The glTF export carries these as "Door Frame.024" / "Door Slab.024";
// three.js's GLTFLoader sanitizes node names (spaces and the disambiguating
// dot both go), so they come out as this at runtime.
const DOOR_FRAME_NAME = 'Door_Frame024';
const DOOR_SLAB_NAME = 'Door_Slab024';

// Right in the doorway's own thickness (depth 0 = the frame's centre),
// not further out into the hallway: addDoorwayGlimpse (portals.js) puts
// an opaque warm panel 0.25m past the frame on the hallway side to stand
// in for the unmodelled space beyond it, which would otherwise hide
// anything walking behind it. Staying inside the frame's own ~0.17m
// thickness keeps him in front of that panel instead of occluded by it.
const JAX_PASSBY_HALLWAY_DEPTH = 0;
// How much wider than the doorway itself his path spans, so he's visibly
// entering and leaving the gap rather than just appearing and vanishing
// exactly at its edges.
const JAX_PASSBY_MARGIN = 0.5;

// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
export function loadPomniRoom(onProgress, { from, items } = {}) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress),
    loadCaine(),
  ]).then(([room, { caine, collider }]) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    addMirrorReflections(room.group, room.spawn);
    // Caine always stands relative to the room's own default spawn, even
    // when `from` below moves the player's actual spawn to the doorway.
    const defaultSpawn = room.spawn;

    if (items) {
      const origin = new THREE.Vector3(defaultSpawn.x, defaultSpawn.y + PICTURE_HEIGHT, defaultSpawn.z);
      const spot = findSpotNear(room.group, PICTURE_ANCHOR, PICTURE_OFFSET)
        ?? findWallSpot(room.group, origin, new THREE.Vector3(1, 0, 0))
        ?? findWallSpot(room.group, origin, new THREE.Vector3(-1, 0, 0));
      if (spot) placeOfficePicture(room, items, PICTURE_ID, PICTURE_URL, spot.position, spot.rotationY);
    }

    const door = openHingedDoor(room.group, DOOR_FRAME_NAME, DOOR_SLAB_NAME, room.spawn, room.collisionMeshes);
    if (door) {
      const doorCenter = door.frameBox.getCenter(new THREE.Vector3());
      room.spawnFacing = Math.atan2(room.spawn.x - doorCenter.x, room.spawn.z - doorCenter.z);

      const portal = createDoorPortal(room.group, door.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }

      // Pre-Level 1's "Jax storms past" plays over this room as a stand-in
      // for the circus hallway it's actually set in (see playDialoguePreview
      // in main.js) — so the pass-by needs to read as happening out in the
      // hall, glimpsed through the open door, not someone wandering through
      // Pomni's own bedroom. userData survives onto `group`, which becomes
      // the live `currentRoom` main.js reads this back from.
      room.group.userData.jaxPassBy = computeDoorwayPassBy(door.frameBox, defaultSpawn);
    }

    placeInFrontOfSpawn(caine, { group: room.group, spawn: defaultSpawn });
    room.group.add(caine);
    caine.updateMatrixWorld(true);

    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    room.update = createCaineIdle(caine);

    return room;
  });
}

/**
 * The player spawns facing -Z, so Caine goes CAINE_DISTANCE along -Z from
 * the spawn — pulled in if a wall is closer — then dropped onto whatever
 * floor is under that point and turned to face the spawn.
 */
function placeInFrontOfSpawn(caine, { group, spawn }) {
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3(0, 0, -1);

  raycaster.set(new THREE.Vector3(spawn.x, spawn.y + 1, spawn.z), forward);
  raycaster.far = CAINE_DISTANCE + CAINE_WALL_GAP;
  const wallHit = raycaster.intersectObject(group, true)[0];
  const distance = wallHit
    ? Math.max(wallHit.distance - CAINE_WALL_GAP, 1)
    : CAINE_DISTANCE;

  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z).addScaledVector(forward, distance);

  raycaster.set(new THREE.Vector3(position.x, spawn.y + 1, position.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 3;
  const floorHit = raycaster.intersectObject(group, true)[0];
  if (floorHit) position.y = floorHit.point.y;

  caine.position.copy(position);
  caine.rotation.y = Math.atan2(spawn.x - position.x, spawn.z - position.z);
}

/**
 * A straight-line path crossing through the doorway itself — not into the
 * room, not out into the unmodelled hallway past it (see
 * JAX_PASSBY_HALLWAY_DEPTH) — wide enough that something walking it is
 * seen entering and leaving the gap rather than popping in and out at its
 * exact edges. Same wideAxis logic as createDoorPortal (whichever of x/z
 * the frame spans more of is the door's width).
 */
function computeDoorwayPassBy(frameBox, spawn) {
  const size = frameBox.getSize(new THREE.Vector3());
  const wideAxis = size.x >= size.z ? 'x' : 'z';
  const center = frameBox.getCenter(new THREE.Vector3());

  const intoRoom = new THREE.Vector3().subVectors(spawn, center).setY(0);
  if (intoRoom.lengthSq() < 1e-6) intoRoom.set(0, 0, 1);
  intoRoom.normalize();

  const beyond = center.clone().addScaledVector(intoRoom, -JAX_PASSBY_HALLWAY_DEPTH);
  beyond.y = spawn.y;
  const half = size[wideAxis] / 2 + JAX_PASSBY_MARGIN;

  const from = beyond.clone();
  const to = beyond.clone();
  from[wideAxis] -= half;
  to[wideAxis] += half;
  return { from, to };
}

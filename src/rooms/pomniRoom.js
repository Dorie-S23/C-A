import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';
import { loadRagatha } from '../characters/ragatha.js';
import { addMirrorReflections } from './mirrors.js';
import { openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';

const CAINE_DISTANCE = 3; // how far in front of the spawn point Caine stands
const CAINE_WALL_GAP = 0.8; // keep him at least this far off any wall in the way

// Pre-Level 1: Ragatha comes in from the doorway the player faces and
// stops this far in front of Pomni to chat.
const RAGATHA_TALK_DISTANCE = 2.2;
const RAGATHA_WALK_IN = 2.5; // how far back she starts her walk up
const RAGATHA_WALL_GAP = 0.6;
const RAGATHA_MIN_DISTANCE = 1.2; // never closer than this to Pomni

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

// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
//
// Previewing Pre-Level 1 (`preview`), Ragatha stands in for Caine — Pomni
// only goes looking for him after that conversation.
export function loadPomniRoom(onProgress, { from, items, preview } = {}) {
  const withRagatha = preview === 'preLevel1';
  return Promise.all([
    loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress),
    withRagatha ? loadRagatha() : loadCaine(),
  ]).then(([room, cast]) => {
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
    }

    if (withRagatha) {
      stageRagatha(room, cast, defaultSpawn, room.spawnFacing ?? 0);
      return room;
    }

    const { caine, collider } = cast;
    placeInFrontOfSpawn(caine, { group: room.group, spawn: defaultSpawn });
    room.group.add(caine);
    caine.updateMatrixWorld(true);

    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    room.update = createCaineIdle(caine);

    return room;
  });
}

/**
 * Puts Ragatha out of the way along the direction the player faces at
 * spawn, ready to walk up to Pomni, and returns the hooks main.js's
 * dialogue preview drives her with: `onDialogueNode` follows each node's
 * `anim.ragatha` cue (a pose name, or 'walkIn' to walk up) and makes her
 * gesture along while the line is hers.
 */
function stageRagatha(room, { ragatha, collider, update, setPose, setSpeaking, walkTo, faceTowards }, spawn, facing) {
  const forward = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing)); // yaw 0 faces -Z
  const clear = clearDistance(room.group, spawn, forward) - RAGATHA_WALL_GAP;
  const talkDistance = Math.max(RAGATHA_MIN_DISTANCE, Math.min(RAGATHA_TALK_DISTANCE, clear));
  const startDistance = Math.max(talkDistance, Math.min(talkDistance + RAGATHA_WALK_IN, clear));

  const pomniSpot = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
  const talkSpot = pomniSpot.clone().addScaledVector(forward, talkDistance);
  talkSpot.y = floorHeightAt(room.group, talkSpot) ?? spawn.y;

  ragatha.position.copy(pomniSpot).addScaledVector(forward, startDistance);
  ragatha.position.y = talkSpot.y;
  ragatha.rotation.y = Math.atan2(-forward.x, -forward.z);
  room.group.add(ragatha);
  ragatha.updateMatrixWorld(true);
  // She walks, so her collider's box is refreshed every frame.
  room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider), dynamic: true });

  let cue = 'idle';
  room.onDialogueNode = (node) => {
    setSpeaking(node?.type === 'line' && node.speaker === 'ragatha');
    const next = node ? node.anim?.ragatha : 'idle';
    if (!next || next === cue) return;
    cue = next;
    if (cue !== 'walkIn') {
      setPose(cue);
      return;
    }
    walkTo(talkSpot, () => {
      faceTowards(pomniSpot);
      // Unless she's been cued into something else on the way over.
      if (cue === 'walkIn') setPose('listen');
    });
  };
  room.talkPartner = talkSpot;
  room.update = update;
}

/** How far the room is open from `origin` along `direction`, at waist height. */
function clearDistance(group, origin, direction) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(origin.x, origin.y + 1, origin.z), direction);
  const hit = raycaster.intersectObject(group, true)[0];
  return hit ? hit.distance : Infinity;
}

function floorHeightAt(group, point) {
  const raycaster = new THREE.Raycaster(new THREE.Vector3(point.x, point.y + 1, point.z), new THREE.Vector3(0, -1, 0), 0, 3);
  const hit = raycaster.intersectObject(group, true)[0];
  return hit ? hit.point.y : null;
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

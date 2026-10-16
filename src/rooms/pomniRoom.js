import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';
import { loadRagatha } from '../characters/ragatha.js';
import { addMirrorReflections } from './mirrors.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';
import { createDoorConnection } from './portals.js';
import { createBedroomLighting } from './bedroomLighting.js';
import { loadPomniOpening } from '../cinematics/pomniOpening.js';
import { loadRagatha } from '../characters/ragatha.js';
import { loadDormHallPreview } from './dormHallPreview.js';

const RAGATHA_TALK_DISTANCE = 2.2;
const RAGATHA_MIN_DISTANCE = 1.4;
const RAGATHA_WALL_GAP = 0.5;
const RAGATHA_OUTSIDE_DOOR = 1.5;
const RAGATHA_WALK_IN = 2.0;

const PICTURE_ID = 'ca1';
const PICTURE_URL = './models/objects/ca1.png';
const PICTURE_HEIGHT = 1.4;
// Tucked beside the toy blocks rather than hung on the nearest wall — the
// story has this photo kicked around the circus, not framed and displayed.
const PICTURE_ANCHOR = 'Number_Cube';
const PICTURE_OFFSET = new THREE.Vector3(-0.5, 0, 0.35);


// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
//
// Previewing Pre-Level 1 (`preview`), Ragatha stands in for Caine — Pomni
// only goes looking for him after that conversation.
//
// `embedded`: loaded to be joined onto the Dorm Hall behind its Pomni door
// (see connectRooms.js), not played on its own — so its door is left out
// entirely (the hall's door, in the same doorway, is the one that opens)
// and `room.doorway` says where that doorway is.
export function loadPomniRoom(onProgress, { from, items, preview, embedded = false } = {}) {
  const withRagatha = preview === 'preLevel1';
  return Promise.all([
    loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress),
    withRagatha ? loadRagatha() : loadCaine(),
  ]).then(([room, cast]) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    room.reflectors = addMirrorReflections(room.group, room.spawn);
    // Caine always stands relative to the room's own default spawn, even
    // when `from` below moves the player's actual spawn to the doorway.
export function loadPomniRoom(onProgress, { from, travel, openingMode, items,
  hallPreview = typeof window !== 'undefined' } = {}) {
  return loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress).then(async (room) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    addMirrorReflections(room.group, room.spawn);
    // Keep item placement independent of door arrival.
    const defaultSpawn = room.spawn;

    if (items) {
      const origin = new THREE.Vector3(defaultSpawn.x, defaultSpawn.y + PICTURE_HEIGHT, defaultSpawn.z);
      const spot = findSpotNear(room.group, PICTURE_ANCHOR, PICTURE_OFFSET)
        ?? findWallSpot(room.group, origin, new THREE.Vector3(1, 0, 0))
        ?? findWallSpot(room.group, origin, new THREE.Vector3(-1, 0, 0));
      if (spot) placeOfficePicture(room, items, PICTURE_ID, PICTURE_URL, spot.position, spot.rotationY);
    }

    if (embedded) {
      room.doorway = removeDoor(room);
      return placeCaine(room, cast, defaultSpawn, null);
    }

    const door = openHingedDoor(room.group, DOOR_FRAME_NAME, DOOR_SLAB_NAME, room.spawn, room.collisionMeshes);
    let doorControl = null;
    if (door) {
      const doorCenter = door.frameBox.getCenter(new THREE.Vector3());
      room.spawnFacing = Math.atan2(room.spawn.x - doorCenter.x, room.spawn.z - doorCenter.z);

      const portal = createDoorPortal(room.group, door.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }

      // Shut until Pomni opens it with E (see makeDoorOpenable).
      doorControl = makeDoorOpenable(room, door, { portal });
      room.doorControl = doorControl;
      room.interactables = [...(room.interactables ?? []), doorControl.interactable];
    }

    if (withRagatha) {
      // Ragatha's entrance: she's already let herself in, so the door
      // starts open (Pomni can still shut it with E afterwards).
      doorControl?.open({ immediate: true });
      doorControl?.update(0);
      const doorway = door?.frameBox.getCenter(new THREE.Vector3());
      const ragathaUpdate = stageRagatha(room, cast, defaultSpawn, room.spawnFacing ?? 0, doorway);
      room.update = (deltaSeconds) => {
        ragathaUpdate(deltaSeconds);
        doorControl?.update(deltaSeconds);
      };
      return room;
    }

    return placeCaine(room, cast, defaultSpawn, doorControl);
  });
}

function placeCaine(room, { caine, collider }, spawn, doorControl) {
  placeInFrontOfSpawn(caine, { group: room.group, spawn });
  room.group.add(caine);
  caine.updateMatrixWorld(true);

  room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
  const caineIdle = createCaineIdle(caine);
  room.update = (deltaSeconds) => {
    caineIdle(deltaSeconds);
    doorControl?.update(deltaSeconds);
  };
  return room;
}

/**
 * Takes the door out of the room (hidden, and out of its collision) and
 * returns its doorway: the frame's bounds and which way is into the room.
 */
function removeDoor(room) {
  const frame = room.group.getObjectByName(DOOR_FRAME_NAME);
  const slab = room.group.getObjectByName(DOOR_SLAB_NAME);
  if (!frame) return null;
  room.group.updateMatrixWorld(true);
  const frameBox = new THREE.Box3().setFromObject(frame);

  const doorMeshes = [];
  for (const part of [frame, slab].filter(Boolean)) {
    part.traverse((child) => { if (child.isMesh) doorMeshes.push(child); });
    part.visible = false;
  }
  room.collisionMeshes = room.collisionMeshes.filter((entry) => !doorMeshes.includes(entry.mesh));

  // Straight out of the wall (the frame's thin axis), toward the room.
  const size = frameBox.getSize(new THREE.Vector3());
  const centre = frameBox.getCenter(new THREE.Vector3());
  const thinAxis = size.x < size.z ? 'x' : 'z';
  const intoRoom = new THREE.Vector3();
  intoRoom[thinAxis] = room.spawn[thinAxis] < centre[thinAxis] ? -1 : 1;
  return { frameBox, intoRoom };
}

/**
 * Puts Ragatha out of the way along the direction the player faces at
 * spawn, ready to walk up to Pomni, and sets the hooks main.js's dialogue
 * preview drives her with: `onDialogueNode` follows each node's
 * `anim.ragatha` cue (a pose name, or 'walkIn' to walk up) and makes her
 * gesture along while the line is hers. Returns her per-frame update.
 */
function stageRagatha(room, { ragatha, collider, update, setPose, setSpeaking, walkTo, faceTowards }, spawn, facing, doorway) {
  const forward = new THREE.Vector3(-Math.sin(facing), 0, -Math.cos(facing)); // yaw 0 faces -Z
  const clear = clearDistance(room.group, spawn, forward) - RAGATHA_WALL_GAP;
  const talkDistance = Math.max(RAGATHA_MIN_DISTANCE, Math.min(RAGATHA_TALK_DISTANCE, clear));
  // The spawn faces the doorway, so its distance along `forward` puts her
  // on the far side of it.
  const startDistance = doorway
    ? Math.max(talkDistance, doorway.clone().sub(spawn).setY(0).dot(forward) + RAGATHA_OUTSIDE_DOOR)
    : Math.max(talkDistance, Math.min(talkDistance + RAGATHA_WALK_IN, clear));

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
  return update;
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
    room.lighting = createBedroomLighting(room);
    room.group.userData.bedroomLighting = room.lighting;
    room.update = room.lighting.update;
    const exit = createDoorConnection(room, {
      doorName: 'Plane_1', detailNames: ['Door_Frame024', 'Plane_2'],
      to: 'dorm', prompt: 'Exit to Hallway', travel,
    });
    room.interactables = [exit.interactable, ...(room.interactables ?? [])];
    const doorCenter = new THREE.Box3().setFromObject(exit.interactable.objects[0]).getCenter(new THREE.Vector3());
    room.spawnFacing = Math.atan2(room.spawn.x - doorCenter.x, room.spawn.z - doorCenter.z);
    if (from === 'dorm') {
      room.spawn = exit.arrival.spawn;
      room.spawnFacing = exit.arrival.facing;
    }
    // Preview loads stay unchanged. A new game plays R5; later bedroom visits
    // restore only its settled cover, with no replay and the normal door spawn.
    if (openingMode) {
      try {
        onProgress?.(0, 'opening');
        room.opening = await loadPomniOpening(room, {
          settled: openingMode === 'settled',
          onProgress: (event) => onProgress?.(event.total ? event.loaded / event.total : 0, 'opening'),
        });
        room.group.userData.pomniOpening = room.opening;
      } catch (error) {
        console.warn('Pomni opening unavailable; continuing in the bedroom.', error);
        room.openingError = true;
        room.lighting.reset();
      }
    }
    if (openingMode === 'play') {
      try {
        const cast = await loadRagatha();
        cast.ragatha.visible = false;
        room.group.add(cast.ragatha);
        room.group.userData.ragathaCast = cast;
      } catch (error) {
        console.warn('Ragatha model unavailable; using the staged arrival fallback.', error);
      }
    }
    // A static visual backdrop only: no hall NPCs, portals, colliders or lights.
    // CPU-only Node room tests can explicitly opt in when testing this view.
    // Explicit low-cost fallback also works on the static production build.
    const disabled = new URLSearchParams(globalThis.location?.search).get('hallPreview') === '0';
    if (hallPreview && !disabled) {
      try {
        const preview = await loadDormHallPreview();
        room.group.add(preview.group);
        room.group.userData.dormHallPreview = preview;
      } catch (error) {
        room.group.userData.dormHallPreviewError = String(error.message ?? error);
        console.warn('Hall preview unavailable; retaining the temporary vestibule.', error);
      }
    }
    return room;
  });
}

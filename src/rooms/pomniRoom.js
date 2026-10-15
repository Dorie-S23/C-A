import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { addMirrorReflections } from './mirrors.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';
import { createDoorConnection } from './portals.js';
import { createBedroomLighting } from './bedroomLighting.js';
import { loadPomniOpening } from '../cinematics/pomniOpening.js';
import { loadRagatha } from '../characters/ragatha.js';

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
export function loadPomniRoom(onProgress, { from, travel, openingMode, items } = {}) {
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
    return room;
  });
}

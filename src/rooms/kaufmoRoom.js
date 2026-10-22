import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmoRunExtra } from '../characters/kaufmoRunExtra.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py, plus Kaufmo himself standing in it.
 * Walking up and pressing E plays the Level 2 opening script, via the
 * `playDialogue` hook main.js passes every room loader (see selectRoom()).
 */
export function loadKaufmoRoom(onProgress, {
  playDialogue, from, items, kaufmoStory,
} = {}) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/kaufmos-room.glb', onProgress),
    loadKaufmoRunExtra({ keyLight: false }), // the room already has real lighting of its own
  ]).then(([room, kaufmoApi]) => {
    const { kaufmo, collider } = kaufmoApi;
    fixExportedMaterials(room.group);
    // Kaufmo always stands relative to the room's own default spawn, even
    // when `from` below moves the player's actual spawn to the doorway.
    const defaultSpawn = room.spawn;

    const door = openHingedDoor(room.group, DOOR_FRAME_NAME, DOOR_SLAB_NAME, room.spawn, room.collisionMeshes);
    let doorControl = null;
    if (door) {
      const portal = createDoorPortal(room.group, door.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }
      // Shut until Pomni opens it with E (see makeDoorOpenable).
      doorControl = makeDoorOpenable(room, door, { portal });
    }

    room.group.add(kaufmo);
    const paceCenter = placeInMiddleOfRoom(kaufmo, { group: room.group, spawn: defaultSpawn });
    kaufmoApi.pace(paceCenter); // anxious, pacing a tight circle — not just standing there
    kaufmo.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });

    if (playDialogue) {
      const objects = [];
      kaufmo.traverse((child) => {
        if (child.isMesh && child !== collider) objects.push(child);
      });
      room.interactables = [...(room.interactables ?? []), {
        objects,
        anchor: kaufmo, radius: 2.8,
        prompt: () => ((kaufmoStory?.introduced?.() ?? true) && items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => kaufmoStory.talk(kaufmo.getWorldPosition(new THREE.Vector3())),
      }];
    }
    room.interactables = [...(room.interactables ?? []), ...(doorControl ? [doorControl.interactable] : [])];
    room.update = (deltaSeconds, playerPosition) => {
      kaufmoApi.update(deltaSeconds);
      doorControl?.update?.(deltaSeconds, playerPosition);
    };

    return room;
  });
}

/**
 * Stands Kaufmo at the room's actual geometric middle (not pulled toward
 * the spawn/doorway the way the old placement did, which left him tucked
 * in a corner near clutter) — floor height found the same way
 * officePicture.js's findSpotNear does, casting from well above and
 * taking the lowest hit so a ceiling fixture directly overhead can't be
 * mistaken for the floor. Needed room to actually see him pace without
 * the camera or furniture obscuring it.
 * @returns {THREE.Vector3} the point he paces around
 */
function placeInMiddleOfRoom(kaufmo, { group, spawn }) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());

  const raycaster = new THREE.Raycaster(new THREE.Vector3(center.x, box.max.y + 1, center.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = box.max.y - box.min.y + 2;
  const hits = raycaster.intersectObject(group, true);
  const floorHit = hits[hits.length - 1];
  const paceCenter = new THREE.Vector3(center.x, floorHit ? floorHit.point.y : box.min.y, center.z);

  kaufmo.position.copy(paceCenter);
  kaufmo.rotation.y = Math.atan2(spawn.x - paceCenter.x, spawn.z - paceCenter.z);
  return paceCenter;
}

/**
 * Same symptom as the lobby's exported "Plastic" materials: a few of this
 * room's shaders the glTF exporter couldn't translate come out fully
 * metallic + fully rough with no texture, which shows no diffuse colour at
 * all — just reflections — so they render almost black. Most materials
 * were already fixed on the Blender side (see the export script); this is
 * a safety net for whatever that pass didn't cover.
 */
function fixExportedMaterials(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.metalness >= 0.99 && material.roughness >= 0.99 && !material.metalnessMap) {
        material.metalness = 0;
      }
    }
  });
}

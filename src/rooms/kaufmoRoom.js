import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmo } from '../characters/kaufmo.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';
import { pickKaufmoScript } from '../state/level2Items.js';
import { findWallSpot, placeOfficePicture } from '../props/officePicture.js';

const KAUFMO_DISTANCE = 2.2; // how far in front of spawn he stands, pulled in by furniture
const KAUFMO_WALL_GAP = 0.6;

// Level 2's three office photos, all kept in here for now rather than
// scattered round the circus (that's for when Level 2 is built out).
const PICTURES = [
  { id: 'ca1', url: './models/objects/ca1.png' },
  { id: 'ca2', url: './models/objects/ca2.png' },
  { id: 'ca3', url: './models/objects/ca3.png' },
];
const PICTURE_HEIGHT = 1.5;
const PICTURE_SPACING = 2;  // metres between photos, so each is its own find
const PICTURE_KEEP_CLEAR = 1.5; // metres from the door and from Kaufmo

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py, plus Kaufmo himself standing in it.
 * Walking up and pressing E plays the Level 2 opening script, via the
 * `playDialogue` hook main.js passes every room loader (see selectRoom()).
 */
export function loadKaufmoRoom(onProgress, { playDialogue, from, items } = {}) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/kaufmos-room.glb', onProgress),
    loadKaufmo(),
  ]).then(([room, { kaufmo, collider }]) => {
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

    placeInFrontOfSpawn(kaufmo, { group: room.group, spawn: defaultSpawn });
    // Before Kaufmo's in the room, so the wall sweep doesn't hang one on him.
    if (items) placePictures(room, items, defaultSpawn, [kaufmo.position, door?.frameBox.getCenter(new THREE.Vector3())]);
    room.group.add(kaufmo);
    kaufmo.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });

    if (playDialogue) {
      const objects = [];
      kaufmo.traverse((child) => {
        if (child.isMesh && child !== collider) objects.push(child);
      });
      room.interactables = [...(room.interactables ?? []), {
        objects,
        prompt: () => (items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => playDialogue(pickKaufmoScript(items)),
      }];
    }
    if (doorControl) {
      room.interactables = [...(room.interactables ?? []), doorControl.interactable];
      room.update = doorControl.update;
    }

    return room;
  });
}

/**
 * Same technique pomniRoom.js uses for Caine: stand him KAUFMO_DISTANCE
 * along -Z from spawn (pulled in if furniture is closer), drop him onto
 * whatever floor is under that point, and turn him to face the spawn. His
 * room is small and cluttered, so the wall-probe pull-in matters more here
 * than it does in Pomni's room.
 */
function placeInFrontOfSpawn(kaufmo, { group, spawn }) {
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3(0, 0, -1);

  raycaster.set(new THREE.Vector3(spawn.x, spawn.y + 1, spawn.z), forward);
  raycaster.far = KAUFMO_DISTANCE + KAUFMO_WALL_GAP;
  const wallHit = raycaster.intersectObject(group, true)[0];
  const distance = wallHit
    ? Math.max(wallHit.distance - KAUFMO_WALL_GAP, 0.8)
    : KAUFMO_DISTANCE;

  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z).addScaledVector(forward, distance);

  raycaster.set(new THREE.Vector3(position.x, spawn.y + 1, position.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 3;
  const floorHit = raycaster.intersectObject(group, true)[0];
  if (floorHit) position.y = floorHit.point.y;

  kaufmo.position.copy(position);
  kaufmo.rotation.y = Math.atan2(spawn.x - position.x, spawn.z - position.z);
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

/**
 * Hangs each not-yet-collected photo on a different wall, swept round from
 * the spawn at picture height: spots too close to another photo, the door
 * or Kaufmo (`keepClear`) are passed over.
 */
function placePictures(room, items, spawn, keepClear) {
  const origin = new THREE.Vector3(spawn.x, spawn.y + PICTURE_HEIGHT, spawn.z);
  const avoid = keepClear.filter(Boolean).map((point) => new THREE.Vector3(point.x, origin.y, point.z));
  const spots = [];
  for (let i = 0; i < 16 && spots.length < PICTURES.length; i++) {
    const angle = (i / 16) * Math.PI * 2;
    const spot = findWallSpot(room.group, origin, new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), 10);
    if (!spot) continue;
    const flat = new THREE.Vector3(spot.position.x, origin.y, spot.position.z);
    if (avoid.some((point) => point.distanceTo(flat) < PICTURE_KEEP_CLEAR)) continue;
    if (spots.some((other) => other.position.distanceTo(spot.position) < PICTURE_SPACING)) continue;
    spots.push(spot);
  }
  PICTURES.forEach(({ id, url }, i) => {
    const spot = spots[i];
    if (spot) placeOfficePicture(room, items, id, url, spot.position, spot.rotationY);
  });
}

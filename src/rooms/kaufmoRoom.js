import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmo } from '../characters/kaufmo.js';
import { openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';

const KAUFMO_DISTANCE = 2.2; // how far in front of spawn he stands, pulled in by furniture
const KAUFMO_WALL_GAP = 0.6;

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
    if (door) {
      const portal = createDoorPortal(room.group, door.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }
    }

    placeInFrontOfSpawn(kaufmo, { group: room.group, spawn: defaultSpawn });
    room.group.add(kaufmo);
    kaufmo.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });

    if (playDialogue) {
      const objects = [];
      kaufmo.traverse((child) => {
        if (child.isMesh && child !== collider) objects.push(child);
      });
      room.interactables = [{
        objects,
        prompt: () => (items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => playDialogue(pickKaufmoScript(items)),
      }];
    }

    return room;
  });
}

/**
 * Which Level 2 script to play when Pomni interacts with Kaufmo, driven
 * entirely by the shared item state (main.js's itemState) rather than any
 * room-local flag:
 *   - holding one or more pictures: hands them all over at once and plays
 *     the reaction for however many have now been presented in total
 *     (1-3) — not necessarily the opening script first, since a player
 *     who collects all three before ever talking to him should still get
 *     the big "three" reveal, not a replay of the intro.
 *   - nothing held, nothing presented yet: the opening script.
 *   - nothing held, some presented: a short idle line.
 *   - nothing held, all three presented: a short "working on it" line.
 */
function pickKaufmoScript(items) {
  if (!items) return 'level2Opening';
  if (items.heldCount() > 0) {
    const total = items.presentHeld();
    return `level2HandIn${total}`;
  }
  if (items.totalPresented() >= 3) return 'level2Complete';
  if (items.totalPresented() > 0) return 'level2Idle';
  return 'level2Opening';
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

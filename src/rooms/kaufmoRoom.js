import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmoTalk } from '../characters/kaufmoTalk.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';

// Talking to Kaufmo is shot from above the bed's near edge, looking across
// the room: the two of them a conversational step apart in the middle of
// the floor (where the rocking horse stood), Kaufmo screen right, Pomni
// screen left, level with him. Positions are this export's (x
// across, z toward the bed), y above the floor. They mostly face each
// other, turned only slightly toward the camera (TALK_TURN_TO_CAMERA: 0 =
// straight at the other, 1 = straight at the camera); much more read as
// playing to an audience. See talkShot / talkToKaufmo.
const TALK_CAMERA = { x: 0.4, y: 2.5, z: 2.4 };
const TALK_KAUFMO = { x: 0.75, z: -0.95 };
const TALK_POMNI = { x: -0.6, z: -0.93 };
const TALK_TURN_TO_CAMERA = 0.2;
const TALK_AIM_HEIGHT = 1.05;
// Pomni's head turns the rest of the way to him and tilts up to this point
// above his feet, just over his face: he's a head taller than her.
const TALK_POMNI_LOOK_HEIGHT = 1.75;

// The rocking horse in the middle of the floor was in the way, of walking
// round and of the conversation shot, so it's taken out of the room. Its
// parts have generic export names (Plane, Cylinder), so they're matched by
// name and by where they stand.
const ROCKING_HORSE_PARTS = new Set(['Cylinder', 'Plane', 'Plane007', 'Plane009', 'Plane011', 'Plane014', 'Vert001']);
const ROCKING_HORSE_AREA = new THREE.Box3(new THREE.Vector3(-1.5, -0.5, -3.6), new THREE.Vector3(0.9, 2.5, -1.6));  // aimed at about their chests, between them

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
    loadKaufmoTalk(),
  ]).then(([room, kaufmoApi]) => {
    const { kaufmo, collider } = kaufmoApi;
    fixExportedMaterials(room.group);
    removeRockingHorse(room);
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
    placeInMiddleOfRoom(kaufmo, { group: room.group, spawn: defaultSpawn });
    kaufmo.updateMatrixWorld(true);
    // Dynamic: he's moved to his mark for a conversation (see talkShot), and
    // main.js keeps a dynamic entry's box wherever he is.
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider), dynamic: true });
    room.talkShot = talkShot(kaufmo.position);

    if (playDialogue) {
      // His collider counts as him too: main.js's line-of-sight check skips
      // an interactable's own objects, and without it his own cylinder
      // blocked the view of him, so the prompt only came up when the
      // crosshair happened to land on his mesh. It's also a bigger, easier
      // target for the crosshair than his thin limbs.
      const objects = [collider];
      kaufmo.traverse((child) => {
        if (child.isMesh && child !== collider) objects.push(child);
      });
      room.interactables = [...(room.interactables ?? []), {
        objects,
        anchor: kaufmo, radius: 3.2,
        prompt: () => ((kaufmoStory?.introduced?.() ?? true) && items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => kaufmoStory.talk(kaufmoApi),
      }];
    }
    if (doorControl) {
      room.interactables = [...(room.interactables ?? []), doorControl.interactable];
    }
    room.update = (deltaSeconds, playerPosition) => {
      kaufmoApi.update(deltaSeconds);
      doorControl?.update?.(deltaSeconds, playerPosition);
    };

    // Exposed so a caller outside this closure (main.js's Level 3 dev-jump
    // button) can trigger the real talkToKaufmo(kaufmoApi, ...) itself,
    // the same call kaufmoStory.talk above already makes from in-room E.
    room.kaufmoApi = kaufmoApi;

    return room;
  });
}

function removeRockingHorse(room) {
  room.group.updateMatrixWorld(true);
  const parts = [];
  room.group.traverse((child) => {
    if (child.isMesh && ROCKING_HORSE_PARTS.has(child.name)
      && ROCKING_HORSE_AREA.containsBox(new THREE.Box3().setFromObject(child))) parts.push(child);
  });
  for (const part of parts) part.removeFromParent();
  room.collisionMeshes = room.collisionMeshes.filter((entry) => !parts.includes(entry.mesh));
}

/**
 * The staging for talking to Kaufmo (see TALK_CAMERA): where he and Pomni
 * stand, which way each faces, and the camera's position and aim. main.js
 * moves them onto their marks when the conversation starts.
 */
function talkShot(at) {
  const floorY = at.y;
  const camera = new THREE.Vector3(TALK_CAMERA.x, floorY + TALK_CAMERA.y, TALK_CAMERA.z);
  const kaufmo = new THREE.Vector3(TALK_KAUFMO.x, floorY, TALK_KAUFMO.z);
  const pomni = new THREE.Vector3(TALK_POMNI.x, floorY, TALK_POMNI.z);
  const flatCamera = camera.clone().setY(floorY);
  return {
    camera,
    target: kaufmo.clone().add(pomni).multiplyScalar(0.5).setY(floorY + TALK_AIM_HEIGHT),
    kaufmo: { x: kaufmo.x, z: kaufmo.z },
    pomni: { x: pomni.x, z: pomni.z },
    // What each turns to face: the other, swung partly toward the camera.
    kaufmoLooksAt: pomni.clone().lerp(flatCamera, TALK_TURN_TO_CAMERA),
    pomniLooksAt: kaufmo.clone().lerp(flatCamera, TALK_TURN_TO_CAMERA),
    pomniHeadAt: kaufmo.clone().setY(floorY + TALK_POMNI_LOOK_HEIGHT),
  };
}

/**
 * Stands Kaufmo at the room's actual geometric middle (not pulled toward
 * the spawn/doorway the way the old placement did, which left him tucked
 * in a corner near clutter) — floor height found the same way
 * officePicture.js's findSpotNear does, casting from well above and
 * taking the lowest hit so a ceiling fixture directly overhead can't be
 * mistaken for the floor.
 */
function placeInMiddleOfRoom(kaufmo, { group, spawn }) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());

  const raycaster = new THREE.Raycaster(new THREE.Vector3(center.x, box.max.y + 1, center.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = box.max.y - box.min.y + 2;
  const hits = raycaster.intersectObject(group, true);
  const floorHit = hits[hits.length - 1];
  const position = new THREE.Vector3(center.x, floorHit ? floorHit.point.y : box.min.y, center.z);

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

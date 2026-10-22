import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmo } from '../characters/kaufmo.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';
import { pickKaufmoScript } from '../state/level2Items.js';

const KAUFMO_DISTANCE = 2.2; // how far in front of spawn he stands, pulled in by furniture
const KAUFMO_WALL_GAP = 0.6;

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';

// Shown once the payoff (level2Payoff) has actually played through, not
// just been triggered — same card Level 1 pauses on between missions
// (game.showLevelComplete), just driven locally here since Level 2 isn't
// staged as its own mission yet. There's nowhere to continue into yet
// (Level 3 isn't linked up), so it says so rather than implying there is.
const LEVEL2_COMPLETE_TITLE = 'Level 2 Complete';
const LEVEL2_COMPLETE_SUBTITLE = "Three photos, one real room — and a door that isn't what it says it is. "
  + "Kaufmo's not finished. Neither is she. More coming soon — thanks for playing!";

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py, plus Kaufmo himself standing in it.
 * Walking up and pressing E plays the Level 2 opening script, via the
 * `playDialogue` hook main.js passes every room loader (see selectRoom()).
 */
export function loadKaufmoRoom(onProgress, {
  playDialogue, from, items, endLevel, objectives, showLevelComplete, playChime, kaufmoStory,
} = {}) {
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
        anchor: kaufmo, radius: 2.8,
        prompt: () => ((kaufmoStory?.introduced?.() ?? true) && items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => {
          if (kaufmoStory) return kaufmoStory.talk(kaufmo.getWorldPosition(new THREE.Vector3()));
          const key = pickKaufmoScript(items);
          // The payoff keeps playing on every revisit after the first (see
          // pickKaufmoScript below) — good, that's the lore staying
          // readable — but it should only actually end the level once.
          // items.isDone() tracks that across room reloads, not just this
          // interactable's own closure.
          //
          // The stall line (level2Complete) gives no sign a second visit
          // unlocks the actual payoff — nothing else in the room changes,
          // so a player has no reason to come back on their own. Raising
          // an objective here, cleared once the payoff's actually heard,
          // is that sign.
          const onComplete = key === 'level2Complete'
            ? () => objectives?.activate('check-kaufmo')
            : key === 'level2Payoff' && !items?.isDone()
              ? async () => {
                objectives?.complete('check-kaufmo');
                items.markDone();
                if (showLevelComplete) await showLevelComplete(LEVEL2_COMPLETE_TITLE, LEVEL2_COMPLETE_SUBTITLE);
                endLevel?.(LEVEL2_COMPLETE_TITLE, LEVEL2_COMPLETE_SUBTITLE);
              }
              : undefined;
          if (key.startsWith('level2HandIn')) playChime?.('handIn');
          playDialogue(key, onComplete ? { onComplete } : undefined);
        },
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

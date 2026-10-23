import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { addMirrorReflections } from './mirrors.js';
import { createDoorConnection } from './portals.js';
import { createBedroomLighting } from './bedroomLighting.js';
import { loadPomniOpening } from '../cinematics/pomniOpening.js';
import { loadRagatha } from '../characters/ragatha.js';
import { loadDormHallPreview } from './dormHallPreview.js';
import { loadJax } from '../characters/jax.js';
import { createBedroomDoorHinge } from '../cinematics/bedroomDoor.js';
import { createDoorwayAperture } from '../cinematics/doorwayAperture.js';

// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
export function loadPomniRoom(onProgress, { from, travel, openingMode,
  hallPreview = typeof window !== 'undefined' } = {}) {
  return loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress).then(async (room) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    addMirrorReflections(room.group, room.spawn);

    room.lighting = createBedroomLighting(room);
    room.group.userData.bedroomLighting = room.lighting;
    room.update = room.lighting.update;
    const exit = createDoorConnection(room, {
      doorName: 'Plane_1', detailNames: ['Door_Frame024', 'Plane_2'],
      to: 'dorm', prompt: 'Exit to Hallway', travel,
    });
    exit.interactable.bedroomExit = true; // the controls tutorial's "Press E" target
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
        room.hallLink = createHallLink(room, preview);
        room.bedroomDoor = createBedroomDoor(room, preview);
        room.group.userData.bedroomDoor = room.bedroomDoor;
        room.openDoorway = () => openDoorway(room);
        // E opens and closes her door like the hall's; with it open she
        // just walks out (main.js swaps the hall in).
        const door = room.bedroomDoor;
        exit.interactable.prompt = () => (door.isOpen ? 'Close door' : 'Open door');
        exit.interactable.interact = () => (door.isOpen ? door.close() : door.open());
        const lightingUpdate = room.update;
        room.update = (deltaSeconds, playerPosition) => {
          lightingUpdate?.(deltaSeconds, playerPosition);
          door.update(deltaSeconds);
        };
      } catch (error) {
        room.group.userData.dormHallPreviewError = String(error.message ?? error);
        console.warn('Hall preview unavailable; retaining the temporary vestibule.', error);
      }
    }
    if (openingMode === 'play' && room.group.userData.dormHallPreview) {
      try {
        const cast = await loadJax();
        room.group.add(cast.jax);
        room.group.userData.jaxCast = cast;
      } catch (error) {
        console.warn('Jax model unavailable; retaining the morning background text beat.', error);
      }
    }
    return room;
  });
}

// How far past the doorway Pomni can step before main.js swaps her into
// the real Dorm Hall (the preview beyond it has no floor of its own).
const HALL_LINK_REACH = 0.6;

/**
 * The preview is the real Dorm Hall, placed exactly where it sits outside
 * this door — so with the door open Pomni can just walk out: main.js
 * swaps the real hall in as she crosses the doorway, carrying her position
 * and facing over through `toHall` (this room's coordinates to the hall's).
 * The room's bounds are widened through the doorway so she can reach it.
 */
function createHallLink(room, preview) {
  room.group.updateMatrixWorld(true);
  const frameBox = new THREE.Box3().setFromObject(room.group.getObjectByName('Door_Frame024'));
  const size = frameBox.getSize(new THREE.Vector3());
  const centre = frameBox.getCenter(new THREE.Vector3());
  const axis = size.x < size.z ? 'x' : 'z';
  const wide = axis === 'x' ? 'z' : 'x';
  const outward = room.spawn[axis] < centre[axis] ? 1 : -1;

  const reach = centre.clone();
  reach[axis] += outward * (HALL_LINK_REACH + 0.4); // plus main.js's WALL_MARGIN
  room.bounds = room.bounds.clone().expandByPoint(reach);

  const toHall = preview.group.matrix.clone().invert();
  const out = new THREE.Vector3();
  out[axis] = outward;
  return {
    toHall,
    // Out through the doorway, in the hall's coordinates.
    outward: out.transformDirection(toHall),
    /** How far a point is past the doorway, outward. */
    depthPast: (point) => (point[axis] - centre[axis]) * outward,
    // Rotating the world by the preview's turn adds it to every facing.
    yawToHall: -preview.group.rotation.y,
    doorway: centre,
    // Her own door leaf. Seen from the hall it's hidden: the hall's copy of
    // this door swings into the same doorway, and both would show.
    door: room.group.getObjectByName('Door_Slab024'),
    isOpen: () => preview.group.visible,
    /** Whether a point has stepped out through the doorway. */
    crossed: (point) => (point[axis] - centre[axis]) * outward > 0
      && Math.abs(point[wide] - centre[wide]) < size[wide] / 2,
  };
}

const DOOR_SWING_SECONDS = 0.9;

/**
 * Her door, on its real hinge, opened and closed with E like the hall's.
 * Open, the wall behind the decorative door is cut through and the hall
 * shows beyond it; once it's swung fully shut the hall is hidden again.
 * Ragatha's entrance drives the same leaf through hold().
 */
function createBedroomDoor(room, preview) {
  room.group.updateMatrixWorld(true);
  const panelBox = new THREE.Box3().setFromObject(room.group.getObjectByName('Plane_1'));
  const aperture = createDoorwayAperture(room, panelBox);
  const hinge = createBedroomDoorHinge({ group: room.group, collisionMeshes: room.collisionMeshes, insidePoint: room.spawn });
  let progress = 0, target = 0, showHall = true;
  function set(value, ease = true) {
    progress = THREE.MathUtils.clamp(value, 0, 1);
    hinge.setOpenFraction(ease ? THREE.MathUtils.smootherstep(progress, 0, 1) : progress);
    if (progress > 0) aperture.setEnabled(true);
    if (showHall) preview.setVisible(progress > 0);
  }
  return {
    get isOpen() { return target > 0; },
    open({ immediate = false, hall = true } = {}) {
      target = 1; showHall = hall;
      if (immediate) set(1);
      showHall = true;
    },
    close({ immediate = false } = {}) { target = 0; if (immediate) set(0); },
    /** Puts the leaf straight at `value` (0 shut, 1 open), for a cinematic that eases its own swing. */
    hold(value) { target = value; set(value, false); },
    update(deltaSeconds) {
      if (progress === target) return;
      const step = deltaSeconds / DOOR_SWING_SECONDS;
      set(target > progress ? Math.min(target, progress + step) : Math.max(target, progress - step));
    },
  };
}

/**
 * Opens her door straight away, for Pomni walking in from the Dorm Hall
 * (main.js's walkIntoPomniRoom), the hall's copy of it standing open. The
 * hall preview beyond is shown separately, once she's actually in here.
 */
function openDoorway(room) {
  room.bedroomDoor.open({ immediate: true, hall: false });
}

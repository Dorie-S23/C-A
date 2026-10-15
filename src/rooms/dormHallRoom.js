import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { createCurtainPortal, createDoorPortal } from './portals.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { attachRoomBehindDoor, sill } from './connectRooms.js';
import { loadPomniRoom } from './pomniRoom.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';
import { ICONS } from '../ui/portraitIcons.js';

// Exported from "Dorm Hall V7.blend" by tools/blender/export_dorm_hall_v7.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
const DORM_HALL_URL = './models/world/dorm-hall-v7.glb';

// Just inside the main hallway, in front of the curtained entrance arch,
// looking down the hall (-Z). The three hallways are far apart, so the
// loader's centroid guess would land in the empty space between them.
const SPAWN = { x: 0, z: -1.5 };

// The entrance arch's curtain: it opens toward -Z (into the hallway) and
// leads back out to the Circus Lobby.
const ENTRANCE_CURTAIN = 'Plane036';

// The bedroom doors that lead somewhere (shut until Pomni opens them — see
// makeDoorOpenable): each character's own door, the one
// with their icon on it, so the hallway, its minimap and the story (Level 1
// knocks on Ribbit's door) all agree. Found by matching each icon decal in
// the hall to its nearest door. The glTF export carries these as "Door
// Frame.068" etc; three.js's GLTFLoader sanitizes node names (spaces go,
// the disambiguating dot is stripped), so they come out as below. All three
// are on the main hallway's left wall.
const ROOM_DOORS = [
  { frame: 'Door_Frame068', slab: 'Door_Slab068', icon: 'Pomni', to: 'pomni' },   // z ≈ -40
  { frame: 'Door_Frame087', slab: 'Door_Slab087', icon: 'Kaufmo', to: 'kaufmo' }, // z ≈ -95
  { frame: 'Door_Frame089', slab: 'Door_Slab089', icon: 'Ribbit', to: 'ribbit' }, // z ≈ -110
];
// The main hallway runs along -Z down x = 0. Doors swing into it, and
// arrivals stand in it, straight out from the door: aiming at the hall's
// spawn instead (far behind, back at the entrance) would point almost
// along the wall for doors this far down.
const HALL_CENTRE_X = 0;

// Door icon decals repainted with the character's dialogue portrait (same
// ~1.19 aspect as the decal quads), so the door matches who you talk to.
const DIALOGUE_ICON_DOORS = ['Kaufmo', 'Ribbit'];

// Rooms physically built onto the hall behind their door (see
// connectRooms.js) instead of reached through a portal and a loading
// screen: open the door and the room is right there.
const CONNECTED_ROOMS = {
  pomni: loadPomniRoom,
};
// How close (metres from the doorway) a connected room keeps its mirrors
// reflecting and its shadows updating while Pomni's out in the hall with
// the door open. Each of those re-renders the whole scene, hall and all,
// and from further off the room is barely a few pixels.
const VIEW_RANGE = 15;
const ARRIVAL_DISTANCE = 1.8; // matches portals.js's door arrivals

const PICTURE_ID = 'ca3';
const PICTURE_URL = './models/objects/ca3.png';
const PICTURE_HEIGHT = 1.5;
// On the floor below one of the hallway's own hung photos (on the right
// wall by the first door), propped against the wall as if it fell from the
// wall of frames — facing out into the hall so it reads as a photo, not
// the dark back of a frame.
const PICTURE_ANCHOR = 'Short_Photo002';
const PICTURE_OFFSET = new THREE.Vector3(-0.3, 0, 0); // just off the wall, into the hall
const PICTURE_LEAN = 0.2; // radians, top resting back against the wall

export function loadDormHallRoom(onProgress, { from, items } = {}) {
  const connected = Object.entries(CONNECTED_ROOMS).map(([key, load]) =>
    load(null, { items, embedded: true }).then((guest) => [key, guest]));
  return Promise.all([
    loadRoomModel(DORM_HALL_URL, onProgress, { spawnAt: SPAWN }),
    Promise.all(connected),
  ]).then(([room, guests]) => {
    const guestRooms = Object.fromEntries(guests);
    // The door handles and light fittings are real metals.
    room.environment = true;
    useDialogueIcons(room.group);
    // Placed before `from` below can move room.spawn to a different
    // arrival point — the picture always hangs near the hall's own
    // default entrance, regardless of which door the player walked in.
    const defaultSpawn = room.spawn;

    if (items) {
      const origin = new THREE.Vector3(defaultSpawn.x, defaultSpawn.y + PICTURE_HEIGHT, defaultSpawn.z);
      const spot = findSpotNear(room.group, PICTURE_ANCHOR, PICTURE_OFFSET)
        ?? findWallSpot(room.group, origin, new THREE.Vector3(1, 0, 0), 8)
        ?? findWallSpot(room.group, origin, new THREE.Vector3(-1, 0, 0), 8);
      if (spot) {
        // Face the hall's centre line (x = 0), away from the wall it leans on.
        const facing = Math.atan2(HALL_CENTRE_X - spot.position.x, 0);
        placeOfficePicture(room, items, PICTURE_ID, PICTURE_URL, spot.position, facing, { tiltBack: PICTURE_LEAN });
      }
    }

    const entrance = createCurtainPortal(room.group, ENTRANCE_CURTAIN, -1, 'tadc');
    const portals = entrance ? [entrance] : [];

    room.hallDoors = {};
    room.mapMarkers = [];
    const joins = [];
    let arrival = null;
    for (const { frame, slab, icon, to } of ROOM_DOORS) {
      const frameObject = room.group.getObjectByName(frame);
      if (!frameObject) continue;
      const centre = new THREE.Box3().setFromObject(frameObject).getCenter(new THREE.Vector3());
      const inFront = new THREE.Vector3(HALL_CENTRE_X, centre.y, centre.z);
      const door = openHingedDoor(room.group, frame, slab, inFront, room.collisionMeshes);
      if (!door) continue;
      const guest = guestRooms[to];
      const doorway = guest?.doorway;
      // A connected room needs no portal: the doorway just leads into it.
      const portal = doorway ? null : createDoorPortal(room.group, door.frameBox, inFront, to);
      if (portal) portals.push(portal);
      // Shut until Pomni walks up and opens it; the character's icon swings with it.
      const control = makeDoorOpenable(room, door, { portal, attach: [room.group.getObjectByName(icon)] });
      room.hallDoors[to] = { portal, control, shut: () => control.lock(), open: () => control.open() };

      if (doorway) {
        const intoHall = new THREE.Vector3(Math.sign(HALL_CENTRE_X - centre.x), 0, 0);
        joins.push({ guest, control, hostDoor: { frameBox: door.frameBox, intoRoom: intoHall }, doorway });
        room.mapMarkers.push({ to, box: door.frameBox });
        // Back from the room played on its own (the room picker / a
        // dialogue preview): out in the hall by its door, which is open.
        if (from === to) {
          arrival = sill(door.frameBox).addScaledVector(intoHall, ARRIVAL_DISTANCE);
          // Facing on out into the hall, the way she was walking (yaw 0
          // faces -Z, so facing direction d is atan2(-d.x, -d.z)).
          room.spawnFacing = Math.atan2(-intoHall.x, -intoHall.z);
          control.open({ immediate: true });
        }
      }
    }
    const doorControls = Object.values(room.hallDoors).map((d) => d.control);
    room.interactables = [...(room.interactables ?? []), ...doorControls.map((c) => c.interactable)];
    room.update = (deltaSeconds) => {
      for (const control of doorControls) control.update(deltaSeconds);
    };

    for (const { guest, control, hostDoor, doorway } of joins) {
      const { bounds } = attachRoomBehindDoor(room, guest, hostDoor, doorway);
      onlyRenderWhenSeen(room, guest, control, bounds, sill(hostDoor.frameBox));
    }

    room.portals = portals;
    if (arrival) {
      room.spawn = arrival;
    } else {
      // Arrive at whichever portal leads back to wherever the player came from.
      const portalArrival = portals.find((portal) => portal.to === from);
      if (portalArrival) {
        room.spawn = portalArrival.arrival.spawn;
        room.spawnFacing = portalArrival.arrival.facing;
      }
    }
    return room;
  });
}

/**
 * Mirrors and shadow-casting lights are the expensive parts of a room:
 * each re-renders the whole scene (hall and all) every frame. A connected
 * room only runs them while someone could see it — Pomni is inside, or
 * near its open door. Shadows are frozen rather than switched off, since
 * toggling castShadow would recompile every material mid-walk.
 *
 * Since they start off, their shaders would otherwise first be built the
 * moment the door opens — a mirror renders into a texture, which needs its
 * own build of every material in the scene, freezing the game for seconds.
 * room.warmUp (called by main.js under the loading screen) does it then.
 */
function onlyRenderWhenSeen(room, guest, control, roomBounds, doorway) {
  const reflectors = guest.reflectors ?? [];
  const shadowLights = [];
  guest.group.traverse((child) => { if (child.isLight && child.castShadow) shadowLights.push(child); });
  if (reflectors.length === 0 && shadowLights.length === 0) return;

  const show = (seen) => {
    for (const reflector of reflectors) reflector.visible = seen;
    for (const light of shadowLights) light.shadow.autoUpdate = seen;
  };

  const update = room.update;
  room.update = (deltaSeconds, playerPosition) => {
    update?.(deltaSeconds, playerPosition);
    if (!playerPosition) return;
    show(roomBounds.containsPoint(playerPosition)
      || (control.isOpen && playerPosition.distanceTo(doorway) < VIEW_RANGE));
  };

  const warmUp = room.warmUp;
  room.warmUp = (renderer, scene, camera) => {
    warmUp?.(renderer, scene, camera);
    show(true);
    // Draws the shadow maps (and compiles their depth shaders).
    renderer.render(scene, camera);
    // Every material, as drawn into a mirror's texture. Building the
    // shaders isn't enough: the graphics driver only finishes each one the
    // first time something is actually drawn with it into that kind of
    // texture, so draw the whole scene into one — nothing culled, so
    // whatever the mirror later shows has been drawn once.
    const culled = [];
    scene.traverse((child) => {
      if (child.frustumCulled) {
        culled.push(child);
        child.frustumCulled = false;
      }
    });
    const target = renderer.getRenderTarget();
    for (const reflector of reflectors) {
      renderer.setRenderTarget(reflector.getRenderTarget());
      renderer.compile(scene, camera);
      renderer.render(scene, camera);
    }
    renderer.setRenderTarget(target);
    for (const child of culled) child.frustumCulled = true;
    show(false);
  };
}

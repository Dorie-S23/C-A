import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { createCurtainPortal, createDoorPortal, createDoorConnection } from './portals.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { findWallSpot, findSpotNear, placeOfficePicture } from '../props/officePicture.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';

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

export function loadDormHallRoom(onProgress, { from, items, travel, caineStory } = {}) {
  return loadRoomModel(DORM_HALL_URL, onProgress, { spawnAt: SPAWN }).then(async (room) => {
    // The door handles and light fittings are real metals.
    room.environment = true;
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
    for (const { frame, slab, icon, to } of ROOM_DOORS) {
      if (to === 'pomni') continue; // Existing bedroom E connection owns this door.
      const frameObject = room.group.getObjectByName(frame);
      if (!frameObject) continue;
      const centre = new THREE.Box3().setFromObject(frameObject).getCenter(new THREE.Vector3());
      const inFront = new THREE.Vector3(HALL_CENTRE_X, centre.y, centre.z);
      const door = openHingedDoor(room.group, frame, slab, inFront, room.collisionMeshes);
      if (!door) continue;
      const portal = createDoorPortal(room.group, door.frameBox, inFront, to);
      portals.push(portal);
      // Shut until Pomni walks up and opens it; the character's icon swings with it.
      const control = makeDoorOpenable(room, door, { portal, attach: [room.group.getObjectByName(icon)] });
      room.hallDoors[to] = { portal, control, shut: () => control.lock(), open: () => control.open() };
    }
    const doorControls = Object.values(room.hallDoors).map((d) => d.control);
    room.interactables = [...(room.interactables ?? []), ...doorControls.map((c) => c.interactable)];
    room.update = (deltaSeconds) => {
      for (const control of doorControls) control.update(deltaSeconds);
    };

    room.portals = portals;
    // Arrive at whichever portal leads back to wherever the player came from.
    const arrival = portals.find((portal) => portal.to === from);
    if (arrival) {
      room.spawn = arrival.arrival.spawn;
      room.spawnFacing = arrival.arrival.facing;
    }

    const position = cainePositionByPomniDoor({ ...room, spawn: defaultSpawn });
    const { caine, collider } = await loadCaine();
    caine.position.copy(position);
    // Greet Pomni approaching from the hallway entrance.
    caine.rotation.y = Math.atan2(defaultSpawn.x - position.x, defaultSpawn.z - position.z);
    room.group.add(caine);
    caine.updateMatrixWorld(true);
    // main.js invokes mesh.dispose() on room teardown, including stale loads.
    caine.traverse((child) => {
      if (child.isSkinnedMesh) child.dispose = () => child.skeleton.dispose();
    });
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    const caineIdle = createCaineIdle(caine);
    room.update = (deltaSeconds) => {
      caineIdle(deltaSeconds);
      for (const control of doorControls) control.update(deltaSeconds);
    };
    // Configure arrival only after Caine's placement, so entering from the
    // bedroom does not change his established position or orientation.
    const bedroom = createDoorConnection(room, {
      doorName: 'Plane_36', detailNames: ['Door_Frame068', 'Plane_37', 'Pomni'],
      to: 'pomni', prompt: "Enter Pomni's Room", travel,
    });
    room.interactables = [bedroom.interactable, ...(room.interactables ?? [])];
    if (caineStory) {
      const objects = [];
      // Include the existing invisible collider: it is a stable ray target
      // and must also be ignored by this NPC's own line-of-sight check.
      caine.traverse(child => { if (child.isMesh) objects.push(child); });
      room.interactables.push({
        objects, anchor: caine, radius: 2.5,
        enabled: () => caineStory.enabled(),
        prompt: () => 'Talk to Caine',
        interact: () => caineStory.talk(caine.getWorldPosition(new THREE.Vector3())),
      });
    }
    if (from === 'pomni') {
      room.spawn = bedroom.arrival.spawn;
      room.spawnFacing = bedroom.arrival.facing;
    }
    return room;
  });
}

/** Position from the exported Pomni door icon, not guessed world coordinates. */
function cainePositionByPomniDoor({ group, collisionMeshes, spawn }) {
  const doorIcon = group.getObjectByName('Pomni');
  if (!doorIcon?.isMesh) throw new Error('Dorm Hall is missing Pomni\'s door icon');
  group.updateMatrixWorld(true);
  const position = new THREE.Box3().setFromObject(doorIcon).getCenter(new THREE.Vector3());
  const intoHall = new THREE.Vector3()
    .fromBufferAttribute(doorIcon.geometry.attributes.normal, 0)
    .transformDirection(doorIcon.matrixWorld).setY(0).normalize();
  const towardEntrance = new THREE.Vector3().subVectors(spawn, position).setY(0);
  if (intoHall.dot(towardEntrance) < 0) intoHall.negate();
  const alongWall = towardEntrance.addScaledVector(intoHall, -towardEntrance.dot(intoHall)).normalize();
  // Clear the door opening and leave the middle of the ~7.2 m hall unobstructed.
  position.addScaledVector(intoHall, 1.4).addScaledVector(alongWall, 1.7);

  const floorRay = new THREE.Raycaster(
    position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, -1, 0), 0, 5,
  );
  const floorHit = floorRay.intersectObjects(collisionMeshes.map(({ mesh }) => mesh), false)[0];
  if (!floorHit) throw new Error('No floor beside Pomni\'s Dorm Hall door');
  position.y = floorHit.point.y;
  return position;
}

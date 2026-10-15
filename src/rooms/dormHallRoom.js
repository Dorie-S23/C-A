import { loadRoomModel } from './loadRoomModel.js';
import { createCurtainPortal, createDoorPortal } from './portals.js';
import { openHingedDoor } from './doors.js';

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

// Three of the hallway's many numbered bedroom doors (it has dozens —
// .014-.145 — lining both sides of a long corridor running away from
// spawn), picked for being nearest to it (~8-17m down the hall) rather
// than for anything to do with the rooms they now lead to. The glTF
// export carries these as "Door Frame.014" etc; three.js's GLTFLoader
// sanitizes node names (spaces go, the disambiguating dot is stripped),
// so they come out as below.
const ROOM_DOORS = [
  { frame: 'Door_Frame014', slab: 'Door_Slab014', to: 'pomni' },
  { frame: 'Door_Frame028', slab: 'Door_Slab028', to: 'kaufmo' },
  { frame: 'Door_Frame015', slab: 'Door_Slab015', to: 'ribbit' },
];

export function loadDormHallRoom(onProgress, { from } = {}) {
  return loadRoomModel(DORM_HALL_URL, onProgress, { spawnAt: SPAWN }).then((room) => {
    // The door handles and light fittings are real metals.
    room.environment = true;

    const entrance = createCurtainPortal(room.group, ENTRANCE_CURTAIN, -1, 'tadc');
    const portals = entrance ? [entrance] : [];

    for (const { frame, slab, to } of ROOM_DOORS) {
      const door = openHingedDoor(room.group, frame, slab, room.spawn, room.collisionMeshes);
      if (!door) continue;
      portals.push(createDoorPortal(room.group, door.frameBox, room.spawn, to));
    }

    room.portals = portals;
    // Arrive at whichever portal leads back to wherever the player came from.
    const arrival = portals.find((portal) => portal.to === from);
    if (arrival) {
      room.spawn = arrival.arrival.spawn;
      room.spawnFacing = arrival.arrival.facing;
    }
    return room;
  });
}

import { loadRoomModel } from './loadRoomModel.js';
import { createCurtainPortal } from './portals.js';

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

export function loadDormHallRoom(onProgress, { from } = {}) {
  return loadRoomModel(DORM_HALL_URL, onProgress, { spawnAt: SPAWN }).then((room) => {
    // The door handles and light fittings are real metals.
    room.environment = true;

    const entrance = createCurtainPortal(room.group, ENTRANCE_CURTAIN, -1, 'tadc');
    if (entrance) {
      room.portals = [entrance];
      if (from === 'tadc') {
        room.spawn = entrance.arrival.spawn;
        room.spawnFacing = entrance.arrival.facing;
      }
    }
    return room;
  });
}

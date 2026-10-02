import { loadRoomModel } from './loadRoomModel.js';
import { setupLobbyDoors } from './lobbyDoors.js';

export function loadTadcRoom(onProgress) {
  return loadRoomModel('./models/world/Circus%20Lobby%20V10.glb', onProgress).then((room) => {
    const doors = setupLobbyDoors(room.group, room.spawn, room.collisionMeshes);
    room.interactables = doors.interactables;
    room.update = doors.update;
    return room;
  });
}

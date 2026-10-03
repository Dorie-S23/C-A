import { loadRoomModel } from './loadRoomModel.js';
import { setupLobbyDoors } from './lobbyDoors.js';

export function loadTadcRoom(onProgress) {
  return loadRoomModel('./models/world/Circus%20Lobby%20V10.glb', onProgress).then((room) => {
    fixExportedPlastics(room.group);
    const doors = setupLobbyDoors(room.group, room.spawn, room.collisionMeshes);
    room.interactables = doors.interactables;
    room.update = doors.update;
    // The lobby's real metals (railings, stage trim) need something to reflect.
    room.environment = true;
    return room;
  });
}

/**
 * Most of the lobby (doors, buildings, props) uses vertex-coloured
 * "Plastic" materials whose Blender shaders the glTF exporter couldn't
 * translate, so it wrote them out as fully metallic and fully rough. A
 * metal shows no diffuse colour at all — only reflections — so they
 * rendered nearly black. Restore them to plain non-metals so their vertex
 * colours show.
 */
function fixExportedPlastics(group) {
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

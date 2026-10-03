import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadRoomModel } from './loadRoomModel.js';
import { setupLobbyDoors } from './lobbyDoors.js';

// The castle's brick walls (arched windows, battlements), taken from the
// Sketchfab "The Digital Circus" model. The lobby's own export only has a
// single unrepeated segment of each, with the brick texture missing.
const CASTLE_WALLS_URL = './models/world/castle-brick-walls.glb';
const CASTLE_WALL_MATERIALS = /^(RandomCol|RandomCol3)$/;
// The lobby's rainbow arches are flat and stand 0.1 m behind the front of
// the Sketchfab wall (whose own arches are thicker), so push the wall back.
const CASTLE_WALL_SETBACK = 0.2;

export function loadTadcRoom(onProgress) {
  return Promise.all([
    loadRoomModel('./models/world/Circus%20Lobby%20V10%20colored.glb', onProgress),
    new GLTFLoader().loadAsync(CASTLE_WALLS_URL),
  ]).then(([room, castleWalls]) => {
    replaceCastleWalls(room, castleWalls.scene);
    fixExportedPlastics(room.group);
    const doors = setupLobbyDoors(room.group, room.spawn, room.collisionMeshes);
    room.interactables = doors.interactables;
    room.update = doors.update;
    // The lobby's real metals (railings, stage trim) need something to reflect.
    room.environment = true;
    return room;
  });
}

/** Swaps the lobby's stub castle walls for the full ones, collision included. */
function replaceCastleWalls(room, walls) {
  const stubs = [];
  room.group.traverse((child) => {
    if (child.isMesh && CASTLE_WALL_MATERIALS.test(child.material.name)) stubs.push(child);
  });
  for (const stub of stubs) stub.removeFromParent();
  room.collisionMeshes = room.collisionMeshes.filter((entry) => !stubs.includes(entry.mesh));

  walls.position.z += CASTLE_WALL_SETBACK;
  room.group.add(walls);
  walls.updateMatrixWorld(true);
  walls.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = true;
    child.receiveShadow = true;
    room.collisionMeshes.push({ mesh: child, box: new THREE.Box3().setFromObject(child) });
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

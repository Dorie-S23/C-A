import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadRoomModel } from './loadRoomModel.js';
import { setupLobbyDoors } from './lobbyDoors.js';
import { createCurtainPortal } from './portals.js';
import { scatterPictures } from '../props/officePicture.js';

// Level 2's five office photos (see PHOTO_COUNT in level2Items.js),
// scattered round the lobby rather than sitting in Kaufmo's own room — a
// real search, not a hand-in on arrival. scatterPictures() picks different
// wall spots each time this room loads, so a retry (the search timer
// running out, or just leaving and coming back) doesn't put them back
// where they were. ca6.png exists alongside these but isn't used.
const PICTURES = [
  { id: 'ca1', url: './models/objects/ca1.png' },
  { id: 'ca2', url: './models/objects/ca2.png' },
  { id: 'ca3', url: './models/objects/ca3.png' },
  { id: 'ca4', url: './models/objects/ca4.png' },
  { id: 'ca5', url: './models/objects/ca5.png' },
];

// The castle's brick walls (arched windows, battlements), taken from the
// Sketchfab "The Digital Circus" model. The lobby's own export only has a
// single unrepeated segment of each, with the brick texture missing.
const CASTLE_WALLS_URL = './models/world/castle-brick-walls.glb';
const CASTLE_WALL_MATERIALS = /^(RandomCol|RandomCol3)$/;
// The lobby's rainbow arches are flat and stand 0.1 m behind the front of
// the Sketchfab wall (whose own arches are thicker), so push the wall back.
const CASTLE_WALL_SETBACK = 0.2;
// The red curtained arch by the toy blocks leads to the Dorm Hall. It opens
// toward +Z, into the lobby.
const DORM_ARCH_CURTAIN = 'Plane081';

export function loadTadcRoom(onProgress, { from, items } = {}) {
  return Promise.all([
    loadRoomModel('./models/world/Circus%20Lobby%20V10%20colored.glb', onProgress),
    new GLTFLoader().loadAsync(CASTLE_WALLS_URL),
  ]).then(([room, castleWalls]) => {
    // Captured before the arrival override below can replace it — the
    // search sweeps from the room's own default spawn regardless of which
    // door the player actually walked in through.
    const defaultSpawn = room.spawn;
    replaceCastleWalls(room, castleWalls.scene);
    fixExportedPlastics(room.group);
    const doors = setupLobbyDoors(room.group, room.spawn, room.collisionMeshes);
    room.interactables = doors.interactables;
    room.update = doors.update;
    // The lobby's real metals (railings, stage trim) need something to reflect.
    room.environment = true;

    const dormArch = createCurtainPortal(room.group, DORM_ARCH_CURTAIN, 1, 'dorm');
    if (dormArch) {
      room.portals = [dormArch];
      if (from === 'dorm') {
        room.spawn = dormArch.arrival.spawn;
        room.spawnFacing = dormArch.arrival.facing;
      }
    }
    if (items) {
      const pictures = scatterPictures(room, items, PICTURES, defaultSpawn, [dormArch?.box.getCenter(new THREE.Vector3())]);
      const doorsUpdate = room.update;
      room.update = (deltaSeconds, playerPosition) => {
        doorsUpdate(deltaSeconds, playerPosition);
        pictures.update(deltaSeconds);
      };
    }
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

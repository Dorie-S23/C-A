import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadRibbit } from '../characters/ribbit.js';

// Exported from "Ribbits-Room.blend" by tools/blender/export_ribbits_room.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
const RIBBIT_ROOM_URL = './models/character%20rooms/ribbits-room.glb';

// A step inside the door (on the room's -X wall), looking into the room
// (+X): any closer and the door presses the follow camera up against
// Pomni. The loader's centroid guess would land on the bed instead.
const SPAWN = { x: 2.0, z: -0.1 };
const SPAWN_FACING = -Math.PI / 2; // yaw 0 faces -Z; a quarter turn right faces +X

// Ribbit stands in the open in front of her bed, a short walk from the
// door, facing it — so walking in, the player meets her face to face.
const RIBBIT_SPOT = { x: 6.0, z: -0.5 };

// The .blend's lighting (coloured lamps on the tree shelves, the warm star
// projector) doesn't survive glTF export, so its key lights are recreated
// here: positions taken from the .blend (Blender's -Y is three's +Z). None
// cast shadows — the loader's pendant light already does, and every extra
// shadow-casting point light renders the room six more times per frame.
const ACCENT_LIGHTS = [
  { color: 0xffc42d, intensity: 6, distance: 9, position: [4.19, 2.67, -0.02] },  // star projector orb
  { color: 0xffc42d, intensity: 3, distance: 6, position: [10.57, 1.25, 0.14] },  // bedside projector
  { color: 0x29ff1f, intensity: 3, distance: 5, position: [0.72, 1.92, 3.7] },    // shelf lamps
  { color: 0xfb4aff, intensity: 3, distance: 5, position: [0.65, 1.92, -3.59] },
  { color: 0xff8f00, intensity: 3, distance: 5, position: [10.29, 1.92, -3.66] },
];

/**
 * Level 1: Ribbit's bedroom, with Ribbit idling in front of her bed, facing
 * the door the player walks in through. Walking up to her and pressing E
 * plays her conversation via the `playDialogue` hook main.js passes every
 * room loader (see selectRoom()).
 */
export function loadRibbitRoom(onProgress, { playDialogue } = {}) {
  return Promise.all([
    loadRoomModel(RIBBIT_ROOM_URL, onProgress, { spawnAt: SPAWN }),
    loadRibbit(),
  ]).then(([room, { ribbit, collider, update, faceTowards }]) => {
    // The trinkets on the shelves and the door's handle are real metals.
    room.environment = true;
    room.spawnFacing = SPAWN_FACING;
    room.group.add(createAccentLights());

    const floorY = floorHeightAt(room.group, RIBBIT_SPOT.x, RIBBIT_SPOT.z) ?? room.spawn.y;
    ribbit.position.set(RIBBIT_SPOT.x, floorY, RIBBIT_SPOT.z);
    const restYaw = Math.atan2(room.spawn.x - RIBBIT_SPOT.x, room.spawn.z - RIBBIT_SPOT.z);
    ribbit.rotation.y = restYaw;
    room.group.add(ribbit);
    ribbit.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });

    // Where she looks again once a conversation ends: back toward the door.
    const restLookAt = new THREE.Vector3(
      RIBBIT_SPOT.x + Math.sin(restYaw),
      floorY,
      RIBBIT_SPOT.z + Math.cos(restYaw),
    );
    const ribbitPosition = new THREE.Vector3();

    if (playDialogue) {
      const lookBackAtDoor = () => faceTowards(restLookAt);
      room.interactables = [{
        objects: [collider],
        anchor: ribbit,
        prompt: () => 'Talk to Ribbit',
        interact: ({ playerPosition }) => {
          faceTowards(playerPosition);
          playDialogue('ribbitTalk', {
            lookAt: ribbit.getWorldPosition(ribbitPosition),
            onComplete: lookBackAtDoor,
            onCancel: lookBackAtDoor,
          });
        },
      }];
    }
    room.update = update;
    return room;
  });
}

function createAccentLights() {
  const lights = new THREE.Group();
  lights.name = 'RibbitRoomAccents';
  for (const { color, intensity, distance, position } of ACCENT_LIGHTS) {
    const light = new THREE.PointLight(color, intensity, distance, 2);
    light.position.set(...position);
    lights.add(light);
  }
  return lights;
}

/** The top surface under (x, z) — her feet go on the rug, not under it. */
function floorHeightAt(group, x, z) {
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 3);
  const hit = raycaster.intersectObject(group, true)[0];
  return hit ? hit.point.y : null;
}

import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadRibbit } from '../characters/ribbit.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';

// Exported from "Ribbits-Room.blend" by tools/blender/export_ribbits_room.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
const RIBBIT_ROOM_URL = './models/character%20rooms/ribbits-room.glb';

// A step inside the door (on the room's -X wall), looking into the room
// (+X): any closer and the door presses the follow camera up against
// Pomni. The loader's centroid guess would land on the bed instead.
const SPAWN = { x: 2.0, z: -0.1 };
const SPAWN_FACING = -Math.PI / 2; // yaw 0 faces -Z; a quarter turn right faces +X

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';
const DOOR_PLATE_NAME = 'Jax_Icon'; // Ribbit's face plate, on the slab's outer side

// Story spots Level 1 (src/levels/level1.js) stages its scene with. Three's
// (x, z) is Blender's (x, -y); all on the floor plane.
const POINTS = {
  DOORWAY: { x: 0.6, z: -0.1 },       // just through the door, where Pomni arrives
  BEDSIDE: { x: 4.3, z: -1.0 },       // standing at the foot of the bed
  SEAT: { x: 4.75, z: -1.55 },        // the mattress edge beside Ribbit
  SEAT_FACING: { x: 4.3, z: -0.3 },   // sat looking out into the room
  RIBBIT_ON_BED: { x: 5.6, z: -2.0 }, // her hips on the mattress, head to the pillows (-Z)
};


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
 * Ribbit's bedroom, as a place: Ribbit lies curled up on her bed, as she is
 * when Level 1 finds her. Picked from the room list it's just for
 * exploring — no conversation, no scoring — and its door (opened with E)
 * leads back to the Dorm Hall. Level 1 (src/levels/level1.js)
 * travels here mid-mission and drives the scene through `room.ribbitScene`:
 * the door, Ribbit's poses and distress, and the spots Pomni moves between.
 */
export function loadRibbitRoom(onProgress, { from } = {}) {
  return Promise.all([
    loadRoomModel(RIBBIT_ROOM_URL, onProgress, { spawnAt: SPAWN }),
    loadRibbit(),
  ]).then(([room, { ribbit, collider, update, setDistress, setPose }]) => {
    // The trinkets on the shelves and the door's handle are real metals.
    room.environment = true;
    room.spawnFacing = SPAWN_FACING;
    room.group.add(createAccentLights());
    // Her door opens onto the Dorm Hall: walking into the doorway goes
    // back there (doors.js/portals.js), and coming from there arrives in it.
    const hinged = openHingedDoor(room.group, DOOR_FRAME_NAME, DOOR_SLAB_NAME, room.spawn, room.collisionMeshes);
    let portal = null;
    if (hinged) {
      portal = createDoorPortal(room.group, hinged.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }
    }

    // Ribbit curled up on her bed, head on the pillows.
    const mattressY = floorHeightAt(room.group, POINTS.RIBBIT_ON_BED.x, POINTS.RIBBIT_ON_BED.z) ?? 0.55;
    const seatY = floorHeightAt(room.group, POINTS.SEAT.x, POINTS.SEAT.z) ?? 0.45;
    ribbit.position.set(POINTS.RIBBIT_ON_BED.x, mattressY, POINTS.RIBBIT_ON_BED.z);
    setPose('curled', { immediate: true });
    room.group.add(ribbit);
    ribbit.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });

    // Shut until Pomni opens it (Level 1 opens and closes it itself); her
    // face plate swings with it.
    const door = hinged
      ? makeDoorOpenable(room, hinged, { portal, attach: [room.group.getObjectByName(DOOR_PLATE_NAME)] })
      : { open() {}, close() {}, lock() {}, update() {}, interactable: null };
    if (door.interactable) room.interactables = [...(room.interactables ?? []), door.interactable];

    room.ribbitScene = { door, setPose, setDistress, seatY, points: POINTS };
    room.update = (deltaSeconds) => {
      update(deltaSeconds);
      door.update(deltaSeconds);
    };
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

/** The top surface under (x, z): her feet go on the rug, not under it. */
function floorHeightAt(group, x, z) {
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 3);
  const hit = raycaster.intersectObject(group, true)[0];
  return hit ? hit.point.y : null;
}

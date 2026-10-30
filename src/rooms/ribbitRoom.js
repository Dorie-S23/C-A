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
  RIBBIT_ON_BED: { x: 5.6, z: -2.0 }, // her hips on the mattress, head to the pillows (-Z)
  // Sitting up she comes to the edge of the round bed (centre ≈ (5.8, -2.5),
  // rim ≈ 1.7 m out; she's 1.55 m out), a little round from Pomni's seat,
  // facing out so her legs hang over the side: her sitting clip is a chair
  // sit. Any further in and her shins brush the bed's side on the way down.
  RIBBIT_SITTING: { x: 5.31, z: -1.02, yaw: -0.33 },
};

// The bed's pink flower cushion (Gear; Gear001 is its centre) lies right
// where her head goes asleep and hid her face, and wherever else on the bed
// it went it was in the way of a shot, so the room loads without it.
const FLOWER_CUSHION = ['Gear', 'Gear001'];

// Frame both characters from the open side of the bed, away from Pomni's hat.
const SHOTS = {
  bedside: { position: [7.4, 2.1, 0.9], target: [5.1, 1.0, -1.9] },
  seated: { position: [7.1, 1.8, 0.4], target: [5.2, 1.0, -1.9] },
  // Once she sits up on the edge she'd hide Pomni from `seated`: this is
  // from in front of them both, Ribbit almost face on, Pomni turned to her.
  sittingUp: { position: [4.3, 1.7, 1.5], target: [5.0, 0.9, -1.35] },
};


// The .blend's lighting (coloured lamps on the tree shelves, the warm star
// projector) doesn't survive glTF export, so its key lights are recreated
// here: positions taken from the .blend (Blender's -Y is three's +Z). None
// cast shadows — the loader's pendant light already does, and every extra
// shadow-casting point light renders the room six more times per frame.
const ACCENT_LIGHTS = [
  { color: 0xffead8, intensity: 8, distance: 9, position: [7.0, 2.4, 0.6] }, // soft conversation fill, no shadow pass
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
export function loadRibbitRoom(onProgress, { from, ribbitStory, playDialogue } = {}) {
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
    const defaultSpawn = room.spawn.clone(); // the middle of the room, whatever `from` makes the arrival
    let portal = null;
    if (hinged) {
      portal = createDoorPortal(room.group, hinged.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }
    }

    removeFlowerCushion(room);

    // Ribbit asleep on her bed, head on the pillows; sitting, on the bed's
    // edge with her feet on the rug in front of her.
    const mattressY = floorHeightAt(room.group, POINTS.RIBBIT_ON_BED.x, POINTS.RIBBIT_ON_BED.z) ?? 0.55;
    const seatY = floorHeightAt(room.group, POINTS.SEAT.x, POINTS.SEAT.z) ?? 0.45;
    const sitting = POINTS.RIBBIT_SITTING;
    const feetY = floorHeightAt(room.group, sitting.x + Math.sin(sitting.yaw) * 0.6, sitting.z + Math.cos(sitting.yaw) * 0.6);
    const PLACES = {
      curled: { ...POINTS.RIBBIT_ON_BED, y: mattressY, yaw: 0 },
      sitting: { ...sitting, y: feetY ?? room.spawn.y },
    };
    const poseHere = (name, options) => setPose(name, { ...options, at: PLACES[name] });
    const settled = ribbitStory?.complete() ?? false;
    poseHere(settled ? 'sitting' : 'curled', { immediate: true });
    setDistress(settled && ribbitStory.points() >= 2 ? 0 : 1);
    room.group.add(ribbit);
    ribbit.updateMatrixWorld(true);
    // Dynamic: she moves to the edge of the bed when she sits up.
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider), dynamic: true });

    // Shut until Pomni opens it (Level 1 opens and closes it itself); her
    // face plate swings with it.
    const door = hinged
      ? makeDoorOpenable(room, hinged, { portal, attach: [room.group.getObjectByName(DOOR_PLATE_NAME)] })
      : { open() {}, close() {}, lock() {}, update() {}, interactable: null };
    if (door.interactable) room.interactables = [...(room.interactables ?? []), door.interactable];
    if (hinged) {
      // Like Kaufmo's: for main.js to show the real Dorm Hall through it and
      // walk her out (walkInLink.js); the portal's only taken while that's
      // not ready. Hidden from the hall's side: its own door is in the doorway.
      room.hallDoor = {
        frameBox: hinged.frameBox, inside: defaultSpawn, control: door, portal,
        parts: [hinged.frame, hinged.slab.parent, room.group.getObjectByName(DOOR_PLATE_NAME), portal.glimpse].filter(Boolean),
      };
      // Walking in from the hall: it stands open, as the hall's does.
      room.openDoorway = () => door.open({ immediate: true });
    }

    if (ribbitStory && playDialogue) {
      room.interactables ??= [];
      room.interactables.push({
        objects: [collider], anchor: ribbit, radius: 2.8,
        enabled: () => ribbitStory.complete(),
        prompt: () => 'Talk to Ribbit',
        interact: () => playDialogue('ribbitFollowup', { lookAt: POINTS.RIBBIT_SITTING }),
      });
    }
    room.ribbitScene = { door, setPose: poseHere, setDistress, seatY, points: POINTS, shots: SHOTS };
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

/**
 * Takes the flower cushion (see FLOWER_CUSHION) out of the room: out of the
 * scene, out of collision (raycasts would still hit it hidden), and frees
 * what only it used, since the room's teardown no longer reaches it.
 */
function removeFlowerCushion(room) {
  const meshes = [];
  for (const name of FLOWER_CUSHION) {
    const part = room.group.getObjectByName(name);
    if (!part) continue;
    part.traverse((child) => { if (child.isMesh) meshes.push(child); });
    part.removeFromParent();
  }
  if (!meshes.length) return;
  // In place: the door code was handed this same array.
  const kept = room.collisionMeshes.filter((entry) => !meshes.includes(entry.mesh));
  room.collisionMeshes.splice(0, room.collisionMeshes.length, ...kept);

  const stillUsed = new Set();
  room.group.traverse((child) => {
    if (child.isMesh) for (const material of [].concat(child.material)) stillUsed.add(material);
  });
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    for (const material of [].concat(mesh.material)) {
      if (!stillUsed.has(material)) material.dispose();
    }
  }
}

/** The top surface under (x, z): her feet go on the rug, not under it. */
function floorHeightAt(group, x, z) {
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 3);
  const hit = raycaster.intersectObject(group, true)[0];
  return hit ? hit.point.y : null;
}

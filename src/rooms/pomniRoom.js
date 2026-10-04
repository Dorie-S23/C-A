import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';
import { addMirrorReflections } from './mirrors.js';

const CAINE_DISTANCE = 3; // how far in front of the spawn point Caine stands
const CAINE_WALL_GAP = 0.8; // keep him at least this far off any wall in the way

// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
export function loadPomniRoom(onProgress) {
  return Promise.all([
    loadRoomModel('../models/character%20rooms/pomnis-room-v3.glb', onProgress),
    loadCaine(),
  ]).then(([room, { caine, collider }]) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    addMirrorReflections(room.group, room.spawn);
    placeInFrontOfSpawn(caine, room);
    room.group.add(caine);
    caine.updateMatrixWorld(true);

    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    room.update = createCaineIdle(caine);

    return room;
  });
}

/**
 * The player spawns facing -Z, so Caine goes CAINE_DISTANCE along -Z from
 * the spawn — pulled in if a wall is closer — then dropped onto whatever
 * floor is under that point and turned to face the spawn.
 */
function placeInFrontOfSpawn(caine, { group, spawn }) {
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3(0, 0, -1);

  raycaster.set(new THREE.Vector3(spawn.x, spawn.y + 1, spawn.z), forward);
  raycaster.far = CAINE_DISTANCE + CAINE_WALL_GAP;
  const wallHit = raycaster.intersectObject(group, true)[0];
  const distance = wallHit
    ? Math.max(wallHit.distance - CAINE_WALL_GAP, 1)
    : CAINE_DISTANCE;

  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z).addScaledVector(forward, distance);

  raycaster.set(new THREE.Vector3(position.x, spawn.y + 1, position.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 3;
  const floorHit = raycaster.intersectObject(group, true)[0];
  if (floorHit) position.y = floorHit.point.y;

  caine.position.copy(position);
  caine.rotation.y = Math.atan2(spawn.x - position.x, spawn.z - position.z);
}

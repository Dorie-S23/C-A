import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadCaine, createCaineIdle } from '../characters/caine.js';
import { addMirrorReflections } from './mirrors.js';

const CAINE_DISTANCE = 3; // how far in front of the spawn point Caine stands
const CAINE_WALL_GAP = 0.8; // keep him at least this far off any wall in the way

// The glTF export carries these as "Door Frame.024" / "Door Slab.024";
// three.js's GLTFLoader sanitizes node names (spaces and the disambiguating
// dot both go), so they come out as this at runtime.
const DOOR_FRAME_NAME = 'Door_Frame024';
const DOOR_SLAB_NAME = 'Door_Slab024';
const DOOR_OPEN_ANGLE = Math.PI / 2;

// Exported from "Pomnis Room V3.blend" by tools/blender/export_pomnis_room_v3.py,
// which converts the materials the glTF exporter can't read — re-run it
// after editing the .blend.
export function loadPomniRoom(onProgress) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/pomnis-room-v3.glb', onProgress),
    loadCaine(),
  ]).then(([room, { caine, collider }]) => {
    // Its metal trim needs something to reflect.
    room.environment = true;
    // The vanity and the standing mirror reflect the room for real.
    addMirrorReflections(room.group, room.spawn);
    room.spawnFacing = openDoorAndFaceIt(room.group, room.spawn, room.collisionMeshes) ?? room.spawnFacing;
    placeInFrontOfSpawn(caine, room);
    room.group.add(caine);
    caine.updateMatrixWorld(true);

    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    room.update = createCaineIdle(caine);

    return room;
  });
}

/**
 * Swings the bedroom door open on load (it's just set to its open pose, not
 * an interactable — nothing here ever closes it) and returns the yaw that
 * makes the spawn point face it, or null if the door isn't in this export.
 */
function openDoorAndFaceIt(group, spawn, collisionMeshes) {
  const frame = group.getObjectByName(DOOR_FRAME_NAME);
  const slab = group.getObjectByName(DOOR_SLAB_NAME);
  if (!frame || !slab) return null;
  group.updateMatrixWorld(true);

  const frameBox = new THREE.Box3().setFromObject(frame);
  const slabBox = new THREE.Box3().setFromObject(slab);
  const slabSize = slabBox.getSize(new THREE.Vector3());

  // The panel is wide along one horizontal axis and thin along the other
  // (the wall it's set into); hinge on whichever edge, along the wide
  // axis, swings the leaf into the room rather than through the wall.
  const wideAxis = slabSize.x >= slabSize.z ? 'x' : 'z';
  const minHinge = slabBox.getCenter(new THREE.Vector3());
  minHinge[wideAxis] = slabBox.min[wideAxis];
  const maxHinge = minHinge.clone();
  maxHinge[wideAxis] = slabBox.max[wideAxis];

  const roomward = new THREE.Vector3().subVectors(spawn, slabBox.getCenter(new THREE.Vector3())).setY(0).normalize();
  const sweepsTowardRoom = (hinge, angle) => {
    const farCorner = slabBox.getCenter(new THREE.Vector3());
    farCorner[wideAxis] = hinge[wideAxis] === minHinge[wideAxis] ? slabBox.max[wideAxis] : slabBox.min[wideAxis];
    const swung = farCorner.clone().sub(hinge).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(hinge);
    return swung.clone().sub(slabBox.getCenter(new THREE.Vector3())).setY(0).dot(roomward);
  };

  // Try both hinge edges at +/-90° and keep whichever actually swings the
  // leaf toward the room (the other three combinations swing it through
  // the wall into whatever's on the other side).
  let best = { score: -Infinity, hinge: minHinge, angle: DOOR_OPEN_ANGLE };
  for (const hinge of [minHinge, maxHinge]) {
    for (const angle of [DOOR_OPEN_ANGLE, -DOOR_OPEN_ANGLE]) {
      const score = sweepsTowardRoom(hinge, angle);
      if (score > best.score) best = { score, hinge, angle };
    }
  }

  const pivot = new THREE.Group();
  pivot.name = 'PomniDoorHinge';
  group.add(pivot);
  pivot.position.copy(group.worldToLocal(best.hinge.clone()));
  pivot.updateMatrixWorld(true);
  pivot.attach(slab);
  pivot.rotation.y = best.angle;
  pivot.updateMatrixWorld(true);

  // collectCollisionMeshes() already boxed the slab at its closed pose —
  // fix that entry up now, or the open doorway would still invisibly
  // block at the old panel position.
  const slabCollision = collisionMeshes.find((entry) => entry.mesh === slab);
  if (slabCollision) slabCollision.box.setFromObject(slab);

  const doorCenter = frameBox.getCenter(new THREE.Vector3());
  return Math.atan2(spawn.x - doorCenter.x, spawn.z - doorCenter.z);
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

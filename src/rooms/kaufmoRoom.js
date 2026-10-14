import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmo } from '../characters/kaufmo.js';

const KAUFMO_DISTANCE = 2.2; // how far in front of spawn he stands, pulled in by furniture
const KAUFMO_WALL_GAP = 0.6;

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py, plus Kaufmo himself standing in it.
 * No dialogue trigger yet — he's just present and collidable.
 */
export function loadKaufmoRoom(onProgress) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/kaufmos-room.glb', onProgress),
    loadKaufmo(),
  ]).then(([room, { kaufmo, collider }]) => {
    fixExportedMaterials(room.group);
    placeInFrontOfSpawn(kaufmo, room);
    room.group.add(kaufmo);
    kaufmo.updateMatrixWorld(true);
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider) });
    return room;
  });
}

/**
 * Same technique pomniRoom.js uses for Caine: stand him KAUFMO_DISTANCE
 * along -Z from spawn (pulled in if furniture is closer), drop him onto
 * whatever floor is under that point, and turn him to face the spawn. His
 * room is small and cluttered, so the wall-probe pull-in matters more here
 * than it does in Pomni's room.
 */
function placeInFrontOfSpawn(kaufmo, { group, spawn }) {
  const raycaster = new THREE.Raycaster();
  const forward = new THREE.Vector3(0, 0, -1);

  raycaster.set(new THREE.Vector3(spawn.x, spawn.y + 1, spawn.z), forward);
  raycaster.far = KAUFMO_DISTANCE + KAUFMO_WALL_GAP;
  const wallHit = raycaster.intersectObject(group, true)[0];
  const distance = wallHit
    ? Math.max(wallHit.distance - KAUFMO_WALL_GAP, 0.8)
    : KAUFMO_DISTANCE;

  const position = new THREE.Vector3(spawn.x, spawn.y, spawn.z).addScaledVector(forward, distance);

  raycaster.set(new THREE.Vector3(position.x, spawn.y + 1, position.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = 3;
  const floorHit = raycaster.intersectObject(group, true)[0];
  if (floorHit) position.y = floorHit.point.y;

  kaufmo.position.copy(position);
  kaufmo.rotation.y = Math.atan2(spawn.x - position.x, spawn.z - position.z);
}

/**
 * Same symptom as the lobby's exported "Plastic" materials: a few of this
 * room's shaders the glTF exporter couldn't translate come out fully
 * metallic + fully rough with no texture, which shows no diffuse colour at
 * all — just reflections — so they render almost black. Most materials
 * were already fixed on the Blender side (see the export script); this is
 * a safety net for whatever that pass didn't cover.
 */
function fixExportedMaterials(group) {
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

import { loadRoomModel } from './loadRoomModel.js';

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py. No Kaufmo-the-character logic
 * lives here yet (no model, no dialogue trigger) — this is just the set.
 */
export function loadKaufmoRoom(onProgress) {
  return loadRoomModel('./models/character%20rooms/kaufmos-room.glb', onProgress).then((room) => {
    fixExportedMaterials(room.group);
    return room;
  });
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

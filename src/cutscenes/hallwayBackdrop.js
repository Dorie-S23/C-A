import { loadRoomModel } from '../rooms/loadRoomModel.js';

// Reused by every "cut away to the Dorm Hall" cutscene (Jax's run, Kaufmo's
// run) — just the hall's geometry plus the lighting rig loadRoomModel
// already attaches to it, no portals/doors/collision, since nobody walks
// through a cutscene backdrop.
const DORM_HALL_URL = './models/world/dorm-hall-v7.glb';

/**
 * @param {{ x: number, z: number }} spawnAt where loadRoomModel's own
 *   generated lighting rig gets centred — put it near wherever the
 *   cutscene's actual action happens, not the hall's real entrance.
 * @returns {Promise<{ group: THREE.Group }>}
 */
export function loadHallwayBackdrop(spawnAt) {
  return loadRoomModel(DORM_HALL_URL, null, { spawnAt });
}

import { loadRoomModel } from './loadRoomModel.js';

export function loadTadcRoom(onProgress) {
  return loadRoomModel('./models/tadc-map.glb', onProgress);
}

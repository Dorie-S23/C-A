import { loadRoomModel } from './loadRoomModel.js';

export function loadPomniRoom(onProgress) {
  return loadRoomModel('./models/pomnis-room.glb', onProgress);
}

/**
 * Manual save slots, kept in the browser (localStorage). A save is the
 * game's latest checkpoint (see main.js takeCheckpoint): plain JSON of the
 * story state plus which room Pomni was in and, if she was free to walk
 * about when it was saved, exactly where (`pose`). Never anything mid-scene.
 *
 * SAVE_VERSION: bump it whenever a checkpoint's shape changes in a way old
 * saves can't load into. Saves from another version show as incompatible
 * rather than loading half-right. `pose` didn't need a bump: a save without
 * one arrives at the room's usual spot.
 */
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

const key = (slot) => `tadc.save.${slot}`;

const POSE_FIELDS = ['x', 'y', 'z', 'yaw', 'pomniYaw', 'pitch'];

/** Where a save left Pomni, or null if it doesn't say (an older save, one taken mid-scene, a damaged one). */
export function savedPose(data) {
  const pose = data?.pose;
  return pose && POSE_FIELDS.every((field) => Number.isFinite(pose[field])) ? pose : null;
}

/**
 * @param {Storage} [storage] localStorage, or a stand-in (tests)
 * @returns {{ count: number, list: () => Array<object|null>, read: (slot: number) => object|null,
 *   write: (slot: number, checkpoint: object) => object, remove: (slot: number) => void }}
 */
export function createSaveSlots(storage = globalThis.localStorage) {
  function read(slot) {
    try {
      const raw = storage?.getItem(key(slot));
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data?.version !== SAVE_VERSION) return { incompatible: true, savedAt: data?.savedAt ?? null };
      return data;
    } catch {
      return null; // blocked storage or a corrupt entry: treat the slot as empty
    }
  }

  return {
    count: SLOT_COUNT,
    list: () => Array.from({ length: SLOT_COUNT }, (_, i) => read(i + 1)),
    read,
    /** Throws if the browser won't store it (private window, full storage). */
    write(slot, checkpoint) {
      const data = { ...checkpoint, version: SAVE_VERSION, savedAt: new Date().toISOString() };
      storage.setItem(key(slot), JSON.stringify(data));
      return data;
    },
    remove(slot) {
      try { storage?.removeItem(key(slot)); } catch { /* nothing stored to remove */ }
    },
  };
}

// --- Save files ------------------------------------------------------------
// A save can also leave the browser as a file the player keeps (a backup,
// another computer): the same checkpoint JSON, tagged so a stray .json
// isn't mistaken for one.
export const SAVE_FILE_FORMAT = 'tadc-save';

/** The text of a save file for `checkpoint`, ready to write to disk. */
export function saveFileContents(checkpoint) {
  return JSON.stringify({
    format: SAVE_FILE_FORMAT, ...checkpoint, version: SAVE_VERSION, savedAt: new Date().toISOString(),
  }, null, 2);
}

/**
 * Reads a save file back. Returns the checkpoint to load; `{ incompatible: true }`
 * for a save from another version of the game; null for anything that isn't
 * one of the game's saves (another file, a damaged one).
 */
export function parseSaveFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }
  if (data?.format !== SAVE_FILE_FORMAT) return null;
  if (data.version !== SAVE_VERSION) return { incompatible: true, savedAt: data.savedAt ?? null };
  // What loadGame needs at the least: a room and the objectives.
  if (typeof data.room !== 'string' || typeof data.objectives !== 'object' || data.objectives === null) return null;
  return data;
}

/** A file name saying what the save is: tadc-save-find-ribbit-2026-10-30.json */
export function saveFileName(checkpoint, when = new Date()) {
  const what = checkpoint?.objectives?.active ?? checkpoint?.room ?? 'save';
  return `${SAVE_FILE_FORMAT}-${String(what).replace(/[^a-z0-9-]+/gi, '-')}-${when.toISOString().slice(0, 10)}.json`;
}

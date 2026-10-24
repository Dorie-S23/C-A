/**
 * Manual save slots, kept in the browser (localStorage). A save is the
 * game's latest checkpoint (see main.js takeCheckpoint): plain JSON of the
 * story state plus which room Pomni was in, never anything mid-scene.
 *
 * SAVE_VERSION: bump it whenever a checkpoint's shape changes in a way old
 * saves can't load into. Saves from another version show as incompatible
 * rather than loading half-right.
 */
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 3;

const key = (slot) => `tadc.save.${slot}`;

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

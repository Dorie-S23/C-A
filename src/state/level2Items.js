import { setLevelPoints } from './escapeThreshold.js';

/** How many office photos Level 2's search is actually looking for. */
export const PHOTO_COUNT = 5;
/** How many Kaufmo needs: bringing back fewer and he abstracts (Game Over). */
export const PHOTO_THRESHOLD = 3;

/**
 * Each photo's image. Spelled out in full, not built from the id: the
 * packager (tools/package.mjs) finds the files the game loads by their
 * paths in the code, and a `${id}` path can't be followed. ca6.png exists
 * alongside these but isn't used.
 */
export const PHOTO_URLS = {
  ca1: './models/objects/ca1.png',
  ca2: './models/objects/ca2.png',
  ca3: './models/objects/ca3.png',
  ca4: './models/objects/ca4.png',
  ca5: './models/objects/ca5.png',
};

/**
 * The images for a list of photo ids. Development shortcuts collect
 * stand-in ids (the Level 3 jump), which get the real photos in turn.
 */
export function photoUrls(ids) {
  const all = Object.values(PHOTO_URLS);
  return ids.map((id, i) => PHOTO_URLS[id] ?? all[i % all.length]);
}

/**
 * One run's Level 2 pictures, shared by every room. Held and handed-in
 * pictures both stay found, but only handed-in pictures earn Escape points.
 * onCollect lets the browser show its pickup hint without coupling this
 * state to the DOM, room models, or renderer.
 */
export function createLevel2Items({ onCollect = () => {} } = {}) {
  const collectedItems = new Set();
  const presentedItems = new Set();
  let done = false; // the success scene has actually played through once already
  let photoLayout = null;

  const items = {
    hasCollected: (id) => collectedItems.has(id) || presentedItems.has(id),
    collect(id) {
      if (items.hasCollected(id)) return;
      collectedItems.add(id);
      onCollect(items.totalFound());
    },
    heldCount: () => collectedItems.size,
    totalPresented: () => presentedItems.size,
    totalFound: () => collectedItems.size + presentedItems.size,
    /** Cache plain placement data for this attempt, independent of room meshes.
     * The factory runs once; room revisits reuse the same slots, even after
     * pickups or partial deliveries. reset() starts a new random layout. */
    getPhotoLayout(createLayout) {
      if (photoLayout === null) {
        photoLayout = Object.freeze(createLayout().map(spot => spot && Object.freeze({
          id: spot.id,
          position: Object.freeze({ x: spot.position.x, y: spot.position.y, z: spot.position.z }),
          rotationY: spot.rotationY,
        })));
      }
      return photoLayout;
    },
    /** Hands over everything held; returns the running total, not this batch. */
    presentHeld() {
      for (const id of collectedItems) presentedItems.add(id);
      collectedItems.clear();
      setLevelPoints('level2', presentedItems.size);
      return presentedItems.size;
    },
    /** Whether the success scene has played through once already — so the
     *  "Level 2 Complete" step only happens the first time. */
    isDone: () => done,
    markDone() {
      done = true;
    },
    snapshot() {
      return { collected: [...collectedItems], presented: [...presentedItems], done };
    },
    /** From a save. Escape points are restored separately (escapeThreshold.js). */
    restore(saved = {}) {
      collectedItems.clear();
      presentedItems.clear();
      for (const id of saved.collected ?? []) collectedItems.add(id);
      for (const id of saved.presented ?? []) presentedItems.add(id);
      done = Boolean(saved.done);
    },
    reset() {
      collectedItems.clear();
      presentedItems.clear();
      done = false;
      photoLayout = null;
      setLevelPoints('level2', 0);
    },
  };

  return items;
}

/**
 * What talking to Kaufmo plays once he's sent Pomni searching: she hands
 * over everything she's carrying in one go, and he either has enough
 * (PHOTO_THRESHOLD or more: the success scene) or not (he abstracts — Game
 * Over). Talking to him empty-handed is just his idle line, and once the
 * success scene has played, his "working on it" one.
 */
export function pickKaufmoScript(items) {
  if (!items) return 'level2Opening';
  if (items.heldCount() > 0) {
    const total = items.presentHeld();
    return total >= PHOTO_THRESHOLD ? 'level2Return' : 'level2Abstraction';
  }
  if (items.totalPresented() >= PHOTO_THRESHOLD) return 'level2Complete';
  if (items.totalPresented() > 0) return 'level2Idle';
  return 'level2Opening';
}

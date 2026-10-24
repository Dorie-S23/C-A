// Named landmarks of the Circus Lobby, for the minimap's labels, the photo
// search's hints ("a photo is by the Gumball Tower") and keeping Level 2's
// photos off the same landmark (see scatterPictures in officePicture.js).
// The lobby's export names are generic (Cube242, Sphere, Panel (Blue,
// Circle)003), so each landmark is a hand-measured floor footprint in world
// metres, read off a top-down render of the real model.
export const LOBBY_LANDMARKS = [
  { label: 'Gumball Tower', minX: 14, maxX: 48, minZ: -47, maxZ: -13 },
  { label: 'Toy Block Wall', minX: 50, maxX: 100, minZ: -65, maxZ: -15 },
  { label: 'Couch Corner', minX: 55, maxX: 100, minZ: -8, maxZ: 10 },
  { label: 'Block Pile', minX: -22, maxX: 4, minZ: -45, maxZ: 12 },
  { label: 'Black Pole', minX: -3, maxX: 14, minZ: 14, maxZ: 31 },
  { label: 'Spiral Staircase', minX: 47, maxX: 66, minZ: 13, maxZ: 32 },
  { label: 'Block Row', minX: 28, maxX: 66, minZ: 25, maxZ: 51 },
  { label: 'Painted Walls', minX: 1, maxX: 26, minZ: 40, maxZ: 60 },
  { label: 'Castle', minX: -32, maxX: 29, minZ: 62, maxZ: 96 },
  { label: 'Stage', minX: -75, maxX: -35, minZ: 5, maxZ: 45 },
  { label: 'Blue Fort', minX: 90, maxX: 116, minZ: 12, maxZ: 64 },
  { label: 'Checkered Slide', minX: 110, maxX: 135, minZ: -45, maxZ: 0 },
  { label: 'Toy Train', minX: 118, maxX: 148, minZ: -45, maxZ: -5 },
  { label: 'Checkered Rug', minX: 97, maxX: 119, minZ: 64, maxZ: 87 },
];

/** Metres from (x, z) to a landmark's footprint; 0 inside it. */
function distanceTo(landmark, x, z) {
  const dx = Math.max(landmark.minX - x, 0, x - landmark.maxX);
  const dz = Math.max(landmark.minZ - z, 0, z - landmark.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * The landmark whose footprint is closest to (x, z), or null when none is
 * within `reach` metres (out in the open floor). Where footprints overlap
 * (the Block Row wraps the Spiral Staircase), the earlier one wins.
 */
export function nearestLandmark(x, z, reach = Infinity, landmarks = LOBBY_LANDMARKS) {
  let best = null;
  let bestDistance = reach;
  for (const landmark of landmarks) {
    const distance = distanceTo(landmark, x, z);
    if (distance < bestDistance) {
      best = landmark;
      bestDistance = distance;
    }
  }
  return best;
}

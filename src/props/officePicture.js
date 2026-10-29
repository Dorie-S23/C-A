import * as THREE from 'three';

// One of the "real C&A office" reference photos (Level 2's five scattered
// collectibles). Simple framed-photo prop: a wood box for the frame, a
// textured plane for the photo, standing proud of the frame face so it
// never z-fights. About 1 m wide: at the old 0.55 m, on the Lobby's 16 m
// toy-block walls, a photo was a few pixels across from 8 m away.
const FRAME_WIDTH = 1.0;
const FRAME_HEIGHT = 0.76;
const FRAME_DEPTH = 0.035;
const FRAME_BORDER = 0.07;

// A found-but-not-yet-collected picture glows softly — emissive warmth on
// the photo itself, pulsing slowly so it reads as "something's here"
// without looking like a blinking alarm. See pulseGlow(), driven from the
// owning room's update(). This used to also carry its own PointLight, but
// 5 extra dynamic lights in a room already this large and geometrically
// heavy (the Lobby, merged with a second big GLB for its castle walls) was
// a real, measured performance cost — removed in favour of emissive-only,
// which is weaker from a distance (it lights the picture's own surface,
// not the wall around it) but costs nothing extra to render.
const GLOW_COLOR = 0xfff2c0;
const GLOW_PULSE_HZ = 0.6;
const GLOW_EMISSIVE_BASE = 0.4;
const GLOW_EMISSIVE_SWING = 0.5;

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function getTexture(url) {
  let texture = textureCache.get(url);
  if (!texture) {
    texture = textureLoader.load(url);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(url, texture);
  }
  return texture;
}

/**
 * @param {string} imageUrl one of the ca1-ca6.png reference photos
 * @returns {THREE.Group} a small wall-hangable framed picture, glowing
 *   until it's picked up (see pulseGlow)
 */
export function createOfficePicture(imageUrl) {
  const group = new THREE.Group();
  group.name = 'OfficePicture';

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(FRAME_WIDTH, FRAME_HEIGHT, FRAME_DEPTH),
    new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.75, metalness: 0.05 }),
  );
  frame.name = 'OfficePictureFrame';
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  const photoMaterial = new THREE.MeshStandardMaterial({
    map: getTexture(imageUrl), roughness: 0.85,
    emissive: new THREE.Color(GLOW_COLOR), emissiveIntensity: GLOW_EMISSIVE_BASE,
  });
  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(FRAME_WIDTH - FRAME_BORDER * 2, FRAME_HEIGHT - FRAME_BORDER * 2),
    photoMaterial,
  );
  photo.name = 'OfficePicturePhoto';
  photo.position.z = FRAME_DEPTH / 2 + 0.002;
  group.add(photo);

  group.userData.glow = { material: photoMaterial };
  return group;
}

/**
 * Advances every still-placed picture's glow by one frame. Pictures that
 * have been picked up (removed from the scene — `picture.parent` is null)
 * are skipped rather than filtered out up front, since the caller's list
 * doesn't get told about pickups as they happen.
 */
export function pulseGlow(pictures, elapsedSeconds) {
  const wave = 0.5 + 0.5 * Math.sin(elapsedSeconds * GLOW_PULSE_HZ * Math.PI * 2);
  for (const picture of pictures) {
    if (!picture.parent) continue;
    picture.userData.glow.material.emissiveIntensity = GLOW_EMISSIVE_BASE + GLOW_EMISSIVE_SWING * wave;
  }
}

const wallRaycaster = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Finds a spot flush against whatever wall is hit casting from `origin`
 * toward `direction`, facing back out into the room — a quick way to hang
 * a picture without needing to know a room's exact furniture layout.
 * Returns null if nothing is hit within `maxDistance`. `object` is the mesh
 * the spot is on.
 */
export function findWallSpot(group, origin, direction, maxDistance = 6) {
  wallRaycaster.set(origin, direction);
  wallRaycaster.far = maxDistance;
  const hit = wallRaycaster.intersectObject(group, true)[0];
  if (!hit?.face) return null;

  const normal = hit.face.normal.clone()
    .transformDirection(hit.object.matrixWorld)
    .projectOnPlane(UP)
    .normalize();
  const position = hit.point.clone().addScaledVector(normal, FRAME_DEPTH);
  const rotationY = Math.atan2(normal.x, normal.z);
  return { position, rotationY, object: hit.object };
}

/**
 * Finds a spot standing on the floor near some existing prop in the room
 * (by name, as a glTF-sanitized node name), offset from its centre by
 * `offset.x`/`offset.z`. Used to tuck a collectible beside a landmark the
 * player will naturally walk past — a toy, a couch, a hallway photo —
 * instead of mounting it in plain sight on the nearest wall, since the
 * story has these photos scattered/kicked around the circus, not hung up.
 * Returns null if the named prop isn't in this build of the room (keeps
 * callers safe against a future re-export renaming or removing it).
 */
export function findSpotNear(group, anchorName, offset) {
  const anchor = group.getObjectByName(anchorName);
  if (!anchor) return null;
  group.updateMatrixWorld(true);
  const center = new THREE.Box3().setFromObject(anchor).getCenter(new THREE.Vector3());
  const x = center.x + offset.x;
  const z = center.z + offset.z;

  // The downward ray can cross a ceiling or a shelf above the actual floor,
  // so take the last (lowest) hit, not the first.
  wallRaycaster.set(new THREE.Vector3(x, center.y + 20, z), new THREE.Vector3(0, -1, 0));
  wallRaycaster.far = 40;
  const hits = wallRaycaster.intersectObject(group, true);
  const hit = hits[hits.length - 1];
  if (!hit) return null;

  // Face back toward the anchor it's tucked beside, so it reads from the
  // angle a player approaching the landmark would actually see it from.
  const rotationY = Math.atan2(-offset.x, -offset.z);
  const position = new THREE.Vector3(x, hit.point.y + FRAME_HEIGHT / 2 + 0.02, z);
  return { position, rotationY };
}

/**
 * Finds the floor straight down from (x, z) — these photos are scattered
 * round the room, not hung on a wall, so a spot is just "is there floor
 * here". Takes the lowest hit (same reasoning as findSpotNear: a shelf or
 * low ceiling on the way down shouldn't be mistaken for the floor).
 * Returns null if nothing is hit within `far`. `object` is the mesh the
 * spot is on.
 */
export function findFloorSpot(group, x, z, { aboveY = 20, far = 40 } = {}) {
  wallRaycaster.set(new THREE.Vector3(x, aboveY, z), new THREE.Vector3(0, -1, 0));
  wallRaycaster.far = far;
  const hits = wallRaycaster.intersectObject(group, true);
  const hit = hits[hits.length - 1];
  if (!hit) return null;
  return { position: new THREE.Vector3(x, hit.point.y + FRAME_DEPTH / 2 + 0.01, z), object: hit.object };
}

/**
 * Places a pickupable office picture in a loaded room and wires it into
 * the E-interact system: picking it up removes it from the scene and
 * records it in the shared item state (see itemState in main.js). Does
 * nothing if this item was already collected on a previous visit — a
 * picture found and taken shouldn't reappear if the room reloads.
 *
 * @param {{ group: THREE.Group, interactables?: Array }} room
 * @param {{ hasCollected: (id: string) => boolean, collect: (id: string) => void }} items
 * @param {string} itemId unique id, also used as the collected/presented key
 * @param {string} imageUrl
 * @param {THREE.Vector3} position floor height (see findFloorSpot)
 * @param {number} rotationY
 * @param {{ tilt?: number }} [options] tilt: a small extra lean off dead
 *   flat (radians), so a kicked-around photo doesn't look laid out by hand
 * @returns {THREE.Group | null} the placed picture (for pulseGlow), or
 *   null if it was already collected and nothing was placed
 */
export function placeOfficePicture(room, items, itemId, imageUrl, position, rotationY, { tilt = 0 } = {}) {
  if (items.hasCollected(itemId)) return null;

  const picture = createOfficePicture(imageUrl);
  picture.position.copy(position);
  // Face-up on the floor (the photo's local +Z, flipped onto world +Y by
  // the -90° lean), yawed around that same up axis, plus a small extra
  // tilt off dead flat.
  picture.rotation.order = 'YXZ';
  picture.rotation.set(-Math.PI / 2 + tilt, rotationY, 0);
  room.group.add(picture);
  picture.updateMatrixWorld(true);

  const objects = [];
  picture.traverse((child) => {
    if (child.isMesh) objects.push(child);
  });

  const pickup = {
    objects,
    prompt: () => 'Pick up photo',
    interact: () => {
      picture.removeFromParent();
      items.collect(itemId);
      // Drop it from the room's E list too: a raycast still hits meshes
      // that have left the scene, so its prompt would otherwise linger
      // over the empty spot. main.js uses this same array for the room.
      const list = room.interactables;
      const index = list.indexOf(pickup);
      if (index !== -1) list.splice(index, 1);
    },
  };
  room.interactables = [...(room.interactables ?? []), pickup];
  return picture;
}

/**
 * Drops each not-yet-collected picture on the floor somewhere in the room
 * (not hung on a wall — these are scattered/kicked around the circus, not
 * a gallery), found by sweeping a grid of origins around `spawn` rather
 * than just `spawn` itself — measured against the real Circus Lobby, a
 * single central sweep found a usable spot on only 2 of 16 rays within a
 * sensible range (it's a large, mostly-open room, not a tight one), so one
 * origin alone can't reliably find enough spots for 5 pictures. A grid
 * (origins spread `gridStep` apart out to `gridRadius` steps from spawn,
 * swept in a random order, each sampled at several random points within
 * its own cell rather than just its centre) pools far more candidates than
 * needed, and which of them actually get used is itself randomized —
 * measured against the real Lobby, these defaults reliably spread the 5
 * picked spots well past the minimum `spacing` apart, often 50m+ end to
 * end, instead of landing in one cluster.
 *
 * Spacing alone doesn't keep the pictures apart in the Lobby: its toy
 * blocks are 16m cubes stacked into walls, so two floor spots that far
 * apart could still read as "the same patch of floor". At most one
 * picture goes on each `zoneOf` zone (by default the mesh it's resting on;
 * the Lobby maps spots to its named landmarks), unless there are fewer
 * zones than pictures.
 *
 * A room that knows where the player can walk passes `isOpen` and
 * `isReachable`: grid origins off that floor are skipped (some land sealed
 * inside props, and sweep their insides), and so are spots no walkable
 * floor can see and reach.
 *
 * The shared item state caches plain placement data for the whole attempt.
 * Returning after a partial hand-in preserves the remaining photos' spots.
 * Resetting that state (retry or New Game) generates a fresh random layout.
 *
 * @param {{ group: THREE.Group, interactables?: Array }} room
 * @param {object} items shared item state (see src/state/level2Items.js)
 * @param {{ id: string, url: string }[]} pictures
 * @param {{ x: number, y: number, z: number }} spawn grid centre (a point
 *   inside the room, usually its own spawn)
 * @param {Array<{ x: number, z: number } | null | undefined>} [keepClear]
 *   points to stay clear of (doors, NPCs) — nullish entries are skipped
 * @returns {{ update: (deltaSeconds: number) => void, remaining: () => THREE.Vector3[] }}
 *   update advances the placed pictures' glow (see pulseGlow) — call every
 *   frame the room's loaded, same as any other room.update. remaining lists
 *   where the pictures not yet picked up are (for hints).
 */
export function scatterPictures(room, items, pictures, spawn, keepClear = [], {
  // Raised from 8/1.5, then again from 16/4 (repeated playtest feedback:
  // still too easy, finding one put you right next to the next). The wider
  // grid sweep above already pools candidates well past this range, so
  // there's still enough of a pool to choose from at the larger spacing.
  spacing = 30, keepClearRadius = 4,
  gridStep = 10, gridRadius = 4, rng = Math.random, zoneOf = (spot) => spot.object,
  isOpen = () => true, isReachable = () => true,
  // { id, x, z }: forces this one picture onto the floor near a fixed
  // point instead of the random pool (e.g. a landmark players should
  // always find one photo at). Falls back to the random pool for it if
  // nothing's found there. The rest still keep spacing clear of it.
  pinned = null,
} = {}) {
  const layout = items.getPhotoLayout(() => choosePictureSpots(room, pictures, spawn, keepClear, {
    spacing, keepClearRadius, gridStep, gridRadius, rng, zoneOf, isOpen, isReachable, pinned,
  }));
  const placed = [];
  for (const { id, url } of pictures) {
    const spot = layout.find(entry => entry?.id === id);
    const picture = spot && placeOfficePicture(room, items, id, url, spot.position, spot.rotationY, { tilt: spot.tilt });
    if (picture) placed.push(picture);
  }
  let elapsed = 0;
  return {
    update(deltaSeconds) {
      elapsed += deltaSeconds;
      pulseGlow(placed, elapsed);
    },
    remaining: () => placed.filter((picture) => picture.parent).map((picture) => picture.position),
  };
}

const FLOOR_SEARCH_ABOVE = 25; // clears the Lobby's 16 m toy-block stacks with room to spare
const FLOOR_SEARCH_FAR = 45;
const TILT_RANGE = 0.1; // ~6°, so a dropped/kicked photo doesn't look laid out by hand

function choosePictureSpots(room, pictures, spawn, keepClear, {
  spacing, keepClearRadius, gridStep, gridRadius, rng, zoneOf, isOpen, isReachable, pinned,
}) {
  const avoid = keepClear.filter(Boolean);
  const aboveY = spawn.y + FLOOR_SEARCH_ABOVE;

  let pinnedSpot = null;
  if (pinned) {
    // An explicit y skips the raycast: some surfaces (a stair landing with
    // open space underneath it, say) have real floor visible below them
    // too, and "lowest hit" (the right call for skipping a shelf/ceiling
    // above the floor almost everywhere else) finds the wrong one there.
    const spot = Number.isFinite(pinned.y)
      ? { position: new THREE.Vector3(pinned.x, pinned.y + FRAME_DEPTH / 2 + 0.01, pinned.z), object: null }
      : findFloorSpot(room.group, pinned.x, pinned.z, { aboveY, far: FLOOR_SEARCH_FAR });
    if (spot) {
      spot.rotationY = rng() * Math.PI * 2;
      spot.tilt = (rng() * 2 - 1) * TILT_RANGE;
      spot.zone = zoneOf(spot);
      pinnedSpot = spot;
    }
  }
  // Falls back to the random pool if the pinned point found no floor.
  const remaining = pinnedSpot ? pictures.filter((picture) => picture.id !== pinned.id) : pictures;

  const origins = [];
  for (let gx = -gridRadius; gx <= gridRadius; gx++) {
    for (let gz = -gridRadius; gz <= gridRadius; gz++) {
      const origin = new THREE.Vector3(spawn.x + gx * gridStep, spawn.y, spawn.z + gz * gridStep);
      if (isOpen(origin)) origins.push(origin);
    }
  }
  for (let i = origins.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [origins[i], origins[j]] = [origins[j], origins[i]];
  }

  const spots = [];
  const zones = new Set(pinnedSpot ? [pinnedSpot.zone] : []);
  const wanted = remaining.length * 3; // a bigger pool than needed, so the spacing/keep-clear filters still have real room to choose from
  for (const origin of origins) {
    if (spots.length >= wanted && zones.size >= remaining.length) break;
    const startAngle = rng() * Math.PI * 2;
    for (let i = 0; i < 16; i++) {
      const angle = startAngle + (i / 16) * Math.PI * 2;
      // Spread candidates across the whole grid cell, not a thin ring
      // around its centre (sqrt() keeps them uniform over the disc area
      // instead of bunched near the middle).
      const radius = (gridStep / 2) * Math.sqrt(rng());
      const x = origin.x + Math.sin(angle) * radius, z = origin.z + Math.cos(angle) * radius;
      const spot = findFloorSpot(room.group, x, z, { aboveY, far: FLOOR_SEARCH_FAR });
      if (!spot) continue;
      if (avoid.some((point) => Math.hypot(point.x - spot.position.x, point.z - spot.position.z) < keepClearRadius)) continue;
      if (pinnedSpot && pinnedSpot.position.distanceTo(spot.position) < spacing) continue;
      if (spots.some((other) => other.position.distanceTo(spot.position) < spacing)) continue;
      if (!isReachable(spot)) continue;
      spot.rotationY = rng() * Math.PI * 2;
      spot.tilt = (rng() * 2 - 1) * TILT_RANGE;
      spot.zone = zoneOf(spot);
      zones.add(spot.zone);
      spots.push(spot);
    }
  }
  // Which of the (likely more than enough) candidates actually get used is
  // itself randomized, not just their search order — otherwise the pictures
  // would always cluster around whichever origins happen first in the grid.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const chosen = [];
  const usedZones = new Set(pinnedSpot ? [pinnedSpot.zone] : []);
  for (const spot of spots) {
    if (chosen.length >= remaining.length) break;
    if (usedZones.has(spot.zone)) continue;
    usedZones.add(spot.zone);
    chosen.push(spot);
  }
  // Fewer zones than pictures (a small room): doubling up beats a missing photo.
  for (const spot of spots) {
    if (chosen.length >= remaining.length) break;
    if (!chosen.includes(spot)) chosen.push(spot);
  }

  const results = new Map();
  if (pinnedSpot) {
    results.set(pinned.id, { id: pinned.id, position: pinnedSpot.position, rotationY: pinnedSpot.rotationY, tilt: pinnedSpot.tilt });
  }
  remaining.forEach(({ id }, i) => {
    const spot = chosen[i];
    if (spot) results.set(id, { id, position: spot.position, rotationY: spot.rotationY, tilt: spot.tilt });
  });
  return pictures.map(({ id }) => results.get(id) ?? null);
}

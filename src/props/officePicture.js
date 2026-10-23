import * as THREE from 'three';

// One of the "real C&A office" reference photos (Level 2's three scattered
// collectibles). Simple framed-photo prop: a wood box for the frame, a
// textured plane for the photo, standing proud of the frame face so it
// never z-fights.
const FRAME_WIDTH = 0.55;
const FRAME_HEIGHT = 0.42;
const FRAME_DEPTH = 0.035;
const FRAME_BORDER = 0.045;

// A found-but-not-yet-collected picture glows softly — a point light plus
// a bit of emissive warmth on the photo itself, pulsing slowly so it reads
// as "something's here" from across a big room without looking like a
// blinking alarm. See pulseGlow(), driven from the owning room's update().
const GLOW_COLOR = 0xfff2c0;
const GLOW_LIGHT_INTENSITY = 1.6;
const GLOW_LIGHT_RANGE = 3.5;
const GLOW_PULSE_HZ = 0.6;
const GLOW_EMISSIVE_BASE = 0.35;
const GLOW_EMISSIVE_SWING = 0.25;

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

  // Stood out a little further than the photo itself, so the light spills
  // onto the wall and floor around it rather than just the frame's face.
  const glow = new THREE.PointLight(GLOW_COLOR, GLOW_LIGHT_INTENSITY, GLOW_LIGHT_RANGE, 2);
  glow.position.z = FRAME_DEPTH / 2 + 0.3;
  group.add(glow);

  group.userData.glow = { light: glow, material: photoMaterial };
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
    const { light, material } = picture.userData.glow;
    light.intensity = GLOW_LIGHT_INTENSITY * (0.6 + 0.4 * wave);
    material.emissiveIntensity = GLOW_EMISSIVE_BASE + GLOW_EMISSIVE_SWING * wave;
  }
}

const wallRaycaster = new THREE.Raycaster();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Finds a spot flush against whatever wall is hit casting from `origin`
 * toward `direction`, facing back out into the room — a quick way to hang
 * a picture without needing to know a room's exact furniture layout.
 * Returns null if nothing is hit within `maxDistance`.
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
  return { position, rotationY };
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
 * @param {THREE.Vector3} position
 * @param {number} rotationY
 * @param {{ tiltBack?: number }} [options] tiltBack: radians to lean the
 *   top back, e.g. a picture propped against a wall rather than standing
 * @returns {THREE.Group | null} the placed picture (for pulseGlow), or
 *   null if it was already collected and nothing was placed
 */
export function placeOfficePicture(room, items, itemId, imageUrl, position, rotationY, { tiltBack = 0 } = {}) {
  if (items.hasCollected(itemId)) return null;

  const picture = createOfficePicture(imageUrl);
  picture.position.copy(position);
  // Yaw first, then the lean about its own left-right axis; -X tips the
  // top away from the photo's face (+Z).
  picture.rotation.order = 'YXZ';
  picture.rotation.set(-tiltBack, rotationY, 0);
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
 * Hangs each not-yet-collected picture on a different wall, found by
 * sweeping outward from a grid of origins around `spawn` rather than just
 * `spawn` itself — measured against the real Circus Lobby, a single
 * central sweep found a usable wall on only 2 of 16 rays within a sensible
 * mounting distance (it's a large, mostly-open room, not a tight one), so
 * one origin alone can't reliably find enough spots for 5 pictures. A grid
 * (origins spread `gridStep` apart out to `gridRadius` steps from spawn,
 * swept in a random order) pools far more candidates — the same check
 * found 26 usable, well-spaced spots that way. Spots too close to another
 * picture or to anything in `keepClear` are passed over; this is a one-time
 * cost at room load (measured ~140ms for a 5x5 grid against the real
 * Lobby), not a per-frame one.
 *
 * Each call starts from a random grid order and a random sweep angle per
 * origin, so a replay (the search timer running out, or just leaving and
 * coming back) doesn't put them back exactly where they were.
 *
 * @param {{ group: THREE.Group, interactables?: Array }} room
 * @param {object} items shared item state (see src/state/level2Items.js)
 * @param {{ id: string, url: string }[]} pictures
 * @param {{ x: number, y: number, z: number }} spawn grid centre (a point
 *   inside the room, usually its own spawn)
 * @param {Array<{ x: number, z: number } | null | undefined>} [keepClear]
 *   points to stay clear of (doors, NPCs) — nullish entries are skipped
 * @returns {{ update: (deltaSeconds: number) => void }} advances the
 *   placed pictures' glow (see pulseGlow) — call every frame the room's
 *   loaded, same as any other room.update
 */
export function scatterPictures(room, items, pictures, spawn, keepClear = [], {
  height = 1.5, spacing = 2, keepClearRadius = 1.5, maxDistance = 12,
  gridStep = 7, gridRadius = 2,
} = {}) {
  const avoid = keepClear.filter(Boolean).map((point) => new THREE.Vector3(point.x, spawn.y + height, point.z));

  const origins = [];
  for (let gx = -gridRadius; gx <= gridRadius; gx++) {
    for (let gz = -gridRadius; gz <= gridRadius; gz++) {
      origins.push(new THREE.Vector3(spawn.x + gx * gridStep, spawn.y + height, spawn.z + gz * gridStep));
    }
  }
  for (let i = origins.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [origins[i], origins[j]] = [origins[j], origins[i]];
  }

  const spots = [];
  const wanted = pictures.length * 3; // a bigger pool than needed, so the spacing/keep-clear filters still have real room to choose from
  for (const origin of origins) {
    if (spots.length >= wanted) break;
    const startAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < 16; i++) {
      const angle = startAngle + (i / 16) * Math.PI * 2;
      const spot = findWallSpot(room.group, origin, new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)), maxDistance);
      if (!spot) continue;
      const flat = new THREE.Vector3(spot.position.x, spawn.y + height, spot.position.z);
      if (avoid.some((point) => point.distanceTo(flat) < keepClearRadius)) continue;
      if (spots.some((other) => other.position.distanceTo(spot.position) < spacing)) continue;
      spots.push(spot);
    }
  }
  // Which of the (likely more than enough) candidates actually get used is
  // itself randomized, not just their search order — otherwise the pictures
  // would always cluster around whichever origins happen first in the grid.
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  const placed = [];
  pictures.forEach(({ id, url }, i) => {
    const spot = spots[i];
    const picture = spot && placeOfficePicture(room, items, id, url, spot.position, spot.rotationY);
    if (picture) placed.push(picture);
  });
  let elapsed = 0;
  return {
    update(deltaSeconds) {
      elapsed += deltaSeconds;
      pulseGlow(placed, elapsed);
    },
  };
}

import * as THREE from 'three';

// One of the "real C&A office" reference photos (Level 2's three scattered
// collectibles). Simple framed-photo prop: a wood box for the frame, a
// textured plane for the photo, standing proud of the frame face so it
// never z-fights.
const FRAME_WIDTH = 0.55;
const FRAME_HEIGHT = 0.42;
const FRAME_DEPTH = 0.035;
const FRAME_BORDER = 0.045;

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
 * @returns {THREE.Group} a small wall-hangable framed picture
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

  const photo = new THREE.Mesh(
    new THREE.PlaneGeometry(FRAME_WIDTH - FRAME_BORDER * 2, FRAME_HEIGHT - FRAME_BORDER * 2),
    new THREE.MeshStandardMaterial({ map: getTexture(imageUrl), roughness: 0.85 }),
  );
  photo.name = 'OfficePicturePhoto';
  photo.position.z = FRAME_DEPTH / 2 + 0.002;
  group.add(photo);

  return group;
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
 */
export function placeOfficePicture(room, items, itemId, imageUrl, position, rotationY, { tiltBack = 0 } = {}) {
  if (items.hasCollected(itemId)) return;

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
}

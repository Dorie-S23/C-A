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
 */
export function placeOfficePicture(room, items, itemId, imageUrl, position, rotationY) {
  if (items.hasCollected(itemId)) return;

  const picture = createOfficePicture(imageUrl);
  picture.position.copy(position);
  picture.rotation.y = rotationY;
  room.group.add(picture);
  picture.updateMatrixWorld(true);

  const objects = [];
  picture.traverse((child) => {
    if (child.isMesh) objects.push(child);
  });

  room.interactables = [...(room.interactables ?? []), {
    objects,
    prompt: () => 'Pick up photo',
    interact: () => {
      picture.removeFromParent();
      items.collect(itemId);
    },
  }];
}

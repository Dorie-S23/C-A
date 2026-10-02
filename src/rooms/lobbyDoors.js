import * as THREE from 'three';

// The bedroom doors lining the lobby hallway are all instances of one mesh.
// The export gives them no meaningful names, so they are found as every
// mesh sharing this reference door's geometry.
const REFERENCE_DOOR = 'Plane071';

const OPEN_ANGLE = Math.PI / 2;
const SWING_SPEED = 2.2; // radians per second
// The doors are decoration on a solid wall, so an open door reveals a flat
// black doorway — the "void" the show's doors lead into.
const DOORWAY_COLOR = 0x050505;
const DOORWAY_WALL_GAP = 0.15;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Makes every hallway door swing open/closed on its hinges.
 *
 * Each door model is one mesh holding a frame, hinge plates, a flat door
 * panel and a handle. It's split so the frame and hinges stay put while
 * the panel and handle (the "leaf") swing.
 *
 * @param {THREE.Group} group the loaded lobby
 * @param {THREE.Vector3} spawn a point inside the lobby (doors swing toward it)
 * @param {Array<{ mesh: THREE.Mesh, box: THREE.Box3, dynamic?: boolean }>} collisionMeshes
 *   the room's collision entries; each leaf is added, flagged dynamic so
 *   main.js keeps its box in step with the swing
 * @returns {{ interactables: Array, update: (deltaSeconds: number) => void }}
 */
export function setupLobbyDoors(group, spawn, collisionMeshes) {
  const reference = group.getObjectByName(REFERENCE_DOOR);
  if (!reference) return { interactables: [], update() {} };

  const frames = [];
  group.traverse((child) => {
    if (child.isMesh && child.geometry === reference.geometry) frames.push(child);
  });
  group.updateMatrixWorld(true);

  const parts = splitDoorGeometry(reference.geometry);
  const doors = frames.map((frame) => createDoor(group, frame, parts, spawn));
  for (const door of doors) addDoorway(group, door, doors);
  for (const door of doors) {
    collisionMeshes.push({ mesh: door.leaf, box: new THREE.Box3().setFromObject(door.leaf), dynamic: true });
  }

  return {
    interactables: doors.map((door) => ({
      objects: [door.leaf, door.frame, door.doorway].filter(Boolean),
      prompt: () => (door.open ? 'Close door' : 'Open door'),
      interact: () => {
        door.open = !door.open;
      },
    })),
    update(deltaSeconds) {
      for (const door of doors) swing(door, deltaSeconds);
    },
  };
}

/**
 * Splits the shared door geometry into frame and leaf by connected piece.
 * The panel is the piece that's flat along one horizontal axis; the leaf
 * is the panel plus everything lying inside its outline (the handle).
 * Hinge plates overhang the panel's edge, so they stay with the frame —
 * and mark that edge as the hinge side.
 */
function splitDoorGeometry(geometry) {
  const pieces = connectedPieces(geometry);

  const flatness = (box) => {
    const size = box.getSize(new THREE.Vector3());
    return Math.min(size.x, size.z) / Math.max(size.x, size.z);
  };
  const faceArea = (box) => {
    const size = box.getSize(new THREE.Vector3());
    return size.y * Math.max(size.x, size.z);
  };
  const panel = pieces
    .filter((piece) => flatness(piece.box) < 0.05)
    .reduce((best, piece) => (!best || faceArea(piece.box) > faceArea(best.box) ? piece : best), null);

  // Local axes: y is up, `thin` is through the door, `wide` is across it.
  const panelSize = panel.box.getSize(new THREE.Vector3());
  const thin = panelSize.x < panelSize.z ? 'x' : 'z';
  const wide = thin === 'x' ? 'z' : 'x';
  const inside = (box) =>
    box.min.y >= panel.box.min.y && box.max.y <= panel.box.max.y &&
    box.min[wide] > panel.box.min[wide] && box.max[wide] < panel.box.max[wide];

  const leafPieces = pieces.filter((piece) => piece === panel || inside(piece.box));
  const framePieces = pieces.filter((piece) => !leafPieces.includes(piece));

  // The handle sits away from the hinges, so hinge on the far edge from it.
  const leafCenter = new THREE.Box3();
  for (const piece of leafPieces) if (piece !== panel) leafCenter.union(piece.box);
  const panelMid = (panel.box.min[wide] + panel.box.max[wide]) / 2;
  const handleMid = leafCenter.isEmpty() ? panelMid : leafCenter.getCenter(new THREE.Vector3())[wide];
  const hingeEdge = handleMid > panelMid ? panel.box.min[wide] : panel.box.max[wide];

  const hinge = panel.box.getCenter(new THREE.Vector3());
  hinge[wide] = hingeEdge;

  return {
    frame: subGeometry(geometry, framePieces),
    leaf: subGeometry(geometry, leafPieces),
    panelBox: panel.box,
    hinge,
  };
}

/** Groups triangles into pieces that share vertices (by position, since seams duplicate them). */
function connectedPieces(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const parent = Array.from({ length: position.count }, (_, i) => i);
  const find = (a) => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const union = (a, b) => {
    parent[find(a)] = find(b);
  };

  const byPosition = new Map();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
    if (byPosition.has(key)) union(i, byPosition.get(key));
    else byPosition.set(key, i);
  }
  const vertex = (t) => (index ? index.getX(t) : t);
  const triangleCount = (index ? index.count : position.count) / 3;
  for (let t = 0; t < triangleCount; t++) {
    union(vertex(t * 3 + 1), vertex(t * 3));
    union(vertex(t * 3 + 2), vertex(t * 3));
  }

  const pieces = new Map();
  const point = new THREE.Vector3();
  for (let t = 0; t < triangleCount; t++) {
    const root = find(vertex(t * 3));
    if (!pieces.has(root)) pieces.set(root, { triangles: [], box: new THREE.Box3() });
    const piece = pieces.get(root);
    piece.triangles.push(t);
    for (let k = 0; k < 3; k++) piece.box.expandByPoint(point.fromBufferAttribute(position, vertex(t * 3 + k)));
  }
  return [...pieces.values()];
}

/** A geometry drawing only the given pieces' triangles, sharing the original's vertex data. */
function subGeometry(geometry, pieces) {
  const sub = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(geometry.attributes)) sub.setAttribute(name, attribute);

  const indices = [];
  const box = new THREE.Box3();
  for (const piece of pieces) {
    box.union(piece.box);
    for (const t of piece.triangles) {
      for (let k = 0; k < 3; k++) indices.push(geometry.index ? geometry.index.getX(t * 3 + k) : t * 3 + k);
    }
  }
  sub.setIndex(indices);
  // computeBoundingBox() would measure every shared vertex, not just this piece's.
  sub.boundingBox = box;
  sub.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  return sub;
}

/**
 * Swaps the door mesh for its frame and hangs a separate leaf from a pivot
 * on the hinge line, swinging out toward the lobby.
 */
function createDoor(group, frame, parts, spawn) {
  frame.geometry = parts.frame;

  const leaf = new THREE.Mesh(parts.leaf, frame.material);
  leaf.name = `${frame.name}Leaf`;
  leaf.castShadow = frame.castShadow;
  leaf.receiveShadow = frame.receiveShadow;
  leaf.position.copy(frame.position);
  leaf.quaternion.copy(frame.quaternion);
  leaf.scale.copy(frame.scale);
  frame.parent.add(leaf);
  leaf.updateMatrixWorld(true);

  const hinge = frame.localToWorld(parts.hinge.clone());
  const pivot = new THREE.Group();
  pivot.name = `${frame.name}Hinge`;
  group.add(pivot);
  pivot.position.copy(group.worldToLocal(hinge.clone()));
  pivot.updateMatrixWorld(true);
  pivot.attach(leaf);

  // Whichever swing direction carries the leaf toward the lobby.
  const leafCenter = new THREE.Box3().setFromObject(leaf).getCenter(new THREE.Vector3());
  const towardRoom = new THREE.Vector3().subVectors(spawn, leafCenter).setY(0);
  const across = leafCenter.clone().sub(hinge).applyAxisAngle(UP, OPEN_ANGLE);
  const direction = across.dot(towardRoom) > 0 ? 1 : -1;

  return {
    frame,
    leaf,
    pivot,
    parts,
    doorway: null,
    towardRoom: towardRoom.normalize(),
    open: false,
    angle: 0,
    openAngle: direction * OPEN_ANGLE,
  };
}

/** A black panel on the wall behind the door leaf, seen once it swings open. */
function addDoorway(group, door, doors) {
  const panelBox = door.parts.panelBox.clone().applyMatrix4(door.frame.matrixWorld);
  const center = panelBox.getCenter(new THREE.Vector3());
  const intoWall = door.towardRoom.clone().negate();
  // Snap to the panel's through-axis so the doorway sits square to the wall.
  if (Math.abs(intoWall.x) > Math.abs(intoWall.z)) intoWall.set(Math.sign(intoWall.x), 0, 0);
  else intoWall.set(0, 0, Math.sign(intoWall.z));

  const doorMeshes = doors.flatMap((d) => [d.frame, d.leaf]);
  const wallHit = new THREE.Raycaster(center, intoWall, 0, 3)
    .intersectObject(group, true)
    .find((hit) => hit.object.isMesh && !doorMeshes.includes(hit.object));
  if (!wallHit) return;

  const size = panelBox.getSize(new THREE.Vector3());
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(size.x, size.z), size.y),
    new THREE.MeshBasicMaterial({ color: DOORWAY_COLOR }),
  );
  doorway.name = `${door.frame.name}Doorway`;
  // The hallway wall leans slightly, so a doorway hugging it at mid-height
  // would sink behind it near the top. Stand it off the wall — but still
  // behind the closed panel.
  const gap = Math.min(DOORWAY_WALL_GAP, Math.max(wallHit.distance - 0.03, 0));
  doorway.position.copy(wallHit.point).addScaledVector(intoWall, -gap);
  doorway.position.y = center.y;
  doorway.lookAt(doorway.position.clone().sub(intoWall));
  group.add(doorway);
  door.doorway = doorway;
}

function swing(door, deltaSeconds) {
  const target = door.open ? door.openAngle : 0;
  if (door.angle === target) return;

  const step = SWING_SPEED * deltaSeconds;
  const remaining = target - door.angle;
  door.angle = Math.abs(remaining) <= step ? target : door.angle + Math.sign(remaining) * step;
  // Ease in and out over the swing rather than moving at a constant rate.
  const progress = door.angle / door.openAngle;
  door.pivot.rotation.y = door.openAngle * (0.5 - 0.5 * Math.cos(Math.PI * progress));
  door.pivot.updateMatrixWorld(true);
}

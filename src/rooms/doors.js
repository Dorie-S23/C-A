import * as THREE from 'three';

const OPEN_ANGLE = Math.PI / 2;

/**
 * Hangs a two-piece "Door Frame"/"Door Slab" door on its hinge and sets it
 * straight to its open pose; makeDoorOpenable() below turns that into a
 * door the player opens and closes with E.
 * Shared by every room built from this convention (Pomni's, Kaufmo's,
 * Ribbit's, and Dorm Hall's many numbered bedroom doors).
 *
 * The hinge goes on the edge opposite the doorknob: every slab in these
 * models carries its handle as a separate "Metal" part, so its position
 * says which end the knob is at. Of the two ways the leaf can swing on that
 * hinge (+/-90°), it keeps whichever sweeps it toward `towardPoint` rather
 * than through the wall. A slab without a recognisable handle falls back
 * to trying both edges.
 *
 * @param {THREE.Group} group the loaded room
 * @param {string} frameName
 * @param {string} slabName
 * @param {THREE.Vector3} towardPoint a point on the side the leaf should swing toward
 * @param {Array<{ mesh: THREE.Mesh, box: THREE.Box3 }>} [collisionMeshes]
 *   fixes the slab's collision entry up after it moves, if it has one
 * @returns {{ frame: THREE.Mesh, slab: THREE.Mesh, frameBox: THREE.Box3 } | null}
 */
export function openHingedDoor(group, frameName, slabName, towardPoint, collisionMeshes) {
  const frame = group.getObjectByName(frameName);
  const slab = group.getObjectByName(slabName);
  if (!frame || !slab) return null;
  group.updateMatrixWorld(true);

  const frameBox = new THREE.Box3().setFromObject(frame);
  const slabBox = new THREE.Box3().setFromObject(slab);
  const slabSize = slabBox.getSize(new THREE.Vector3());

  // The panel is wide along one horizontal axis and thin along the other
  // (the wall it's set into); hinge on whichever edge, along the wide
  // axis, swings the leaf toward towardPoint rather than through the wall.
  const wideAxis = slabSize.x >= slabSize.z ? 'x' : 'z';
  const minHinge = slabBox.getCenter(new THREE.Vector3());
  minHinge[wideAxis] = slabBox.min[wideAxis];
  const maxHinge = minHinge.clone();
  maxHinge[wideAxis] = slabBox.max[wideAxis];

  const toward = new THREE.Vector3().subVectors(towardPoint, slabBox.getCenter(new THREE.Vector3())).setY(0).normalize();
  const sweepsToward = (hinge, angle) => {
    const farCorner = slabBox.getCenter(new THREE.Vector3());
    farCorner[wideAxis] = hinge[wideAxis] === minHinge[wideAxis] ? slabBox.max[wideAxis] : slabBox.min[wideAxis];
    const swung = farCorner.clone().sub(hinge).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(hinge);
    return swung.clone().sub(slabBox.getCenter(new THREE.Vector3())).setY(0).dot(toward);
  };

  // Try the hinge edge(s) at +/-90 and keep whichever actually swings the
  // leaf toward `towardPoint`.
  // The hinge edge is the one furthest from the knob.
  const knob = knobPosition(slab);
  const hinges = knob
    ? [Math.abs(knob[wideAxis] - minHinge[wideAxis]) > Math.abs(knob[wideAxis] - maxHinge[wideAxis]) ? minHinge : maxHinge]
    : [minHinge, maxHinge];

  let best = { score: -Infinity, hinge: hinges[0], angle: OPEN_ANGLE };
  for (const hinge of hinges) {
    for (const angle of [OPEN_ANGLE, -OPEN_ANGLE]) {
      const score = sweepsToward(hinge, angle);
      if (score > best.score) best = { score, hinge, angle };
    }
  }

  const pivot = new THREE.Group();
  pivot.name = `${frameName}Hinge`;
  group.add(pivot);
  pivot.position.copy(group.worldToLocal(best.hinge.clone()));
  pivot.updateMatrixWorld(true);
  pivot.attach(slab);
  pivot.rotation.y = best.angle;
  pivot.updateMatrixWorld(true);

  // collectCollisionMeshes() already boxed the slab at its closed pose —
  // fix that entry up now, or the open doorway would still invisibly
  // block at the old panel position.
  const slabCollision = collisionMeshes?.find((entry) => entry.mesh === slab);
  if (slabCollision) slabCollision.box.setFromObject(slab);

  return { frame, slab, frameBox };
}

const HANDLE_MATERIAL = /metal|handle|knob/i;

/** World-space centre of the slab's handle part, or null if it has none. */
function knobPosition(slab) {
  const box = new THREE.Box3();
  slab.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (materials.some((m) => HANDLE_MATERIAL.test(m?.name ?? ''))) box.expandByObject(child);
  });
  return box.isEmpty() ? null : box.getCenter(new THREE.Vector3());
}

const SWING_SHARPNESS = 3;  // how quickly an opened door swings
const OPEN_RANGE = 2.6;     // metres from the doorway that "close enough to open/close" means
const PASSABLE = 0.8;       // fraction of the swing after which the doorway lets you through

/**
 * Turns a door openHingedDoor() hung into one the player opens and closes:
 * it starts shut, and standing within OPEN_RANGE of it offers "E — Open
 * door" / "E — Close door", swinging it (animated in update()). Only while
 * it's (mostly) open does its portal carry the player through. Other parts riding on the leaf (a character's icon or
 * name plate) are hung on the same hinge so they swing with it.
 *
 * The room adds `interactable` to its room.interactables and calls update()
 * from its room.update; both are left to the room because rooms assign
 * those after their doors are set up.
 *
 * @param {{ group: THREE.Group, collisionMeshes: Array, interactables?: Array }} room
 * @param {{ slab: THREE.Object3D, frameBox: THREE.Box3 }} hinged openHingedDoor's result
 * @param {{ portal?: { disabled?: boolean }, attach?: THREE.Object3D[] }} [options]
 */
export function makeDoorOpenable(room, hinged, { portal, attach = [] } = {}) {
  const pivot = hinged.slab.parent;
  const openAngle = pivot.rotation.y; // whichever way openHingedDoor found swings clear

  // Shut it, and hang any riders on the hinge at the shut pose, where
  // they still line up with the slab.
  pivot.rotation.y = 0;
  pivot.updateMatrixWorld(true);
  const parts = [hinged.slab];
  for (const rider of attach.filter(Boolean)) {
    pivot.attach(rider);
    parts.push(rider);
  }

  // Dynamic, so main.js keeps the collision boxes wherever the leaf is.
  const meshes = [];
  for (const part of parts) part.traverse((child) => { if (child.isMesh) meshes.push(child); });
  for (const entry of room.collisionMeshes) {
    if (meshes.includes(entry.mesh)) entry.dynamic = true;
  }

  // "Close enough to open" is measured from the doorway's floor, centre.
  const anchor = new THREE.Object3D();
  anchor.position.copy(hinged.frameBox.getCenter(new THREE.Vector3()));
  anchor.position.y = hinged.frameBox.min.y;
  room.group.add(anchor);

  let angle = 0;
  let target = 0;
  if (portal) portal.disabled = true;

  const interactable = {
    objects: meshes,
    anchor,
    radius: OPEN_RANGE,
    prompt: () => (target === 0 ? 'Open door' : 'Close door'),
    interact: () => (target === 0 ? control.open() : control.close()),
  };

  function offer(available) {
    const list = room.interactables ?? (room.interactables = []);
    const index = list.indexOf(interactable);
    if (available && index === -1) list.push(interactable);
    if (!available && index !== -1) list.splice(index, 1);
  }

  const control = {
    interactable,
    get isOpen() { return target !== 0; },
    open({ immediate = false } = {}) {
      target = openAngle;
      if (immediate) angle = openAngle;
      offer(true);
    },
    /** Swings it shut again; it can be reopened with E. */
    close({ immediate = false } = {}) {
      target = 0;
      if (immediate) angle = 0;
      offer(true);
    },
    /** Shut and not operable (e.g. Level 1's knock scene) until open() or close() is called. */
    lock() {
      target = 0;
      angle = 0;
      offer(false);
    },
    update(deltaSeconds) {
      angle = THREE.MathUtils.damp(angle, target, SWING_SHARPNESS, deltaSeconds);
      pivot.rotation.y = angle;
      if (portal) portal.disabled = Math.abs(angle) < Math.abs(openAngle) * PASSABLE;
    },
  };
  pivot.rotation.y = angle;
  return control;
}

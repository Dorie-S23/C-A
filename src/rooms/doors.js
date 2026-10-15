import * as THREE from 'three';

const OPEN_ANGLE = Math.PI / 2;

/**
 * Swings a two-piece "Door Frame"/"Door Slab" door open on load (it's set
 * straight to its open pose, not an interactable — nothing closes it).
 * Shared by every room built from this convention (Pomni's, Kaufmo's,
 * Ribbit's, and Dorm Hall's many numbered bedroom doors).
 *
 * Nothing in the geometry marks which edge is the real hinge, so instead of
 * guessing, this tries both edges at +/-90° and keeps whichever actually
 * sweeps the leaf toward `towardPoint` (the other three combinations swing
 * it through the wall into whatever's on the other side).
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

  // Try both hinge edges at +/-90 and keep whichever actually swings the
  // leaf toward `towardPoint`.
  let best = { score: -Infinity, hinge: minHinge, angle: OPEN_ANGLE };
  for (const hinge of [minHinge, maxHinge]) {
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

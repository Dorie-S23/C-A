import * as THREE from 'three';

/**
 * Derive this bedroom's hinge from the real panel, handle and frame geometry.
 * One hinge per room: Ragatha's entrance and the room's own door control
 * share it rather than nesting a second pivot around the same slab.
 */
export function createBedroomDoorHinge({ group, collisionMeshes, insidePoint }) {
  return group.userData.bedroomDoorHinge ??= hangBedroomDoor({ group, collisionMeshes, insidePoint });
}

function hangBedroomDoor({ group, collisionMeshes, insidePoint }) {
  const slab = group.getObjectByName('Door_Slab024');
  const panel = group.getObjectByName('Plane_1');
  const handle = group.getObjectByName('Plane_2');
  const frame = group.getObjectByName('Door_Frame024');
  if (!slab || !panel?.isMesh || !handle?.isMesh || !frame) throw new Error('Bedroom entrance door is unavailable');
  group.updateMatrixWorld(true);
  const panelBox = new THREE.Box3().setFromObject(panel);
  const frameBox = new THREE.Box3().setFromObject(frame);
  const handlePosition = new THREE.Box3().setFromObject(handle).getCenter(new THREE.Vector3());
  const center = panelBox.getCenter(new THREE.Vector3()), size = panelBox.getSize(new THREE.Vector3());
  // These actual exports are axis-aligned. Measure the wide axis instead of
  // assuming that screen-left means either world-X minimum or maximum.
  const wide = size.x >= size.z ? 'x' : 'z', thin = wide === 'x' ? 'z' : 'x';
  const offset = handlePosition[wide] - center[wide];
  if (Math.abs(offset) < size[wide] * .1) throw new Error('Bedroom handle does not identify a hinge edge');
  const inwardSign = Math.sign(insidePoint[thin] - center[thin]);
  if (!inwardSign) throw new Error('Bedroom interior side is ambiguous');
  const inward = new THREE.Vector3(); inward[thin] = inwardSign;
  const hinge = center.clone();
  hinge[wide] = offset < 0 ? panelBox.max[wide] : panelBox.min[wide];
  // Put the pin on the room-facing edge, just beyond the raised frame trim.
  // A centre-thickness pin sweeps the thick leaf back into its own jamb.
  hinge[thin] = inwardSign > 0
    ? Math.max(panelBox.max[thin], frameBox.max[thin]) + .002
    : Math.min(panelBox.min[thin], frameBox.min[thin]) - .002;
  const freeEdge = center.clone();
  freeEdge[wide] = offset < 0 ? panelBox.min[wide] : panelBox.max[wide];
  const up = new THREE.Vector3(0, 1, 0);
  const sweepScore = angle => freeEdge.clone().sub(hinge).applyAxisAngle(up, angle)
    .add(hinge).sub(freeEdge).dot(inward);
  const openAngle = sweepScore(Math.PI / 2) > sweepScore(-Math.PI / 2) ? Math.PI / 2 : -Math.PI / 2;
  const pivot = new THREE.Group(); pivot.name = 'Door_Frame024Hinge';
  group.add(pivot); pivot.position.copy(group.worldToLocal(hinge.clone()));
  pivot.updateMatrixWorld(true); pivot.attach(slab); // keep the exact closed world transform
  const localUp = up.clone().transformDirection(group.matrixWorld.clone().invert());
  const moving = new Set(); slab.traverse(o => { if (o.isMesh) moving.add(o); });
  const entries = collisionMeshes.filter(entry => moving.has(entry.mesh)).map(entry => ({
    entry, padding: entry.paddedBox ? entry.box.min.clone().sub(entry.paddedBox.min) : null,
  }));
  entries.forEach(({ entry }) => { entry.dynamic = true; });
  const measurements = {
    hinge: hinge.toArray(), handle: handlePosition.toArray(), panelMin: panelBox.min.toArray(),
    panelMax: panelBox.max.toArray(), wideAxis: wide, inward: inward.toArray(), openAngle,
  };
  return {
    pivot, slab, panel, handle, frame, measurements,
    setOpenFraction(fraction) {
      pivot.setRotationFromAxisAngle(localUp, openAngle * THREE.MathUtils.clamp(fraction, 0, 1));
      pivot.updateMatrixWorld(true);
      for (const { entry, padding } of entries) {
        entry.box.setFromObject(entry.mesh);
        if (padding) entry.paddedBox.copy(entry.box).expandByVector(padding);
      }
    },
  };
}

import * as THREE from 'three';

// A plain procedural staircase up to a solid platform — no stair asset
// exists yet, so this is built from boxes rather than waiting on one.
// Each step's rise is kept under main.js's STEP_HEIGHT (0.4m, see its own
// comment there): that's the ledge height the existing GLB-room collision
// system (moveWithCollisions/settleOnGround) already climbs onto by
// itself, one step at a time, with no new climbing logic required — this
// is just geometry shaped so that system carries the player up it.
const STEP_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xcf8a2b, roughness: 0.8 });
const PLATFORM_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xb0163f, roughness: 0.7 });

/**
 * @param {{ base: { x: number, z: number }, floorY?: number, steps?: number,
 *   rise?: number, treadDepth?: number, width?: number, platformDepth?: number,
 *   facing?: number }} options
 *   `base` is where the bottom step starts; `facing` (radians, same
 *   convention as spawnFacing elsewhere — 0 faces -Z) points the climb
 *   "up" direction, with the platform landing beyond the top step.
 * @returns {{ group: THREE.Group, colliders: Array<{ mesh: THREE.Mesh, box: THREE.Box3 }> }}
 */
export function createStaircase({
  base, floorY = 0, steps = 6, rise = 0.33, treadDepth = 0.6, width = 2.5, platformDepth = 4, facing = 0,
} = {}) {
  const group = new THREE.Group();
  group.name = 'AccessStaircase';
  group.position.set(base.x, floorY, base.z);
  group.rotation.y = facing;

  function addBox(sizeY, sizeZ, centerY, centerZ, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, sizeY, sizeZ), material);
    mesh.position.set(0, centerY, centerZ);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // Each step is solid from the floor up to its own tread, like a stacked
  // block staircase — simple, and nothing to walk underneath into.
  for (let i = 0; i < steps; i++) {
    const height = (i + 1) * rise;
    addBox(height, treadDepth, height / 2, i * treadDepth + treadDepth / 2, STEP_MATERIAL);
  }

  const totalHeight = steps * rise;
  addBox(totalHeight, platformDepth, totalHeight / 2, steps * treadDepth + platformDepth / 2, PLATFORM_MATERIAL);

  group.updateMatrixWorld(true);
  const colliders = [];
  group.traverse((child) => {
    if (child.isMesh) colliders.push({ mesh: child, box: new THREE.Box3().setFromObject(child) });
  });

  return { group, colliders };
}

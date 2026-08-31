import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads a pre-built room/level model (.glb). These source files ship with
 * no lights or camera — Blender's glTF export only carries geometry and
 * materials — so a simple lighting rig is generated, and a walkable spawn
 * point is found by raycasting rather than trusting the model's bounding
 * box directly: a handful of these assets bundle a large enclosing mesh
 * (a sky dome, in the "Amazing Digital Circus" map) whose bounding box
 * dwarfs the actual walkable room and pulls the naive box-center spawn
 * point off into empty air above/outside it.
 *
 * @param {string} url
 * @param {(ratio: number) => void} [onProgress] called with a 0-1 load ratio
 * @returns {Promise<{ group: THREE.Group, bounds: THREE.Box3, spawn: THREE.Vector3 }>}
 */
export function loadRoomModel(url, onProgress) {
  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const group = gltf.scene;
        group.updateMatrixWorld(true);

        group.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        const bounds = new THREE.Box3().setFromObject(group);
        const spawn = findSpawnPoint(group, bounds);

        group.add(createRoomLighting(group, bounds, spawn));

        resolve({ group, bounds, spawn });
      },
      (event) => {
        if (onProgress && event.total) onProgress(event.loaded / event.total);
      },
      reject,
    );
  });
}

/**
 * The vertex-density-weighted centroid tends to sit inside the detailed,
 * walkable geometry rather than a sparse enclosing shell (a sky dome needs
 * far fewer vertices than the room it encloses), so it's a better starting
 * XZ guess than the raw bounding-box center. A downward raycast from above
 * then finds the actual floor height at that XZ.
 */
function findSpawnPoint(group, bounds) {
  const centroid = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  let count = 0;

  group.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    if (!position) return;
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld);
      centroid.add(vertex);
      count++;
    }
  });
  if (count > 0) centroid.divideScalar(count);
  else centroid.copy(bounds.getCenter(new THREE.Vector3()));

  const floorY = raycastFloorY(group, bounds, centroid.x, centroid.z) ?? bounds.min.y;
  return new THREE.Vector3(centroid.x, floorY, centroid.z);
}

function raycastFloorY(group, bounds, x, z) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = bounds.max.y - bounds.min.y + 2;
  raycaster.set(new THREE.Vector3(x, bounds.max.y + 1, z), new THREE.Vector3(0, -1, 0));
  const hits = raycaster.intersectObject(group, true);
  if (hits.length === 0) return null;
  // The lowest hit along a top-down ray is the floor (any dome/ceiling
  // shells above it get hit first and are skipped).
  return hits[hits.length - 1].point.y;
}

/**
 * Approximates a plausible interior setup: a soft fill plus one warm point
 * light. Positioned near the spawn point (not the raw bounding-box center)
 * for the same reason spawn placement uses the vertex centroid — a large
 * enclosing mesh would otherwise pull the light away from the walkable room.
 */
function createRoomLighting(group, bounds, spawn) {
  const lights = new THREE.Group();
  lights.name = 'RoomLighting';

  const fill = new THREE.HemisphereLight(0xfff4e0, 0x3a3226, 0.6);
  lights.add(fill);

  const raycaster = new THREE.Raycaster();
  raycaster.far = bounds.max.y - spawn.y + 2;
  raycaster.set(new THREE.Vector3(spawn.x, spawn.y + 0.5, spawn.z), new THREE.Vector3(0, 1, 0));
  const ceilingHits = raycaster.intersectObject(group, true);
  const ceilingY = ceilingHits.length > 0 ? ceilingHits[0].point.y : bounds.max.y;
  const roomHeight = Math.max(ceilingY - spawn.y, 1);

  const pendant = new THREE.PointLight(0xfff2c2, roomHeight * roomHeight, roomHeight * 6, 2);
  pendant.position.set(spawn.x, ceilingY - roomHeight * 0.05, spawn.z);
  pendant.castShadow = true;
  pendant.shadow.mapSize.set(1024, 1024);
  pendant.shadow.camera.near = 0.1;
  pendant.shadow.camera.far = roomHeight * 6;
  lights.add(pendant);

  return lights;
}

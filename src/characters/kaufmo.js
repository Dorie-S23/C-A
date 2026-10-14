import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const KAUFMO_URL = './models/characters/kaufmo/kaufmo_the_amazing_digital_circus.glb';
// Short and round next to the cast (Caine is scaled to 2.6m the same way).
const KAUFMO_HEIGHT = 1.3;
// The Sketchfab source scene still has its default new-file Cube and
// Icosphere in it alongside the actual character — including them in the
// bounding box would badly skew the normalization below.
const JUNK_OBJECT_NAMES = new Set(['Cube', 'Icosphere']);
// Same approach as Caine's collider: his actual mesh is too fine-grained
// (and, for Kaufmo, rigged with no walkable-vs-decorative distinction) to
// collide against directly, so stand a simple invisible cylinder in for him.
const COLLIDER_RADIUS = 0.35;

/**
 * Loads Kaufmo and normalizes him the same way loadCaine() does: rescaled
 * to KAUFMO_HEIGHT, origin recentred so (0,0,0) is floor level between his
 * feet. He ships with a full Source-engine-style humanoid armature but no
 * baked animation, so for now he's posed exactly as exported (no idle).
 *
 * @returns {Promise<{ kaufmo: THREE.Group, collider: THREE.Mesh }>}
 */
export function loadKaufmo() {
  const loader = new GLTFLoader();

  return loader.loadAsync(KAUFMO_URL).then((gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);

    const box = new THREE.Box3();
    model.traverse((child) => {
      if (!child.isMesh || JUNK_OBJECT_NAMES.has(child.name)) return;
      box.expandByObject(child);
    });

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = KAUFMO_HEIGHT / size.y;

    const kaufmo = new THREE.Group();
    kaufmo.add(model);
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // The default-scene junk meshes have no material worth lighting and
      // would otherwise render as a stray flat-shaded box/sphere nearby.
      if (JUNK_OBJECT_NAMES.has(child.name)) child.visible = false;
    });

    const collider = new THREE.Mesh(
      new THREE.CylinderGeometry(COLLIDER_RADIUS, COLLIDER_RADIUS, KAUFMO_HEIGHT, 16),
      new THREE.MeshBasicMaterial(),
    );
    collider.position.y = KAUFMO_HEIGHT / 2;
    collider.visible = false;
    kaufmo.add(collider);

    return { kaufmo, collider };
  });
}

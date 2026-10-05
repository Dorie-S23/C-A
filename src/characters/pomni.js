import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const POMNI_URL = '../models/characters/pomni/pomni.glb';
const POMNI_HEIGHT = 1.6; // Caine is 2.6; agree on this with the team

// The Sketchfab export carries two stray untextured meshes that aren't part
// of Pomni (one is ~18 m wide); both use this material, so drop them.
const STRAY_MATERIAL = 'mat21';

/**
 * Loads Pomni with her origin on the floor between her feet, facing +Z.
 * Falls back to a capsule placeholder if the model isn't there yet.
 * @returns {Promise<{ pomni: THREE.Group, animations: THREE.AnimationClip[] }>}
 */
export function loadPomni() {
  return new GLTFLoader().loadAsync(POMNI_URL)
    .then((gltf) => ({ pomni: normalize(gltf.scene), animations: gltf.animations }))
    .catch((err) => {
      console.warn('Pomni model not found, using placeholder', err);
      return { pomni: makePlaceholder(), animations: [] };
    });
}

function normalize(model) {
  const strays = [];
  model.traverse((child) => {
    if (!child.isMesh) return;
    if (child.material.name === STRAY_MATERIAL) strays.push(child);
    child.castShadow = true;
    child.receiveShadow = true;
  });
  for (const stray of strays) stray.removeFromParent();

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = POMNI_HEIGHT / size.y;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  pomni.add(model);
  return pomni;
}

/** A capsule with a nose so you can see which way she faces. */
function makePlaceholder() {
  const pomni = new THREE.Group();
  pomni.name = 'Pomni';
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, POMNI_HEIGHT - 0.6, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xd8312f }),
  );
  body.position.y = POMNI_HEIGHT / 2;
  const nose = new THREE.Mesh(
    new THREE.ConeGeometry(0.1, 0.25, 12),
    new THREE.MeshStandardMaterial({ color: 0x2f5bd8 }),
  );
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, POMNI_HEIGHT - 0.4, 0.35);
  for (const m of [body, nose]) { m.castShadow = true; pomni.add(m); }
  return pomni;
}

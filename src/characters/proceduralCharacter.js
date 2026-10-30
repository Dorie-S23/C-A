import * as THREE from 'three';

/** Small, consistent building blocks for the ending's original procedural cast. */
export function characterMaterial(color, { roughness = 0.76, metalness = 0 } = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function addPart(parent, name, geometry, material, position = [0, 0, 0]) {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.position.set(...position);
  part.castShadow = true;
  part.receiveShadow = true;
  parent.add(part);
  return part;
}

export function addPivot(parent, name, position = [0, 0, 0]) {
  const pivot = new THREE.Group();
  pivot.name = name;
  pivot.position.set(...position);
  parent.add(pivot);
  return pivot;
}

export function addEye(parent, name, position, { size = 0.12, pupil = 0x18151d } = {}) {
  const white = characterMaterial(0xfffdf5, { roughness: 0.58 });
  const dark = characterMaterial(pupil, { roughness: 0.5 });
  addPart(parent, `${name}White`, new THREE.SphereGeometry(size, 16, 12), white, position);
  addPart(parent, `${name}Pupil`, new THREE.SphereGeometry(size * 0.43, 12, 8), dark,
    [position[0], position[1], position[2] + size * 0.86]);
}

export function addGlove(parent, name, position, radius = 0.12) {
  return addPart(parent, name, new THREE.SphereGeometry(radius, 14, 10),
    characterMaterial(0xfffdf2, { roughness: 0.68 }), position);
}

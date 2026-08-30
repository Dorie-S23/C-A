import * as THREE from 'three';

// Room dimensions, exported so main.js can clamp the player inside them
// without duplicating numbers.
export const ROOM = {
  width: 12,
  depth: 12,
  height: 4,
};

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.9 });
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a46, roughness: 0.8 });
const ceilingMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 1 });
const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2f27, roughness: 0.6 });

/**
 * Builds the room as a single Group so the whole level can be positioned,
 * rotated or torn down (dispose + remove) as one unit when levels switch.
 * Fixtures (the light) are their own sub-hierarchy: moving/animating the
 * fixture group moves the pole, shade and bulb together.
 */
export function createRoom() {
  const room = new THREE.Group();
  room.name = 'Room';

  const { width, depth, height } = ROOM;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = 'Floor';
  room.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMaterial);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = height;
  ceiling.receiveShadow = true;
  ceiling.name = 'Ceiling';
  room.add(ceiling);

  const wallGeometry = new THREE.PlaneGeometry(width, height);
  const wallDefs = [
    { z: -depth / 2, ry: 0 },
    { z: depth / 2, ry: Math.PI },
  ];
  for (const { z, ry } of wallDefs) {
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(0, height / 2, z);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    wall.castShadow = true;
    room.add(wall);
  }

  const sideWallGeometry = new THREE.PlaneGeometry(depth, height);
  const sideWallDefs = [
    { x: -width / 2, ry: Math.PI / 2 },
    { x: width / 2, ry: -Math.PI / 2 },
  ];
  for (const { x, ry } of sideWallDefs) {
    const wall = new THREE.Mesh(sideWallGeometry, wallMaterial);
    wall.position.set(x, height / 2, 0);
    wall.rotation.y = ry;
    wall.receiveShadow = true;
    wall.castShadow = true;
    room.add(wall);
  }

  // Skirting trim around the base of the walls — purely decorative, but a
  // cheap way to show a second material and break up the flat wall/floor line.
  const trimGeometry = new THREE.BoxGeometry(width, 0.15, 0.05);
  const trimDefs = [
    { x: 0, z: -depth / 2, ry: 0 },
    { x: 0, z: depth / 2, ry: Math.PI },
    { x: -width / 2, z: 0, ry: Math.PI / 2, geo: new THREE.BoxGeometry(depth, 0.15, 0.05) },
    { x: width / 2, z: 0, ry: -Math.PI / 2, geo: new THREE.BoxGeometry(depth, 0.15, 0.05) },
  ];
  for (const { x, z, ry, geo } of trimDefs) {
    const trim = new THREE.Mesh(geo ?? trimGeometry, trimMaterial);
    trim.position.set(x, 0.075, z);
    trim.rotation.y = ry;
    room.add(trim);
  }

  room.add(createLightFixture(new THREE.Vector3(0, height - 0.05, 0)));

  return room;
}

/**
 * A ceiling pendant light: pole + shade + bulb, parented under one group so
 * they move as a unit and only the group's transform needs to be touched
 * if the fixture is later animated (swinging, flickering, etc.).
 */
function createLightFixture(position) {
  const fixture = new THREE.Group();
  fixture.name = 'LightFixture';
  fixture.position.copy(position);

  const cordMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8), cordMaterial);
  cord.position.y = -0.2;
  fixture.add(cord);

  const shadeMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.25, 16, 1, true), shadeMaterial);
  shade.position.y = -0.4;
  shade.rotation.x = Math.PI;
  fixture.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff2c2, emissive: 0xfff2c2, emissiveIntensity: 1 }),
  );
  bulb.position.y = -0.45;
  fixture.add(bulb);

  const pointLight = new THREE.PointLight(0xfff2c2, 8, 15, 2);
  pointLight.position.y = -0.45;
  pointLight.castShadow = true;
  pointLight.shadow.mapSize.set(1024, 1024);
  pointLight.shadow.camera.near = 0.1;
  pointLight.shadow.camera.far = 15;
  fixture.add(pointLight);

  return fixture;
}

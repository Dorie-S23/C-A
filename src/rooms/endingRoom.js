import * as THREE from 'three';
import { loadEndingCast } from '../characters/endingCast.js';

const WALL_HEIGHT = 4.8;

function addBox(group, colliders, { name, size, position, material, collide = true }) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collide) {
    mesh.updateMatrixWorld(true);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }
  return mesh;
}

/** The clearing immediately outside the maze, not the later exit-door scene. */
export async function loadEndingRoom(onProgress, { endingVariant = 'saved', pomni = null, stage = null } = {}) {
  const variant = endingVariant === 'bittersweet' ? 'bittersweet' : 'saved';
  const cast = await loadEndingCast({
    endingVariant: variant, pomni, stage,
    onProgress: (progress, key) => onProgress?.(progress, key),
  });
  const jaxApi = cast.jaxApi;
  onProgress?.(1);

  const group = new THREE.Group();
  group.name = 'WayOutMazeEntrance';
  group.userData.endingCast = { dispose: () => cast.dispose() };
  group.add(cast.ensemble);
  const colliders = [];
  const wall = new THREE.MeshStandardMaterial({ color: 0x7e2045, roughness: 0.78 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x232747, roughness: 0.72 });
  const floor = new THREE.MeshStandardMaterial({ color: 0x27253a, roughness: 0.88 });
  const glow = new THREE.MeshStandardMaterial({
    color: 0xdbc584, emissive: 0x8a6230, emissiveIntensity: 0.65, roughness: 0.7,
  });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 22), floor);
  ground.name = 'EndingClearingFloor';
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -2;
  ground.receiveShadow = true;
  group.add(ground);

  // A broad open doorway in the maze facade; the corridor remains visible
  // behind the cast as they step out into the clearing.
  addBox(group, colliders, { name: 'MazeFacadeLeft', size: [6.8, WALL_HEIGHT, 0.5], position: [-5.6, WALL_HEIGHT / 2, 4], material: wall });
  addBox(group, colliders, { name: 'MazeFacadeRight', size: [6.8, WALL_HEIGHT, 0.5], position: [5.6, WALL_HEIGHT / 2, 4], material: wall });
  addBox(group, colliders, { name: 'MazeFacadeLintel', size: [4.4, 1.1, 0.5], position: [0, 4.25, 4], material: trim });
  addBox(group, colliders, { name: 'MazePassageLeft', size: [0.35, 3.8, 4], position: [-2.2, 1.9, 6], material: trim });
  addBox(group, colliders, { name: 'MazePassageRight', size: [0.35, 3.8, 4], position: [2.2, 1.9, 6], material: trim });
  addBox(group, colliders, { name: 'MazePassageLight', size: [3.9, 0.08, 0.5], position: [0, 3.65, 4.15], material: glow, collide: false });

  addBox(group, colliders, { name: 'ClearingLeft', size: [0.4, 2.4, 20], position: [-9, 1.2, -2], material: trim });
  addBox(group, colliders, { name: 'ClearingRight', size: [0.4, 2.4, 20], position: [9, 1.2, -2], material: trim });
  addBox(group, colliders, { name: 'ClearingBack', size: [18, 2.4, 0.4], position: [0, 1.2, -12], material: trim });

  const hemisphere = new THREE.HemisphereLight(0x999bd4, 0x241528, 1.25);
  group.add(hemisphere);
  const key = new THREE.DirectionalLight(0xffe4bd, 2.2);
  key.position.set(-4, 8, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = key.shadow.camera.bottom = -10;
  key.shadow.camera.right = key.shadow.camera.top = 10;
  group.add(key);
  const entranceLight = new THREE.PointLight(0xffd895, 18, 12, 2);
  entranceLight.position.set(0, 2.8, 3.2);
  group.add(entranceLight);

  const marks = {
    pomniStart: new THREE.Vector3(-0.55, 0, 3.25),
    pomniEnd: new THREE.Vector3(-0.55, 0, -0.65),
    jaxStart: new THREE.Vector3(0.7, 0, 3.4),
    jaxEnd: new THREE.Vector3(0.7, 0, -0.5),
    lookIntoClearing: new THREE.Vector3(0, 0, -4),
    camera: {
      position: [5.8, 3.2, -7.5],
      target: [0, 1.25, 1.1],
    },
  };

  if (jaxApi) {
    jaxApi.setDistressed(false);
    jaxApi.setShown(true);
    jaxApi.jax.position.copy(marks.jaxStart);
    group.add(jaxApi.jax);
  }

  return {
    group,
    bounds: new THREE.Box3(new THREE.Vector3(-9, 0, -12), new THREE.Vector3(9, WALL_HEIGHT, 8)),
    spawn: marks.pomniStart.clone(),
    spawnFacing: 0,
    colliders,
    collisionMeshes: [],
    ending: { variant, jaxApi, cast, marks },
    update(deltaSeconds) { cast.update(deltaSeconds); },
  };
}

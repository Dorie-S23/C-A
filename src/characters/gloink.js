import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const GLOINKS_URL = './models/characters/gloinks/tadc_-_gloinks.glb';

// Heights in metres (Pomni is 1.7): chest-high on her, so they read as a
// threat across a corridor rather than toys underfoot.
export const GLOINK_CONFIGS = {
  pin: {
    meshes: ['Object_2', 'Object_3', 'Object_4', 'Object_5'],
    height: 1.4,
    lightColor: 0xff5533,
    lightIntensity: 3.2,
    speed: 1.4,
  },
  star: {
    meshes: ['Object_10', 'Object_11', 'Object_12', 'Object_13'],
    height: 1.4,
    lightColor: 0xffcc33,
    lightIntensity: 3.2,
    speed: 1.6,
  },
  cube: {
    meshes: ['Object_6', 'Object_7', 'Object_8', 'Object_9'],
    height: 1.25,
    lightColor: 0x33aaff,
    lightIntensity: 3.2,
    speed: 1.3,
  },
  circle: {
    meshes: ['Object_14', 'Object_15', 'Object_16', 'Object_17'],
    height: 1.35,
    lightColor: 0x33ff88,
    lightIntensity: 3.2,
    speed: 1.5,
  },
  diamond: {
    meshes: ['Object_18', 'Object_19', 'Object_20', 'Object_21'],
    height: 1.35,
    lightColor: 0xaa33ff,
    lightIntensity: 3.2,
    speed: 1.5,
  },
  crescent: {
    meshes: ['Object_22', 'Object_23', 'Object_24', 'Object_25'],
    height: 1.35,
    lightColor: 0xff33aa,
    lightIntensity: 3.2,
    speed: 1.4,
  },
};

function createFallbackGloink(type = 'pin') {
  const config = GLOINK_CONFIGS[type] ?? GLOINK_CONFIGS.pin;
  const group = new THREE.Group();
  group.name = `Gloink_${type}`;
  group.userData = { isGloink: true, isHazard: true, type };

  const modelWrapper = new THREE.Group();
  modelWrapper.name = 'GloinkModel';

  const geom = type === 'star'
    ? new THREE.OctahedronGeometry(config.height * 0.5, 0)
    : new THREE.CylinderGeometry(config.height * 0.25, config.height * 0.35, config.height, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: config.lightColor,
    roughness: 0.6,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.y = config.height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  modelWrapper.add(mesh);
  group.add(modelWrapper);

  const light = new THREE.PointLight(config.lightColor, config.lightIntensity, 4.0, 2);
  light.position.set(0, config.height * 0.7, 0);
  group.add(light);

  let currentYaw = 0;
  let walkPhase = 0;
  let walkWeight = 0;
  let idleTime = 0;
  let lastX = 0;
  let lastZ = 0;
  let initialized = false;

  function setFacing(target) {
    if (!target) return;
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      currentYaw = Math.atan2(dx, dz);
      group.rotation.y = currentYaw;
    }
    lastX = group.position.x;
    lastZ = group.position.z;
    initialized = true;
  }

  function update(deltaSeconds) {
    if (!initialized) {
      lastX = group.position.x;
      lastZ = group.position.z;
      initialized = true;
    }
    const dx = group.position.x - lastX;
    const dz = group.position.z - lastZ;
    lastX = group.position.x;
    lastZ = group.position.z;
    const distMoved = Math.hypot(dx, dz);

    const isWalking = distMoved > 1e-4;
    walkWeight += ((isWalking ? 1 : 0) - walkWeight) * Math.min(1, deltaSeconds * 10);
    // Something else may have turned it (gloinkChase looks round on the
    // spot), so turn on from where it actually faces now.
    currentYaw = group.rotation.y;

    if (isWalking) {
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - currentYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      currentYaw += diff * Math.min(1, deltaSeconds * 12);
      group.rotation.y = currentYaw;
      walkPhase += Math.max(deltaSeconds * 9.0, distMoved * 10.0);
    } else {
      idleTime += deltaSeconds;
    }

    // Pronounced, comedic Digital Circus waddle when walking:
    // 1. Alternating side-to-side body rock (roll on Z): ~20 degrees
    const roll = Math.sin(walkPhase) * 0.35 * walkWeight;
    // 2. Lateral weight shift (sway on local X): moves side-to-side across the stride
    const sway = Math.sin(walkPhase) * 0.18 * walkWeight;
    // 3. Energetic footstep hop (bounce on local Y) with gentle idle breathing when stopped
    const stepHop = Math.abs(Math.sin(walkPhase)) * 0.18 * walkWeight;
    const idleBreath = Math.sin(idleTime * 2.5) * 0.015 * (1 - walkWeight);
    const hop = stepHop + idleBreath;
    // 4. Forward scurrying lean & gallop tilt (pitch on X)
    const pitch = (0.12 + Math.cos(walkPhase * 2) * 0.06) * walkWeight;
    // 5. Hip/shoulder swivel (yaw wiggle on local Y)
    const yawWiggle = Math.cos(walkPhase) * 0.14 * walkWeight;
    // 6. Cartoon squash and stretch on footfalls
    const squash = Math.cos(walkPhase * 2) * 0.08 * walkWeight;

    modelWrapper.position.set(sway, hop, 0);
    modelWrapper.rotation.set(pitch, yawWiggle, roll, 'YXZ');
    modelWrapper.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

    if (light) {
      light.intensity = config.lightIntensity * (1 + Math.sin(walkPhase * 2) * 0.2 * walkWeight);
    }
  }

  return { group, modelWrapper, light, setFacing, update };
}

function createGloinkInstance(sourceModel, type = 'pin') {
  const config = GLOINK_CONFIGS[type] ?? GLOINK_CONFIGS.pin;
  const clone = sourceModel.clone(true);
  const allowed = new Set(config.meshes);
  const toRemove = [];
  clone.traverse((child) => {
    if (child.isMesh) {
      if (!allowed.has(child.name)) {
        toRemove.push(child);
      } else {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    }
  });
  toRemove.forEach((c) => c.parent?.remove(c));

  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const targetHeight = config.height || 1.0;
  const scale = targetHeight / (size.y || 1);

  const modelWrapper = new THREE.Group();
  modelWrapper.name = 'GloinkModel';
  clone.scale.setScalar(scale);
  clone.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  modelWrapper.add(clone);

  const group = new THREE.Group();
  group.name = `Gloink_${type}`;
  group.userData = { isGloink: true, isHazard: true, type };
  group.add(modelWrapper);

  const light = new THREE.PointLight(config.lightColor, config.lightIntensity, 4.0, 2);
  light.position.set(0, targetHeight * 0.7, 0);
  group.add(light);

  let currentYaw = 0;
  let walkPhase = 0;
  let walkWeight = 0;
  let idleTime = 0;
  let lastX = 0;
  let lastZ = 0;
  let initialized = false;

  function setFacing(target) {
    if (!target) return;
    const dx = target.x - group.position.x;
    const dz = target.z - group.position.z;
    if (Math.hypot(dx, dz) > 1e-4) {
      currentYaw = Math.atan2(dx, dz);
      group.rotation.y = currentYaw;
    }
    lastX = group.position.x;
    lastZ = group.position.z;
    initialized = true;
  }

  function update(deltaSeconds) {
    if (!initialized) {
      lastX = group.position.x;
      lastZ = group.position.z;
      initialized = true;
    }
    const dx = group.position.x - lastX;
    const dz = group.position.z - lastZ;
    lastX = group.position.x;
    lastZ = group.position.z;
    const distMoved = Math.hypot(dx, dz);

    const isWalking = distMoved > 1e-4;
    walkWeight += ((isWalking ? 1 : 0) - walkWeight) * Math.min(1, deltaSeconds * 10);
    // Something else may have turned it (gloinkChase looks round on the
    // spot), so turn on from where it actually faces now.
    currentYaw = group.rotation.y;

    if (isWalking) {
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - currentYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      currentYaw += diff * Math.min(1, deltaSeconds * 12);
      group.rotation.y = currentYaw;
      walkPhase += Math.max(deltaSeconds * 9.0, distMoved * 10.0);
    } else {
      idleTime += deltaSeconds;
    }

    // Pronounced, comedic Digital Circus waddle when walking:
    // 1. Alternating side-to-side body rock (roll on Z): ~20 degrees
    const roll = Math.sin(walkPhase) * 0.35 * walkWeight;
    // 2. Lateral weight shift (sway on local X): moves side-to-side across the stride
    const sway = Math.sin(walkPhase) * 0.18 * walkWeight;
    // 3. Energetic footstep hop (bounce on local Y) with gentle idle breathing when stopped
    const stepHop = Math.abs(Math.sin(walkPhase)) * 0.18 * walkWeight;
    const idleBreath = Math.sin(idleTime * 2.5) * 0.015 * (1 - walkWeight);
    const hop = stepHop + idleBreath;
    // 4. Forward scurrying lean & gallop tilt (pitch on X)
    const pitch = (0.12 + Math.cos(walkPhase * 2) * 0.06) * walkWeight;
    // 5. Hip/shoulder swivel (yaw wiggle on local Y)
    const yawWiggle = Math.cos(walkPhase) * 0.14 * walkWeight;
    // 6. Cartoon squash and stretch on footfalls
    const squash = Math.cos(walkPhase * 2) * 0.08 * walkWeight;

    modelWrapper.position.set(sway, hop, 0);
    modelWrapper.rotation.set(pitch, yawWiggle, roll, 'YXZ');
    modelWrapper.scale.set(1 + squash * 0.6, 1 - squash, 1 + squash * 0.6);

    if (light) {
      light.intensity = config.lightIntensity * (1 + Math.sin(walkPhase * 2) * 0.2 * walkWeight);
    }
  }

  return { group, modelWrapper, light, setFacing, update };
}

let cachedPromise = null;

/**
 * Loads the gloinks asset and returns an API to create gloink enemy instances.
 * @returns {Promise<{ createInstance: (type?: string) => object }>}
 */
export function loadGloinks() {
  if (!cachedPromise) {
    const loader = new GLTFLoader();
    cachedPromise = loader.loadAsync(GLOINKS_URL).then((gltf) => {
      const sourceModel = gltf.scene;
      sourceModel.updateMatrixWorld(true);
      return {
        createInstance(type = 'pin') {
          return createGloinkInstance(sourceModel, type);
        },
      };
    }).catch((err) => {
      console.warn('Could not load gloinks glb, using procedural fallback:', err);
      return {
        createInstance(type = 'pin') {
          return createFallbackGloink(type);
        },
      };
    });
  }
  return cachedPromise;
}

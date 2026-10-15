import * as THREE from 'three';

export const BEDROOM_LIGHTING_STATES = Object.freeze(['SLEEPING', 'WAKING', 'GAMEPLAY']);
const BULBS = ['Circle027', 'Circle028', 'Circle029', 'Circle030', 'Circle031', 'Circle032'];

/**
 * Owns only the bedroom's generated lights and its temporary environment
 * brightness. Geometry, materials, renderer settings and shared ambient stay
 * untouched. Future animation events can call setState() directly.
 */
export function createBedroomLighting({ group, spawn }) {
  const rig = group.getObjectByName('RoomLighting');
  const fill = rig?.children.find((child) => child.isHemisphereLight);
  const chandelier = rig?.children.find((child) => child.isPointLight);
  if (!fill || !chandelier) throw new Error('Bedroom lighting rig is missing');

  group.updateMatrixWorld(true);
  const fixtureCenter = new THREE.Vector3();
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  for (const name of BULBS) {
    const bulb = group.getObjectByName(name);
    if (!bulb?.isMesh) throw new Error(`Bedroom chandelier bulb is missing: ${name}`);
    fixtureCenter.add(box.setFromObject(bulb).getCenter(center));
  }
  fixtureCenter.divideScalar(BULBS.length);
  // The bulbs surround an opaque central chain. Its measured lower bound
  // keeps the point source inside the fixture area but out of that hardware,
  // where it can illuminate the room instead of self-shadowing.
  const chain = group.getObjectByName('NurbsCurve');
  if (!chain?.isMesh) throw new Error('Bedroom chandelier chain is missing');
  fixtureCenter.y = Math.min(fixtureCenter.y,
    box.setFromObject(chain).min.y - chandelier.shadow.camera.near - 0.02);
  const oldHeight = chandelier.getWorldPosition(center).y - spawn.y;
  const newHeight = fixtureCenter.y - spawn.y;
  // Preserve approximately the previous floor illumination after centring
  // the existing point light on the real fixture rather than the spawn.
  const gameplayIntensity = chandelier.intensity * (newHeight / oldHeight) ** 2;
  chandelier.position.copy(rig.worldToLocal(fixtureCenter.clone()));

  const gameplay = {
    sky: fill.color.clone(), ground: fill.groundColor.clone(), fill: fill.intensity,
    chandelier: gameplayIntensity, environment: 1, duration: 2.4,
  };
  const presets = {
    SLEEPING: {
      sky: new THREE.Color(0xaaa6bd), ground: new THREE.Color(0x302c3e),
      fill: 0.14, chandelier: 0, environment: 0.08, duration: 1.8,
    },
    WAKING: {
      sky: new THREE.Color(0xd6cedd), ground: new THREE.Color(0x3a3240),
      fill: 0.3, chandelier: gameplayIntensity * 0.06, environment: 0.3, duration: 2,
    },
    GAMEPLAY: gameplay,
  };
  const startSky = new THREE.Color();
  const startGround = new THREE.Color();
  let state = 'GAMEPLAY';
  let startFill = gameplay.fill;
  let startChandelier = gameplay.chandelier;
  let environment = 1;
  let startEnvironment = 1;
  let elapsed = 0;
  let duration = 0;
  let disposed = false;
  let scene = null;
  let originalEnvironmentIntensity = 1;
  chandelier.intensity = gameplayIntensity;

  const applyEnvironment = () => {
    if (scene) scene.environmentIntensity = originalEnvironmentIntensity * environment;
  };

  const controller = {
    get state() { return state; },
    get transitioning() { return !disposed && elapsed < duration; },
    /** Bind once when main.js attaches this room to the shared scene. */
    attach(nextScene) {
      if (disposed || nextScene === scene) return;
      if (scene) scene.environmentIntensity = originalEnvironmentIntensity;
      scene = nextScene;
      originalEnvironmentIntensity = scene.environmentIntensity;
      applyEnvironment();
    },
    setState(nextState, { duration: seconds = presets[nextState]?.duration } = {}) {
      if (disposed) return;
      if (!presets[nextState]) throw new RangeError(`Unknown bedroom lighting state: ${nextState}`);
      if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError('Lighting duration must be non-negative');
      startSky.copy(fill.color);
      startGround.copy(fill.groundColor);
      startFill = fill.intensity;
      startChandelier = chandelier.intensity;
      startEnvironment = environment;
      state = nextState;
      elapsed = 0;
      duration = seconds;
      if (seconds === 0) controller.update(0);
    },
    reset() { controller.setState('GAMEPLAY', { duration: 0 }); },
    update(deltaSeconds) {
      if (disposed) return;
      elapsed = Math.min(duration, elapsed + Math.max(0, deltaSeconds));
      const t = duration === 0 ? 1 : THREE.MathUtils.smootherstep(elapsed, 0, duration);
      const target = presets[state];
      fill.color.lerpColors(startSky, target.sky, t);
      fill.groundColor.lerpColors(startGround, target.ground, t);
      fill.intensity = THREE.MathUtils.lerp(startFill, target.fill, t);
      chandelier.intensity = THREE.MathUtils.lerp(startChandelier, target.chandelier, t);
      environment = THREE.MathUtils.lerp(startEnvironment, target.environment, t);
      applyEnvironment();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scene) scene.environmentIntensity = originalEnvironmentIntensity;
      scene = null;
      // This borrowed point light belongs to the room being unloaded.
      chandelier.shadow.dispose();
    },
  };
  controller.reset();
  return controller;
}

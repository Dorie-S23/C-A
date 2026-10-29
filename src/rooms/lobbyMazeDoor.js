import * as THREE from 'three';
import { createMazePortalMaterial } from '../shaders/mazePortal.js';

// Level 3's way into the maze: one of the Lobby's bedroom doors
// (lobbyDoors.js), which one picked by tadcRoom.js each time the game runs.
// It looks and opens like all the others, onto the same black void, until
// Jax has run through it (levels/level3Lobby.js arms it). From then on its
// doorway is the maze's portal (shaders/mazePortal.js), twisting open as
// the door swings and shut again when it closes, and walking into it loads
// the maze. Which door it is, Pomni finds out by opening them.

const OPEN_SECONDS = 1.8;      // the twist open, once the door starts to swing
const CLOSE_SECONDS = 0.6;     // and shut again, quicker, when it closes
const TRIGGER_HALF_WIDTH = 1.0;
const TRIGGER_DEPTH = 1.3;     // how far the walk-in box reaches out from the doorway
const ARRIVAL_DISTANCE = 2.4;  // back out of the maze: this far out, clear of the box

/**
 * @param {import('./lobbyDoors.js').LobbyDoor} door from setupLobbyDoors().get, with a doorway
 * @param {{ armed: boolean, floorY: number }} options armed: it leads into the maze already
 * @returns {{ portal: { box: THREE.Box3, to: string, enabled: () => boolean, onMap: boolean,
 *   arrival: { spawn: THREE.Vector3, facing: number } }, readonly armed: boolean,
 *   readonly isOpen: boolean, arm: () => void, openNow: () => void,
 *   warmUp: (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void,
 *   update: (deltaSeconds: number) => void }}
 */
export function createLobbyMazeDoor(door, { armed: startArmed, floorY }) {
  const { doorway, outward } = door;
  const { width, height } = doorway.geometry.parameters;
  const portalMaterial = createMazePortalMaterial({ width, height });
  const voidMaterial = doorway.material;
  let armed = false;
  let progress = 0; // 0 sealed .. 1 open, eased into uOpen

  const centre = doorway.position.clone().setY(floorY);
  const across = new THREE.Vector3(-outward.z, 0, outward.x);
  const corners = [-1, 1].flatMap((side) => [-0.05, TRIGGER_DEPTH].map((out) => centre.clone()
    .addScaledVector(across, side * TRIGGER_HALF_WIDTH)
    .addScaledVector(outward, out)));
  const box = new THREE.Box3().setFromPoints(corners);
  box.min.y = floorY - 1;
  box.max.y = floorY + 3;

  const setProgress = (value) => {
    progress = value;
    portalMaterial.uniforms.uOpen.value = value * value * (3 - 2 * value);
  };
  const arm = () => {
    armed = true;
    doorway.material = portalMaterial;
  };
  if (startArmed) arm();

  return {
    portal: {
      box, to: 'maze',
      enabled: () => armed && door.isOpen && progress >= 1,
      // The minimap labels every portal; this one is Pomni's to find.
      onMap: false,
      // Yaw 0 faces -Z: facing out into the lobby is atan2 of `outward`, plus a half turn.
      arrival: {
        spawn: centre.clone().addScaledVector(outward, ARRIVAL_DISTANCE),
        facing: Math.atan2(outward.x, outward.z) + Math.PI,
      },
    },
    get armed() { return armed; },
    get isOpen() { return armed && progress >= 1; },
    arm,
    /** Open and already twisted open: stepping back out of the maze. */
    openNow() {
      door.open({ immediate: true });
      setProgress(1);
    },
    /** Builds the portal's shader under the loading screen, before it's needed. */
    warmUp(renderer, scene, camera) {
      if (armed) return;
      doorway.material = portalMaterial;
      renderer.compile(scene, camera);
      doorway.material = voidMaterial;
    },
    update(deltaSeconds) {
      portalMaterial.uniforms.uTime.value += deltaSeconds;
      const opening = armed && door.isOpen;
      if (opening && progress < 1) setProgress(Math.min(progress + deltaSeconds / OPEN_SECONDS, 1));
      else if (!opening && progress > 0) setProgress(Math.max(progress - deltaSeconds / CLOSE_SECONDS, 0));
    },
  };
}

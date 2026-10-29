import * as THREE from 'three';

// The maze's two hidden keepsakes (see src/state/mazeItems.js). Simple
// procedural props, same house style as the maze's own exit/hazard
// markers — no modeled asset exists for either, and the maze is dark
// enough that a plain unlit shape would be nearly invisible, so both glow
// gently like Level 2's photos (see officePicture.js's own pulseGlow,
// which this mirrors rather than imports — tied to a different
// userData.glow convention isn't worth sharing across two different prop
// shapes for two lines of code).
const GLOW_COLOR = 0xfff2c0;
const GLOW_PULSE_HZ = 0.6;
const GLOW_EMISSIVE_BASE = 0.4;
const GLOW_EMISSIVE_SWING = 0.5;
// Metres from a keepsake that "close enough to pick up" means. Both are
// tiny floor props at the back of a side pocket, too small to aim the
// crosshair at, so being near one with it in sight is enough: this covers
// the whole pocket from the corridor outside it (cells are 4.5 m, so the
// pocket's mouth is 2.25 m away), and main.js's line-of-sight check keeps
// it from reaching through a wall.
const PICKUP_RADIUS = 3;

function glowMaterial(color, { roughness = 0.5, metalness = 0.1 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness,
    emissive: new THREE.Color(GLOW_COLOR), emissiveIntensity: GLOW_EMISSIVE_BASE,
  });
}

/** A plain dark sphere, bowling-ball sized. Like the mug below, the
 * group's own origin is where it meets the floor, not its centre — so a
 * caller can place either one at a bare floor position with no per-shape
 * offset of its own. */
export function createBowlingBall() {
  const group = new THREE.Group();
  group.name = 'MazeFindable';
  const radius = 0.11;
  const material = glowMaterial(0x14141a, { roughness: 0.25, metalness: 0.4 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 16), material);
  ball.position.y = radius;
  ball.castShadow = true;
  ball.receiveShadow = true;
  group.add(ball);
  group.userData.glow = { material };
  return group;
}

/** A mug — cylinder body, torus handle, both sharing one material so they
 * glow together. */
export function createHotChocolateMug() {
  const group = new THREE.Group();
  group.name = 'MazeFindable';
  // A readable gameplay prop, still rooted at the same floor position.
  group.scale.setScalar(2.5);
  const material = glowMaterial(0xb5462f, { roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.1, 16), material);
  body.position.y = 0.05;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 8, 16, Math.PI * 1.4), material);
  handle.position.set(0.075, 0.05, 0);
  handle.rotation.set(0, Math.PI / 2, 0);
  handle.castShadow = true;
  group.add(handle);

  group.userData.glow = { material };
  return group;
}

/** Advances every still-placed findable's glow, same contract as
 * officePicture.js's pulseGlow — skips anything already picked up
 * (removed from the scene, so `.parent` is null) rather than needing the
 * caller to filter its own list as pickups happen. */
export function pulseGlow(findables, elapsedSeconds) {
  const wave = 0.5 + 0.5 * Math.sin(elapsedSeconds * GLOW_PULSE_HZ * Math.PI * 2);
  for (const findable of findables) {
    if (!findable.parent) continue;
    findable.userData.glow.material.emissiveIntensity = GLOW_EMISSIVE_BASE + GLOW_EMISSIVE_SWING * wave;
  }
}

/**
 * Places one findable on the floor and wires it into the E-interact
 * system, same shape as officePicture.js's placeOfficePicture: picking it
 * up removes it from the scene and records it in the shared maze item
 * state, and does nothing if it was already collected on a previous visit.
 * Anchored like an NPC, so it's offered within PICKUP_RADIUS without aiming.
 *
 * @param {{ group: THREE.Group, interactables?: Array }} room
 * @param {{ hasCollected: (id: string) => boolean, collect: (id: string) => void }} items
 * @param {string} itemId
 * @param {string} label shown in the pickup prompt ("Pick up <label>")
 * @param {() => THREE.Group} createMesh
 * @param {THREE.Vector3} position floor position; the mesh sits a little above it
 * @param {() => number} [rng] Optional seeded stream for repeatable prop rotation.
 * @returns {THREE.Group | null} the placed mesh (for pulseGlow), or null
 *   if it was already collected and nothing was placed
 */
export function placeMazeFindable(room, items, itemId, label, createMesh, position, rng = Math.random) {
  if (items.hasCollected(itemId)) return null;

  const mesh = createMesh();
  mesh.position.copy(position);
  mesh.rotation.y = rng() * Math.PI * 2;
  room.group.add(mesh);
  mesh.updateMatrixWorld(true);

  const objects = [];
  mesh.traverse((child) => { if (child.isMesh) objects.push(child); });

  const pickup = {
    objects,
    anchor: mesh,
    radius: PICKUP_RADIUS,
    // The line-of-sight check's own default aims at head height above the
    // anchor (right for an NPC, whose anchor is its feet) — for a prop
    // already sitting right at that height, that reads as "blocked" under
    // any overhang the prop itself is in plain view under.
    sightHeight: 0.3,
    enabled: () => Boolean(mesh.parent) && !items.hasCollected(itemId),
    prompt: () => `Pick up ${label}`,
    interact: () => {
      if (!mesh.parent || items.hasCollected(itemId)) return;
      mesh.removeFromParent();
      items.collect(itemId);
      const list = room.interactables;
      const index = list.indexOf(pickup);
      if (index !== -1) list.splice(index, 1);
    },
  };
  room.interactables = [...(room.interactables ?? []), pickup];
  return mesh;
}

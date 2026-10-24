import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadRoomModel } from './loadRoomModel.js';
import { setupLobbyDoors } from './lobbyDoors.js';
import { createCurtainPortal } from './portals.js';
import { scatterPictures } from '../props/officePicture.js';
import { createStaircase } from '../props/accessStairs.js';
import { LOBBY_LANDMARKS, nearestLandmark } from './lobbyLandmarks.js';
import { LOBBY_REACH } from './lobbyReach.js';
import { decodeReachMap } from './reachMap.js';

// Level 2's five office photos (see PHOTO_COUNT in level2Items.js),
// scattered round the lobby rather than sitting in Kaufmo's own room — a
// real search, not a hand-in on arrival. scatterPictures() keeps wall spots
// in the shared item state for the whole attempt. Only a retry or New Game
// picks new positions. ca6.png exists alongside these but isn't used.
const PICTURES = [
  { id: 'ca1', url: './models/objects/ca1.png' },
  { id: 'ca2', url: './models/objects/ca2.png' },
  { id: 'ca3', url: './models/objects/ca3.png' },
  { id: 'ca4', url: './models/objects/ca4.png' },
  { id: 'ca5', url: './models/objects/ca5.png' },
];

// The castle's brick walls (arched windows, battlements), taken from the
// Sketchfab "The Digital Circus" model. The lobby's own export only has a
// single unrepeated segment of each, with the brick texture missing.
const CASTLE_WALLS_URL = './models/world/castle-brick-walls.glb';
const CASTLE_WALL_MATERIALS = /^(RandomCol|RandomCol3)$/;
// The lobby's rainbow arches are flat and stand 0.1 m behind the front of
// the Sketchfab wall (whose own arches are thicker), so push the wall back.
const CASTLE_WALL_SETBACK = 0.2;
// The red curtained arch by the toy blocks leads to the Dorm Hall. It opens
// toward +Z, into the lobby.
const DORM_ARCH_CURTAIN = 'Plane081';

// A small riser up to a platform, for actual elevation change — the lobby
// otherwise never takes the player off one flat floor. Measured against
// the real model (tools/verify_lobby_stairs.mjs): this stretch (x 0.5-3.5,
// z 3-12 at floor y≈0.26) is open floor with 6m+ headroom the whole way,
// clear of the stage, doors and everything scatterPictures might use.
const STAIRS_BASE = { x: 2, z: 3 };
const STAIRS_FLOOR_Y = 0.26;

// A photo spot this close to a landmark counts as on it: one photo each.
const LANDMARK_REACH = 6;
// Where Pomni can walk (tools/buildLobbyReach.mjs). A photo has to be in
// plain view from walkable floor this close, well inside E's 4.5 m reach.
const lobbyReach = decodeReachMap(LOBBY_REACH);
const PHOTO_VIEW_DISTANCE = 2.5;
const EYE_HEIGHT = 1.5;

export function loadTadcRoom(onProgress, { from, items } = {}) {
  return Promise.all([
    loadRoomModel('./models/world/Circus%20Lobby%20V10%20colored.glb', onProgress),
    new GLTFLoader().loadAsync(CASTLE_WALLS_URL),
  ]).then(([room, castleWalls]) => {
    // Captured before the arrival override below can replace it — the
    // search sweeps from the room's own default spawn regardless of which
    // door the player actually walked in through.
    const defaultSpawn = room.spawn;
    replaceCastleWalls(room, castleWalls.scene);
    fixExportedPlastics(room.group);
    useRealVertexColours(room.group);
    tidyStageEdge(room.group);
    singleSided(room.group, SINGLE_SIDED);
    const doors = setupLobbyDoors(room.group, room.spawn, room.collisionMeshes);
    room.interactables = doors.interactables;
    room.update = doors.update;
    // The lobby's real metals (railings, stage trim) need something to reflect.
    room.environment = true;

    const dormArch = createCurtainPortal(room.group, DORM_ARCH_CURTAIN, 1, 'dorm');
    if (dormArch) {
      room.portals = [dormArch];
      if (from === 'dorm') {
        room.spawn = dormArch.arrival.spawn;
        room.spawnFacing = dormArch.arrival.facing;
      }
    }
    if (items) {
      const pictures = scatterPictures(room, items, PICTURES, defaultSpawn, [dormArch?.box.getCenter(new THREE.Vector3())], {
        zoneOf: (spot) => nearestLandmark(spot.position.x, spot.position.z, LANDMARK_REACH) ?? spot.object,
        isOpen: (origin) => lobbyReach.has(origin.x, origin.z),
        isReachable: (spot) => photoInView(room.group, spot, defaultSpawn.y),
      });
      room.photoPositions = pictures.remaining;
      const doorsUpdate = room.update;
      room.update = (deltaSeconds, playerPosition) => {
        doorsUpdate(deltaSeconds, playerPosition);
        pictures.update(deltaSeconds);
      };
    }
    // Added after scatterPictures (if it ran) has already committed to its
    // wall spots — its sweep rays hit room.group directly, so a staircase
    // added any earlier would've been fair game for a picture to land on.
    const stairs = createStaircase({ base: STAIRS_BASE, floorY: STAIRS_FLOOR_Y });
    room.group.add(stairs.group);
    room.collisionMeshes.push(...stairs.colliders);
    room.stairs = stairs.zone; // main.js hints the backwards long jump here
    room.mapLandmarks = LOBBY_LANDMARKS;
    return room;
  });
}

const viewRaycaster = new THREE.Raycaster();

/**
 * Whether some walkable floor within PHOTO_VIEW_DISTANCE of a photo spot
 * sees it unobstructed, trying the floor straight out in front of it
 * first. Without this a spot could be on the inside of a sealed gap in
 * the toy blocks: near the floor plan's walkable cells, but out of sight.
 */
function photoInView(group, { position, rotationY }, floorY) {
  const front = { x: position.x + Math.sin(rotationY) * 1.5, z: position.z + Math.cos(rotationY) * 1.5 };
  const cells = [];
  const step = lobbyReach.step;
  for (let dx = -PHOTO_VIEW_DISTANCE; dx <= PHOTO_VIEW_DISTANCE; dx += step) {
    for (let dz = -PHOTO_VIEW_DISTANCE; dz <= PHOTO_VIEW_DISTANCE; dz += step) {
      if (Math.hypot(dx, dz) > PHOTO_VIEW_DISTANCE) continue;
      const x = position.x + dx, z = position.z + dz;
      if (lobbyReach.has(x, z)) cells.push({ x, z, order: Math.hypot(x - front.x, z - front.z) });
    }
  }
  cells.sort((a, b) => a.order - b.order);
  const eye = new THREE.Vector3();
  const toPhoto = new THREE.Vector3();
  for (const { x, z } of cells) {
    eye.set(x, floorY + EYE_HEIGHT, z);
    toPhoto.subVectors(position, eye);
    const distance = toPhoto.length();
    viewRaycaster.set(eye, toPhoto.normalize());
    viewRaycaster.far = distance - 0.05;
    if (viewRaycaster.intersectObject(group, true).length === 0) return true;
  }
  return false;
}

/** Swaps the lobby's stub castle walls for the full ones, collision included. */
function replaceCastleWalls(room, walls) {
  const stubs = [];
  room.group.traverse((child) => {
    if (child.isMesh && CASTLE_WALL_MATERIALS.test(child.material.name)) stubs.push(child);
  });
  for (const stub of stubs) stub.removeFromParent();
  room.collisionMeshes = room.collisionMeshes.filter((entry) => !stubs.includes(entry.mesh));

  walls.position.z += CASTLE_WALL_SETBACK;
  room.group.add(walls);
  walls.updateMatrixWorld(true);
  walls.traverse((child) => {
    if (!child.isMesh) return;
    // These wall blocks are thin slabs, front and back faces millimetres
    // apart, exported double-sided: from any distance each block's back
    // face fought its front one for the same pixels, flickering in bands as
    // the camera moved. Each slab has a face on both sides, so drawing only
    // front faces loses nothing.
    for (const material of [child.material].flat()) material.side = THREE.FrontSide;
    child.castShadow = true;
    child.receiveShadow = true;
    room.collisionMeshes.push({ mesh: child, box: new THREE.Box3().setFromObject(child) });
  });
}

// Thin, closed pieces of the lobby's own export that, double-sided, have
// their back faces fighting their front ones (see replaceCastleWalls).
// They share materials with the rest of the lobby, so each gets its own.
const SINGLE_SIDED = ['Castle_Stairs'];

function singleSided(group, names) {
  for (const name of names) {
    const mesh = group.getObjectByName(name);
    if (!mesh?.isMesh) continue;
    mesh.material = [mesh.material].flat().map((material) => {
      const own = material.clone();
      own.side = THREE.FrontSide;
      return own;
    });
    if (mesh.material.length === 1) mesh.material = mesh.material[0];
  }
}

const TRANSMISSION_IGNORED = 0.1; // below this, a material's see-through look isn't worth it

// The stage's gold edge band sits a little inside the wooden stage at its
// ends, so the wood pokes through, and a second, lower gold strip shows in
// patches underneath it at floor level. Widen the band just past the wood
// (about the stage's centre) and drop the strip it already covers.
const STAGE_TRIM = 'Plane002';
const STAGE_UNDER_STRIP = 'Plane006';
const STAGE_TRIM_GROWTH = 1.015;

function tidyStageEdge(group) {
  const trim = group.getObjectByName(STAGE_TRIM);
  const floor = group.getObjectByName('Stage_Floor');
  group.getObjectByName(STAGE_UNDER_STRIP)?.removeFromParent();
  if (!trim || !floor) return;
  // Scale in the trim's parent space about the stage's centre there.
  group.updateMatrixWorld(true);
  const centre = new THREE.Box3().setFromObject(floor).getCenter(new THREE.Vector3());
  trim.parent.worldToLocal(centre);
  trim.position.sub(centre).multiply(new THREE.Vector3(STAGE_TRIM_GROWTH, 1, STAGE_TRIM_GROWTH)).add(centre);
  trim.scale.multiply(new THREE.Vector3(STAGE_TRIM_GROWTH, 1, STAGE_TRIM_GROWTH));
  trim.updateMatrixWorld(true);
}

/**
 * A few of the lobby's vertex-coloured pieces (the hanging pot by the
 * castle) exported their colours into the second colour layer, with the
 * first left plain white — and three.js only reads the first, so they came
 * out untextured white. Where an untextured piece's first layer is all
 * white and its second isn't, use the second. (Textured pieces — floors,
 * frames, rugs — keep white first layers on purpose, under their textures.)
 */
function useRealVertexColours(group) {
  group.traverse((child) => {
    const { color, color_1: second } = child.geometry?.attributes ?? {};
    if (!child.isMesh || !color || !second) return;
    if ([child.material].flat().some((material) => material.map)) return;
    const allWhite = (attribute) => {
      for (let i = 0; i < attribute.count; i++) {
        if (attribute.getX(i) < 0.99 || attribute.getY(i) < 0.99 || attribute.getZ(i) < 0.99) return false;
      }
      return true;
    };
    if (allWhite(color) && !allWhite(second)) child.geometry.setAttribute('color', second);
  });
}

/**
 * Most of the lobby (doors, buildings, props) uses vertex-coloured
 * "Plastic" materials whose Blender shaders the glTF exporter couldn't
 * translate, so it wrote them out as fully metallic and fully rough. A
 * metal shows no diffuse colour at all — only reflections — so they
 * rendered nearly black. Restore them to plain non-metals so their vertex
 * colours show. Also turns off the walls' token transmission (see below).
 */
function fixExportedPlastics(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.metalness >= 0.99 && material.roughness >= 0.99 && !material.metalnessMap) {
        material.metalness = 0;
      }
      // The tent's walls ("Circus Tent") export with a token 3% transmission.
      // three.js draws any transmissive surface see-through, with a blurred,
      // low-resolution copy of what's behind it redrawn every frame — so
      // faint ghosts of the ledges and blocks behind each wall flickered as
      // the camera moved. Too faint to be worth an extra render pass anyway.
      if (material.transmission > 0 && material.transmission < TRANSMISSION_IGNORED) {
        material.transmission = 0;
      }
    }
  });
}

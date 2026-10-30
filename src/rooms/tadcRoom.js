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
import { createLobbyMazeDoor } from './lobbyMazeDoor.js';
import { loadJax } from '../characters/jax.js';
import { PHOTO_URLS } from '../state/level2Items.js';

// Level 2's five office photos (see PHOTO_COUNT in level2Items.js),
// scattered on the floor round the lobby rather than sitting in Kaufmo's
// own room — a real search, not a hand-in on arrival. scatterPictures()
// keeps the floor spots in the shared item state for the whole attempt.
// Only a retry or New Game picks new positions.
const PICTURES = Object.entries(PHOTO_URLS).map(([id, url]) => ({ id, url }));

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
// ...and out in the open, not tucked behind a building: seen from at
// least PHOTO_OPEN_MIN points of a PHOTO_OPEN_STEP grid of walkable floor
// within PHOTO_OPEN_RADIUS. A spot with nothing in the way sees ~56, so
// this is half of that. Measured against the real Lobby, the close-up
// check alone let a few spots through that only a narrow pocket of floor
// could see.
const PHOTO_OPEN_RADIUS = 12;
const PHOTO_OPEN_STEP = 2;
const PHOTO_OPEN_MIN = 28;
// One photo always lands on top of the small red/orange stair landing
// near the stage (playtest request, confirmed by screenshot) — an
// unnamed six-step staircase, not in lobbyReach (it's not flat ground,
// so the walkable-floor map skips it). y is explicit rather than found
// by the usual downward raycast: real floor is visible underneath the
// landing through the open stair structure, and "lowest hit" (the right
// call almost everywhere else, to skip a shelf/ceiling above the real
// floor) finds that lower floor instead of the landing itself here.
const STAGE_STEPS_SPOT = { x: 2, y: 2.24, z: 8.6 };
// And one up in the blue castle, on its second floor (y 10.27, x -28 to
// -21 along the top of its stairs), so the climb has a reason.
const CASTLE_TOP_SPOT = { x: -24.5, y: 10.27, z: 79.3 };

// The castle's stairs (Castle_Stairs) climb 10 m over 8.8 m in 0.48 m steps,
// with a first step of 0.95 m: every one of them taller than Pomni can step
// up (STEP_HEIGHT, 0.4 m), so they stopped her dead. Walked on instead: an
// unseen ramp along the steps' front edges, from the floor at its foot to
// the second floor at its head (x, y measured against the real model: the
// edges rise 1.143 m a metre, 48.8°, inside main.js's walkable slope), then
// flat across the steps' top landing onto the second floor (from x -21.6),
// and the steps themselves no longer collide. They still draw as steps.
const CASTLE_RAMP = { foot: { x: -11.6, y: 0.26 }, head: { x: -20.4, y: 10.27 }, landing: -22, lift: 0.02 };

// Level 3's way into the maze (lobbyMazeDoor.js): one of the bedroom doors
// along the wall, chosen each run. Plane119 is the north-end door nearest
// the Dorm Hall curtain, so leave it as an ordinary bedroom door.
const MAZE_DOORS = ['Plane120', 'Plane122', 'Plane123', 'Plane124'];
const MAZE_DOOR = MAZE_DOORS[Math.floor(Math.random() * MAZE_DOORS.length)];
// Where Pomni finds Jax (levels/level3Lobby.js): alone in the corner the
// toy blocks make with that wall's north end, a few steps from the arch,
// back turned to the Lobby. He runs off south along the doors.
const JAX_CORNER = {
  spot: { x: 163.3, z: -42.6 },
  facing: { x: 165.2, z: -44.4 },
  runTo: { x: 163.6, z: -12 },
};

/**
 * @param {{ from?: string, items?: object, mazeDoor?: 'jax' | 'open' | null }} [options]
 *   mazeDoor: none before Level 3; 'jax' while Jax is here to be found
 *   (he's loaded for that scene), its door still leading nowhere; 'open'
 *   once he's run through it
 */
export function loadTadcRoom(onProgress, { from, items, mazeDoor } = {}) {
  const findJax = mazeDoor === 'jax';
  return Promise.all([
    loadRoomModel('./models/world/Circus%20Lobby%20V10%20colored.glb', onProgress),
    new GLTFLoader().loadAsync(CASTLE_WALLS_URL),
    findJax ? loadJax() : null,
  ]).then(([room, castleWalls, jaxApi]) => {
    // Captured before the arrival override below can replace it — the
    // search sweeps from the room's own default spawn regardless of which
    // door the player actually walked in through.
    const defaultSpawn = room.spawn;
    replaceCastleWalls(room, castleWalls.scene);
    fixExportedPlastics(room.group);
    useRealVertexColours(room.group);
    tidyStageEdge(room.group);
    singleSided(room.group, SINGLE_SIDED);
    separateFlushBlocks(room);
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
        isReachable: (spot) => photoInView(room.group, spot, defaultSpawn.y)
          && photoInOpen(room.group, spot, defaultSpawn.y),
        pinned: [{ id: PICTURES[0].id, ...STAGE_STEPS_SPOT }, { id: PICTURES[1].id, ...CASTLE_TOP_SPOT }],
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
    // After the photos too, or one could land on its (unseen) slope.
    smoothCastleStairs(room);
    const stairs = createStaircase({ base: STAIRS_BASE, floorY: STAIRS_FLOOR_Y });
    room.group.add(stairs.group);
    room.collisionMeshes.push(...stairs.colliders);
    room.stairs = stairs.zone; // main.js hints the backwards long jump here
    room.mapLandmarks = LOBBY_LANDMARKS;
    if (mazeDoor) addMazeDoor(room, doors, { armed: !findJax, floorY: defaultSpawn.y, from, jaxApi });
    return room;
  });
}

/**
 * This run's maze door and its portal, and while he's here to be found,
 * Jax in his corner (visible from the start, so his shaders and light
 * compile with the room's). The scene that drives him hooks in through
 * room.storyUpdate.
 */
function addMazeDoor(room, doors, { armed, floorY, from, jaxApi }) {
  const door = doors.get(MAZE_DOOR);
  if (!door?.doorway) return;
  const mazeDoor = Object.assign(createLobbyMazeDoor(door, { armed, floorY }), { frameName: MAZE_DOOR });
  room.mazeDoor = mazeDoor;
  room.portals = [...(room.portals ?? []), mazeDoor.portal];
  if (from === 'maze' && armed) {
    room.spawn = mazeDoor.portal.arrival.spawn;
    room.spawnFacing = mazeDoor.portal.arrival.facing;
    mazeDoor.openNow();
  }
  const updates = [mazeDoor.update];
  const warmUp = room.warmUp;
  room.warmUp = (renderer, scene, camera) => {
    warmUp?.(renderer, scene, camera);
    mazeDoor.warmUp(renderer, scene, camera);
  };
  if (jaxApi) {
    const point = ({ x, z }) => new THREE.Vector3(x, floorY, z);
    const corner = { spot: point(JAX_CORNER.spot), facing: point(JAX_CORNER.facing), runTo: point(JAX_CORNER.runTo) };
    jaxApi.jax.position.copy(corner.spot);
    jaxApi.jax.rotation.y = Math.atan2(corner.facing.x - corner.spot.x, corner.facing.z - corner.spot.z);
    jaxApi.jax.visible = true;
    jaxApi.setGlitching(true);
    room.group.add(jaxApi.jax);
    room.jaxCorner = { jaxApi, ...corner };
    updates.push(jaxApi.update);
  }
  const roomUpdate = room.update;
  room.update = (deltaSeconds, playerPosition) => {
    roomUpdate(deltaSeconds, playerPosition);
    for (const update of updates) update(deltaSeconds);
    room.storyUpdate?.(deltaSeconds, playerPosition);
  };
}

const viewRaycaster = new THREE.Raycaster();

/**
 * Walkable floor cells within `radius` of a photo spot on a `step` grid.
 * Lying flat and face-up, a photo is visible from any direction (unlike a
 * wall mount, there's no "behind the frame" side to exclude).
 */
function floorAround({ position }, radius, step) {
  const cells = [];
  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      if (Math.hypot(dx, dz) > radius) continue;
      const x = position.x + dx, z = position.z + dz;
      if (lobbyReach.has(x, z)) cells.push({ x, z });
    }
  }
  return cells;
}

const eye = new THREE.Vector3();
const toPhoto = new THREE.Vector3();

/**
 * Nothing between an eye on the floor cell (x, z) and the photo. Cast
 * both ways: the castle walls and stairs draw front faces only, and a ray
 * passes straight through the back of a single-sided mesh.
 */
function photoSeenFrom(group, position, x, z, floorY) {
  eye.set(x, floorY + EYE_HEIGHT, z);
  toPhoto.subVectors(position, eye);
  const distance = toPhoto.length() - 0.05;
  toPhoto.normalize();
  viewRaycaster.far = distance;
  viewRaycaster.set(eye, toPhoto);
  if (viewRaycaster.intersectObject(group, true).length) return false;
  viewRaycaster.set(position, toPhoto.negate());
  return viewRaycaster.intersectObject(group, true).length === 0;
}

/**
 * Whether some walkable floor within PHOTO_VIEW_DISTANCE of a photo spot
 * sees it unobstructed, trying the nearest floor cells first. Without this
 * a spot could be on the inside of a sealed gap in the toy blocks: near
 * the floor plan's walkable cells, but out of sight.
 */
function photoInView(group, spot, floorY) {
  const { position } = spot;
  const cells = floorAround(spot, PHOTO_VIEW_DISTANCE, lobbyReach.step);
  cells.sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z) - Math.hypot(b.x - position.x, b.z - position.z));
  return cells.some(({ x, z }) => photoSeenFrom(group, position, x, z, floorY));
}

/** Whether enough of the floor around a photo spot sees it (PHOTO_OPEN_MIN). */
function photoInOpen(group, spot, floorY) {
  const cells = floorAround(spot, PHOTO_OPEN_RADIUS, PHOTO_OPEN_STEP);
  let seen = 0;
  for (const [i, { x, z }] of cells.entries()) {
    if (photoSeenFrom(group, spot.position, x, z, floorY) && ++seen >= PHOTO_OPEN_MIN) return true;
    if (seen + cells.length - 1 - i < PHOTO_OPEN_MIN) return false;
  }
  return false;
}

/** Lays CASTLE_RAMP over the castle's stairs, as wide as they are, and takes the steps out of collision. */
function smoothCastleStairs(room) {
  const steps = room.group.getObjectByName('Castle_Stairs');
  if (!steps) return;
  room.collisionMeshes = room.collisionMeshes.filter((entry) => entry.mesh !== steps);
  const { min, max } = new THREE.Box3().setFromObject(steps);
  const { foot, head, landing, lift } = CASTLE_RAMP;
  room.group.updateMatrixWorld(true);
  const corner = (x, y, z) => room.group.worldToLocal(new THREE.Vector3(x, y + lift, z));
  const points = [
    corner(foot.x, foot.y, min.z), corner(foot.x, foot.y, max.z),
    corner(head.x, head.y, max.z), corner(head.x, head.y, min.z),
    corner(landing, head.y, max.z), corner(landing, head.y, min.z),
  ];
  // Unshared corners per face, so each keeps its own (slope or flat) normal.
  const faces = [[0, 1, 2], [0, 2, 3], [3, 2, 4], [3, 4, 5]];
  const geometry = new THREE.BufferGeometry().setFromPoints(faces.flat().map((i) => points[i]));
  geometry.computeVertexNormals();
  // Facing up, so floor rays land on it and the wall probes see a ramp.
  if (geometry.attributes.normal.getY(0) < 0) {
    geometry.setFromPoints(faces.map(([a, b, c]) => [a, c, b]).flat().map((i) => points[i]));
    geometry.computeVertexNormals();
  }
  const ramp = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  ramp.name = 'CastleStairsRamp';
  ramp.visible = false; // walked on, never drawn
  room.group.add(ramp);
  room.collisionMeshes.push({ mesh: ramp, box: new THREE.Box3().setFromObject(ramp) });
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

// The lobby's toy-block walls ("Rubber" and "Plastic" pieces, many of
// them whole stacks of blocks merged into one mesh) were modelled with
// neighbours overlapping a few millimetres, their faces flush. Where two
// overlap, each one's face is in the very same place as the other's, and as
// they're different colours the overlap flickers (z-fights) as the camera
// moves. Moving geometry would shift whole walls, so each piece gets its own
// small depth bias instead (polygon offset, one of FLUSH_LAYERS steps):
// where two faces coincide, the one with the stronger bias always wins.
// The steps are fractions of the depth buffer's resolution, far too small to
// push anything visibly through anything else.
const FLUSH_MATERIALS = new Set(['Rubber', 'Plastic']);
const FLUSH_LAYERS = 16;

function separateFlushBlocks(room) {
  let index = 0;
  room.group.traverse((mesh) => {
    if (!mesh.isMesh || mesh.isSkinnedMesh) return;
    const materials = [mesh.material].flat();
    if (!materials.some((material) => FLUSH_MATERIALS.has(material.name))) return;
    // Neighbours are usually consecutive in the export, so stepping by a
    // number coprime to FLUSH_LAYERS keeps neighbours on different layers.
    const layer = (index++ * 5) % FLUSH_LAYERS;
    const own = materials.map((material) => {
      if (!FLUSH_MATERIALS.has(material.name)) return material;
      const copy = material.clone();
      copy.polygonOffset = true;
      copy.polygonOffsetFactor = 0;
      copy.polygonOffsetUnits = -layer;
      return copy;
    });
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
  });
}

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

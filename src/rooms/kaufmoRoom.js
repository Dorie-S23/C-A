import * as THREE from 'three';
import { loadRoomModel } from './loadRoomModel.js';
import { loadKaufmoTalk, WRITE_SECONDS } from '../characters/kaufmoTalk.js';
import { makeDoorOpenable, openHingedDoor } from './doors.js';
import { createDoorPortal } from './portals.js';
import { photoUrls } from '../state/level2Items.js';
import { createAbstractionEffect } from '../effects/abstraction.js';
import { createTheoryWall } from '../props/theoryWall.js';
import { findWallSpot } from '../props/officePicture.js';

const DOOR_FRAME_NAME = 'Door_Frame';
const DOOR_SLAB_NAME = 'Door_Slab';

// Talking to Kaufmo is shot from above the bed's near edge, looking across
// the room: the two of them a conversational step apart in the middle of
// the floor (where the rocking horse stood), Kaufmo screen right, Pomni
// screen left, level with him. Positions are this export's (x
// across, z toward the bed), y above the floor. They mostly face each
// other, turned only slightly toward the camera (TALK_TURN_TO_CAMERA: 0 =
// straight at the other, 1 = straight at the camera); much more read as
// playing to an audience. See talkShot / talkToKaufmo.
const TALK_CAMERA = { x: 0.4, y: 2.5, z: 2.4 };
const TALK_KAUFMO = { x: 0.75, z: -0.95 };
const TALK_POMNI = { x: -0.6, z: -0.93 };
const TALK_TURN_TO_CAMERA = 0.2;
const TALK_AIM_HEIGHT = 1.05;
// Pomni's head turns the rest of the way to him and tilts up to this point
// above his feet, just over his face: he's a head taller than her.
const TALK_POMNI_LOOK_HEIGHT = 1.75;

// The rocking horse in the middle of the floor was in the way, of walking
// round and of the conversation shot, so it's taken out of the room. Its
// parts have generic export names (Plane, Cylinder), so they're matched by
// name and by where they stand.
const ROCKING_HORSE_PARTS = new Set(['Cylinder', 'Plane', 'Plane007', 'Plane009', 'Plane011', 'Plane014', 'Vert001']);
const ROCKING_HORSE_AREA = new THREE.Box3(new THREE.Vector3(-1.5, -0.5, -3.6), new THREE.Vector3(0.9, 2.5, -1.6));

// The walls' bottom strip, a skirting band in the export, measured up from
// the wall mesh's own bottom (local units; the walls aren't scaled).
const SKIRTING_HEIGHT = 0.48;
// The yellow spiky crown on the bookshelf, exported sunk into its board.
const SHELF_CROWN = 'TwistedTorus';
const BOOKSHELF = 'Plane012';

// Between conversations he's at the clear wall across from the door
// (+X, between the armchair and the nightstand), working on his theory:
// writing a block of it at one spot, stepping back to think it over,
// then on to the next spot along the wall (see createWallRoutine). The
// wall itself is props/theoryWall.js.
const THEORY_WALL_DIRECTION = new THREE.Vector3(1, 0, 0);
const THEORY_WALL_ORDER = 10; // after the graffiti panels (render orders 0-3)
const WALL_SPOTS = [-0.6, 0.05, 0.65]; // metres along the wall from its middle, toward +Z
const WALL_STAND = 0.42;               // how far from the wall he stands to write: his marker's reach
const THEORIZE_STEP_BACK = 0.5;        // and how much further back he stands to think
const THEORIZE_SECONDS = 9;
const WALK_SPEED = 0.7;                // m/s, between spots

/**
 * Loads Kaufmo's Room, exported from "Kaufmos Room V4.blend" via
 * tools/blender/export_kaufmos_room.py, plus Kaufmo himself standing in it.
 * Walking up and pressing E plays the Level 2 opening script, via the
 * `playDialogue` hook main.js passes every room loader (see selectRoom()).
 */
export function loadKaufmoRoom(onProgress, {
  playDialogue, from, items, kaufmoStory,
} = {}) {
  return Promise.all([
    loadRoomModel('./models/character%20rooms/kaufmos-room.glb', onProgress),
    loadKaufmoTalk(),
    loadWallArt(),
  ]).then(([room, kaufmoApi, wallArt]) => {
    const { kaufmo, collider } = kaufmoApi;
    fixExportedMaterials(room.group);
    paintGraffiti(room.group, wallArt);
    woodenSkirting(room.group);
    seatOnShelf(room, SHELF_CROWN, BOOKSHELF);
    removeRockingHorse(room);
    // Kaufmo always stands relative to the room's own default spawn, even
    // when `from` below moves the player's actual spawn to the doorway.
    const defaultSpawn = room.spawn;

    const door = openHingedDoor(room.group, DOOR_FRAME_NAME, DOOR_SLAB_NAME, room.spawn, room.collisionMeshes);
    let doorControl = null;
    if (door) {
      const portal = createDoorPortal(room.group, door.frameBox, room.spawn, 'dorm');
      room.portals = [portal];
      if (from === 'dorm') {
        room.spawn = portal.arrival.spawn;
        room.spawnFacing = portal.arrival.facing;
      }
      // Shut until Pomni opens it with E (see makeDoorOpenable).
      doorControl = makeDoorOpenable(room, door, { portal });
      // For main.js to show the real Dorm Hall through it and walk her out
      // (walkInLink.js), the portal's only taken while that's not ready.
      // Hidden from the hall's side: its own door is the one in the doorway.
      room.hallDoor = {
        frameBox: door.frameBox, inside: defaultSpawn.clone(), control: doorControl, portal,
        parts: [door.frame, door.slab.parent,
          room.group.getObjectByName('Kaufmo_Icon'), portal.glimpse].filter(Boolean),
      };
      // Walking in from the hall: it stands open, as the hall's does.
      room.openDoorway = () => doorControl.open({ immediate: true });
    }
    // The hall's environment lighting, at nothing: it looks as it always
    // has, but its shaders are the hall's kind, so either room can be seen
    // from the other, and main.js eases between the two as she walks through.
    room.environment = true;
    room.environmentIntensity = 0;

    placeInMiddleOfRoom(kaufmo, { group: room.group, spawn: defaultSpawn });
    // Found before he's in the room, so the ray can't catch him instead.
    const wallSpot = findWallSpot(room.group, kaufmo.position.clone().setY(kaufmo.position.y + 1.3), THEORY_WALL_DIRECTION);
    room.group.add(kaufmo);
    kaufmo.updateMatrixWorld(true);
    // Dynamic: he's moved to his mark for a conversation (see talkShot), and
    // main.js keeps a dynamic entry's box wherever he is.
    room.collisionMeshes.push({ mesh: collider, box: new THREE.Box3().setFromObject(collider), dynamic: true });
    room.talkShot = talkShot(kaufmo.position);

    if (wallSpot) {
      wallSpot.position.y = kaufmo.position.y;
      const theoryWall = createTheoryWall(wallSpot);
      // His notes go over the graffiti (paintGraffiti): drawn after it.
      theoryWall.group.traverse((object) => { if (object.isMesh) object.renderOrder = THEORY_WALL_ORDER; });
      room.group.add(theoryWall.group);
      // Once he has the photos, they're up on the wall with the rest.
      const presented = items?.snapshot?.().presented ?? [];
      if (items?.isDone?.() && presented.length) theoryWall.pin(photoUrls(presented));
      room.theoryWall = theoryWall;
      room.kaufmoRoutine = createWallRoutine(kaufmoApi, wallSpot, theoryWall);
      room.kaufmoRoutine.resume();
    }
    // For when the search clock runs out and he comes apart (main.js
    // kaufmoOutOfTime). Hidden, and free, until that's driven.
    kaufmoApi.abstraction = createAbstractionEffect(kaufmo);

    if (playDialogue) {
      // His collider counts as him too: main.js's line-of-sight check skips
      // an interactable's own objects, and without it his own cylinder
      // blocked the view of him, so the prompt only came up when the
      // crosshair happened to land on his mesh. It's also a bigger, easier
      // target for the crosshair than his thin limbs.
      const objects = [collider];
      kaufmo.traverse((child) => {
        if (child.isMesh && child !== collider) objects.push(child);
      });
      room.interactables = [...(room.interactables ?? []), {
        objects,
        anchor: kaufmo, radius: 3.2,
        prompt: () => ((kaufmoStory?.introduced?.() ?? true) && items?.heldCount() > 0 ? 'Give photos to Kaufmo' : 'Talk to Kaufmo'),
        interact: () => kaufmoStory.talk(kaufmoApi),
      }];
    }
    if (doorControl) {
      room.interactables = [...(room.interactables ?? []), doorControl.interactable];
    }
    room.update = (deltaSeconds, playerPosition) => {
      room.kaufmoRoutine?.update(deltaSeconds);
      kaufmoApi.update(deltaSeconds);
      room.kaufmoRoutine?.afterPose(deltaSeconds);
      room.handInPhotos?.update(deltaSeconds);
      kaufmoApi.abstraction.update(deltaSeconds);
      doorControl?.update?.(deltaSeconds, playerPosition);
    };

    // Exposed so a caller outside this closure (main.js's Level 3 dev-jump
    // button) can trigger the real talkToKaufmo(kaufmoApi, ...) itself,
    // the same call kaufmoStory.talk above already makes from in-room E.
    room.kaufmoApi = kaufmoApi;

    return room;
  });
}

/**
 * The walls' bottom strip (SKIRTING_HEIGHT) is UV-mapped to the last rows
 * of the wall pattern over again, so under the painted graffiti it showed
 * a squashed second copy of the drawings. It's given the room's own dark
 * wood instead, as a skirting board: its triangles move to an extra
 * material group on each wall mesh (the mesh and its collision unchanged).
 */
function woodenSkirting(group) {
  let wood = null;
  group.traverse((mesh) => {
    if (mesh.isMesh && !Array.isArray(mesh.material) && mesh.material.name === 'Dark Wood (Shiny)') wood ??= mesh.material;
  });
  if (!wood) return;
  const skirting = wood.clone();
  skirting.name = 'Kaufmo Skirting';

  const walls = [];
  group.traverse((mesh) => {
    if (mesh.isMesh && mesh.geometry.index
      && [mesh.material].flat().some((material) => material.name?.startsWith('Kaufmo Walls'))) walls.push(mesh);
  });
  for (const mesh of walls) {
    const { geometry } = mesh;
    const materials = [mesh.material].flat();
    const index = geometry.index;
    const position = geometry.attributes.position;
    geometry.computeBoundingBox();
    const top = geometry.boundingBox.min.y + SKIRTING_HEIGHT + 1e-3;
    const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: index.count, materialIndex: 0 }];
    const kept = [];
    const skirt = [];
    const newGroups = [];
    for (const { start, count, materialIndex } of groups) {
      const from = kept.length;
      for (let t = start; t < start + count; t += 3) {
        const ids = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
        (ids.every((id) => position.getY(id) <= top) ? skirt : kept).push(...ids);
      }
      newGroups.push({ start: from, count: kept.length - from, materialIndex });
    }
    if (!skirt.length) continue;
    geometry.setIndex([...kept, ...skirt]);
    geometry.clearGroups();
    for (const { start, count, materialIndex } of newGroups) if (count) geometry.addGroup(start, count, materialIndex);
    geometry.addGroup(kept.length, skirt.length, materials.length);
    mesh.material = [...materials, skirting];
  }
}

/**
 * Lifts a prop so it stands on the shelf board under it rather than
 * through it: the first surface of `shelfName` straight down from the
 * prop's top is the board it belongs on.
 */
function seatOnShelf(room, objectName, shelfName) {
  const object = room.group.getObjectByName(objectName);
  const shelf = room.group.getObjectByName(shelfName);
  if (!object?.isMesh || !shelf) return;
  room.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  const raycaster = new THREE.Raycaster(new THREE.Vector3(centre.x, box.max.y, centre.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = box.max.y - box.min.y + 0.5;
  const board = raycaster.intersectObject(shelf, false)[0];
  const lift = board ? board.point.y - box.min.y : 0;
  if (lift <= 0) return;
  const world = object.getWorldPosition(new THREE.Vector3());
  world.y += lift;
  object.position.copy(object.parent.worldToLocal(world));
  object.updateMatrixWorld(true);
  const entry = room.collisionMeshes?.find(({ mesh }) => mesh === object);
  if (entry) entry.box.setFromObject(object);
}

function removeRockingHorse(room) {
  room.group.updateMatrixWorld(true);
  const parts = [];
  room.group.traverse((child) => {
    if (child.isMesh && ROCKING_HORSE_PARTS.has(child.name)
      && ROCKING_HORSE_AREA.containsBox(new THREE.Box3().setFromObject(child))) parts.push(child);
  });
  for (const part of parts) part.removeFromParent();
  room.collisionMeshes = room.collisionMeshes.filter((entry) => !parts.includes(entry.mesh));
}

/**
 * The staging for talking to Kaufmo (see TALK_CAMERA): where he and Pomni
 * stand, which way each faces, and the camera's position and aim. main.js
 * moves them onto their marks when the conversation starts.
 */
function talkShot(at) {
  const floorY = at.y;
  const camera = new THREE.Vector3(TALK_CAMERA.x, floorY + TALK_CAMERA.y, TALK_CAMERA.z);
  const kaufmo = new THREE.Vector3(TALK_KAUFMO.x, floorY, TALK_KAUFMO.z);
  const pomni = new THREE.Vector3(TALK_POMNI.x, floorY, TALK_POMNI.z);
  const flatCamera = camera.clone().setY(floorY);
  return {
    camera,
    target: kaufmo.clone().add(pomni).multiplyScalar(0.5).setY(floorY + TALK_AIM_HEIGHT),
    kaufmo: { x: kaufmo.x, z: kaufmo.z },
    pomni: { x: pomni.x, z: pomni.z },
    // What each turns to face: the other, swung partly toward the camera.
    kaufmoLooksAt: pomni.clone().lerp(flatCamera, TALK_TURN_TO_CAMERA),
    pomniLooksAt: kaufmo.clone().lerp(flatCamera, TALK_TURN_TO_CAMERA),
    pomniHeadAt: kaufmo.clone().setY(floorY + TALK_POMNI_LOOK_HEIGHT),
  };
}

/**
 * Stands Kaufmo at the room's actual geometric middle (not pulled toward
 * the spawn/doorway the way the old placement did, which left him tucked
 * in a corner near clutter) — floor height found the same way
 * officePicture.js's findSpotNear does, casting from well above and
 * taking the lowest hit so a ceiling fixture directly overhead can't be
 * mistaken for the floor.
 */
function placeInMiddleOfRoom(kaufmo, { group, spawn }) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const center = box.getCenter(new THREE.Vector3());

  const raycaster = new THREE.Raycaster(new THREE.Vector3(center.x, box.max.y + 1, center.z), new THREE.Vector3(0, -1, 0));
  raycaster.far = box.max.y - box.min.y + 2;
  const hits = raycaster.intersectObject(group, true);
  const floorHit = hits[hits.length - 1];
  const position = new THREE.Vector3(center.x, floorHit ? floorHit.point.y : box.min.y, center.z);

  kaufmo.position.copy(position);
  kaufmo.rotation.y = Math.atan2(spawn.x - position.x, spawn.z - position.z);
}

/**
 * Same symptom as the lobby's exported "Plastic" materials: a few of this
 * room's shaders the glTF exporter couldn't translate come out fully
 * metallic + fully rough with no texture, which shows no diffuse colour at
 * all — just reflections — so they render almost black. Most materials
 * were already fixed on the Blender side (see the export script); this is
 * a safety net for whatever that pass didn't cover.
 */
function fixExportedMaterials(group) {
  group.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.metalness >= 0.99 && material.roughness >= 0.99 && !material.metalnessMap) {
        material.metalness = 0;
      }
    }
  });
}

// --- Kaufmo's graffiti -------------------------------------------------
// In the .blend his walls layer a diamond pattern with his own drawings:
// "EXIT" scrawled everywhere, "NO WAY OUT", and a doodle of Caine and Jax.
// The glTF export can't carry those layers (see fix_kaufmo_walls in the
// export script), so they're put back here: all of it on the wall he's
// been working on (the "Drawings" one), the EXITs thinning out along the
// two walls either side as they run away from it, and only a trace on the
// wall facing it.
//
// The export's wall UVs can't take a picture (each wall maps most of its
// height onto one stretched triangle of the image), so the graffiti goes on
// separate transparent panels flat against each wall, with their own UVs.
const WALL_ART_DIR = './models/character%20rooms/kaufmo-walls/';
const WALL_ART = { exit: 'exit.png', noWayOut: 'no-way-out.png', drawing: 'drawing.png' };
// EXIT across the side walls: opacity at the end touching the Drawings
// wall, and at the far end. The far wall: one faint, even layer.
const SIDE_EXIT_NEAR = 0.95;
// Shape of the fade (1 = even all the way along, higher = drops off sooner).
const SIDE_EXIT_CURVE = 0.8;
const SIDE_EXIT_FAR = 0.3;
const FAR_WALL_EXIT = 0.25;
// Metres off the wall: enough that a panel never flickers into it, and less
// than the theory wall's (props/theoryWall.js), which sits on top of all this.
const PANEL_GAP = 0.006;
// How much of each wall's height the panels cover, in metres from the floor.
const PANEL_BOTTOM = 0.55;
const PANEL_TOP = 6.9;
// On the Drawings wall: NO WAY OUT and the doodle, in fractions of the wall
// (seen from inside, left to right): centre x, centre y, height.
const NO_WAY_OUT_AT = { x: 0.33, y: 0.3, height: 0.7 };
const DRAWING_AT = { x: 0.72, y: 0.45, height: 0.8 };

function loadWallArt() {
  const loader = new THREE.TextureLoader();
  const entries = Object.entries(WALL_ART).map(([key, file]) =>
    loader.loadAsync(WALL_ART_DIR + file).then((loaded) => {
      const texture = key === 'noWayOut' ? withQuestionMark(loaded) : loaded;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      return [key, texture];
    }, () => [key, null]));
  return Promise.all(entries).then(Object.fromEntries);
}

// "NO WAY OUT" becomes "NO WAY OUT?": a question mark is drawn on after
// OUT, in the letters' own red, as a fat marker stroke. Where it goes, in
// fractions of the image: left edge, top, height (about OUT's height).
const QUESTION_MARK_AT = { x: 0.605, y: 0.6, height: 0.27 };

function withQuestionMark(texture) {
  const image = texture.image;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);

  // The letters' colour: the average of the strongly red, solid pixels.
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4 * 7) {
    if (data[i + 3] > 220 && data[i] > 150 && data[i + 1] < 90) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  }
  const colour = n ? `rgb(${Math.round(r / n)}, ${Math.round(g / n)}, ${Math.round(b / n)})` : '#e8161c';

  const h = QUESTION_MARK_AT.height * canvas.height;
  const x = QUESTION_MARK_AT.x * canvas.width;
  const y = QUESTION_MARK_AT.y * canvas.height;
  const w = h * 0.55;
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = h * 0.15;
  // Two slightly offset passes, like a marker gone over twice.
  for (const [dx, dy] of [[0, 0], [h * 0.012, -h * 0.01]]) {
    ctx.beginPath();
    ctx.moveTo(x + dx + w * 0.05, y + dy + h * 0.24);
    ctx.bezierCurveTo(x + dx + w * 0.1, y + dy - h * 0.02, x + dx + w * 1.0, y + dy - h * 0.04, x + dx + w * 0.95, y + dy + h * 0.25);
    ctx.bezierCurveTo(x + dx + w * 0.9, y + dy + h * 0.45, x + dx + w * 0.45, y + dy + h * 0.45, x + dx + w * 0.48, y + dy + h * 0.68);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(x + w * 0.5, y + h * 0.92, h * 0.1, h * 0.09, -0.2, 0, Math.PI * 2);
  ctx.fill();

  const result = new THREE.CanvasTexture(canvas);
  texture.dispose();
  return result;
}

/**
 * Hangs the graffiti panels on Kaufmo's walls. Where each wall is comes
 * from the wall meshes themselves: the "Drawings" wall is the one with
 * that material, the far wall faces it, the other two are its sides.
 */
function paintGraffiti(group, art) {
  if (!art.exit) return; // the art didn't load: plain walls, as exported
  group.updateMatrixWorld(true);
  const room = new THREE.Box3();
  let drawings = null;
  group.traverse((mesh) => {
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) {
      if (material.name === 'Kaufmo Walls') room.expandByObject(mesh);
      if (material.name === 'Kaufmo Walls - Drawings') drawings = mesh;
    }
  });
  if (room.isEmpty() || !drawings) return;
  const centre = room.getCenter(new THREE.Vector3());
  // The Drawings wall's outward direction, snapped to x or z.
  const toward = new THREE.Box3().setFromObject(drawings).getCenter(new THREE.Vector3()).sub(centre);
  const out = Math.abs(toward.x) > Math.abs(toward.z)
    ? new THREE.Vector3(Math.sign(toward.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(toward.z));
  const across = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), out);

  const panels = new THREE.Group();
  panels.name = 'KaufmoGraffiti';
  const main = wallPanelFrame(room, out);
  const far = wallPanelFrame(room, out.clone().negate());
  // Nothing's painted across his doorway: the hall shows through it.
  const doorFrame = group.getObjectByName(DOOR_FRAME_NAME);
  const doorBox = doorFrame && new THREE.Box3().setFromObject(doorFrame);
  const exitPanel = (frame, texture, fade) => wallExitPanel(frame, texture, fade, doorwayOn(frame, doorBox));

  panels.add(exitPanel(main, art.exit, () => 1));
  panels.add(exitPanel(far, art.exit, () => FAR_WALL_EXIT));
  for (const side of [wallPanelFrame(room, across), wallPanelFrame(room, across.clone().negate())]) {
    // Which end of this side wall (as seen from inside) touches the Drawings wall.
    const nearIsRight = side.right.dot(out) > 0;
    panels.add(exitPanel(side, art.exit, (u) => {
      const t = nearIsRight ? u : 1 - u;
      return SIDE_EXIT_FAR + (SIDE_EXIT_NEAR - SIDE_EXIT_FAR) * t ** SIDE_EXIT_CURVE;
    }));
  }
  if (art.noWayOut) panels.add(decalPanel(main, art.noWayOut, NO_WAY_OUT_AT, 2));
  if (art.drawing) panels.add(decalPanel(main, art.drawing, DRAWING_AT, 3));
  group.add(panels);
}

/**
 * One wall's panel area, from inside the room: its centre (just off the
 * wall), which way is right, which way faces into the room, and its size.
 */
function wallPanelFrame(room, outward) {
  const centre = room.getCenter(new THREE.Vector3());
  const size = room.getSize(new THREE.Vector3());
  const runsAlongX = outward.x === 0;
  const width = runsAlongX ? size.x : size.z;
  const depth = runsAlongX ? size.z : size.x;
  const position = centre.clone().addScaledVector(outward, depth / 2 - PANEL_GAP);
  position.y = room.min.y + (PANEL_BOTTOM + PANEL_TOP) / 2;
  const inward = outward.clone().negate();
  // Facing the wall from inside, right is up × (towards the viewer)... i.e. inward × up.
  const right = new THREE.Vector3().crossVectors(inward, new THREE.Vector3(0, 1, 0)).negate();
  return { position, inward, right, width, height: PANEL_TOP - PANEL_BOTTOM };
}

/** A flat panel on a wall, facing into the room, carrying `material`. */
function panelMesh(frame, width, height, material, offset = new THREE.Vector2()) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.copy(frame.position).addScaledVector(frame.right, offset.x);
  mesh.position.y += offset.y;
  mesh.lookAt(mesh.position.clone().add(frame.inward));
  mesh.name = 'KaufmoGraffitiPanel';
  mesh.receiveShadow = true;
  mesh.raycast = () => {}; // never blocks a click, a look or a walk
  return mesh;
}

/**
 * The EXIT scrawl across a whole wall, its opacity `fade(u)` across it (u 0 =
 * left), and none over `doorway` (doorwayOn) if the wall has one.
 */
function wallExitPanel(frame, texture, fade, doorway) {
  const alpha = document.createElement('canvas');
  alpha.width = 256;
  alpha.height = 64;
  const ctx = alpha.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 256, 0);
  for (let i = 0; i <= 8; i++) {
    const level = Math.round(Math.min(1, Math.max(0, fade(i / 8))) * 255);
    gradient.addColorStop(i / 8, `rgb(${level}, ${level}, ${level})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 64);
  // The canvas's top is the panel's top.
  if (doorway) ctx.clearRect(doorway.left * 256, (1 - doorway.top) * 64, (doorway.right - doorway.left) * 256, 64);
  // Scaled to the wall's height, keeping the scrawl's proportions: a wall
  // narrower than the image shows a stretch of it, a wider one repeats it.
  const map = texture.clone();
  map.wrapS = THREE.RepeatWrapping;
  const imageAspect = texture.image.width / texture.image.height;
  map.repeat.set(frame.width / (frame.height * imageAspect), 1);
  map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({
    map, alphaMap: new THREE.CanvasTexture(alpha), transparent: true, depthWrite: false,
    roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1,
  });
  return panelMesh(frame, frame.width, frame.height, material);
}

/**
 * Where a doorway (its frame's bounds) is in this wall's panel, as
 * fractions of it: across from its left, and its top up from the panel's
 * bottom. Null if it's in another wall.
 */
function doorwayOn(frame, doorBox) {
  if (!doorBox) return null;
  const centre = doorBox.getCenter(new THREE.Vector3());
  if (Math.abs(centre.sub(frame.position).dot(frame.inward)) > 0.5) return null;
  const across = [doorBox.min, doorBox.max].map((corner) => corner.clone().sub(frame.position).dot(frame.right) / frame.width + 0.5);
  const bottom = frame.position.y - frame.height / 2;
  return { left: Math.min(...across), right: Math.max(...across), top: (doorBox.max.y - bottom) / frame.height };
}

/** A single picture (NO WAY OUT, the doodle) placed on a wall. */
function decalPanel(frame, texture, at, order) {
  const height = at.height * frame.height;
  const width = height * (texture.image.width / texture.image.height);
  const material = new THREE.MeshStandardMaterial({
    map: texture, transparent: true, depthWrite: false, roughness: 0.9,
    polygonOffset: true, polygonOffsetFactor: -1 - order,
  });
  const offset = new THREE.Vector2((at.x - 0.5) * frame.width, (0.5 - at.y) * frame.height);
  const mesh = panelMesh(frame, width, height, material, offset);
  mesh.renderOrder = order;
  return mesh;
}

/**
 * Kaufmo at his theory wall while nobody's talking to him: a block of
 * writing at one of WALL_SPOTS, a step back to look it over (theorize),
 * then a walk to the next spot, round and round. The marker's tip inks
 * the wall wherever his hand actually takes it. pause() hands him over to
 * a conversation (main.js puts him on his mark); resume() puts him back
 * at the wall, writing.
 */
function createWallRoutine(kaufmoApi, wallSpot, theoryWall) {
  const { kaufmo } = kaufmoApi;
  const normal = new THREE.Vector3(Math.sin(wallSpot.rotationY), 0, Math.cos(wallSpot.rotationY)); // out of the wall
  const along = new THREE.Vector3(normal.z, 0, -normal.x);
  const wallPoint = wallSpot.position;
  const lookAt = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let spot = 0;
  let phase = 'write';
  let phaseTime = 0;
  let walkSeconds = 0;
  let active = true;

  const standAt = (index, back = 0, out = new THREE.Vector3()) => out.copy(wallPoint)
    .addScaledVector(along, WALL_SPOTS[index])
    .addScaledVector(normal, WALL_STAND + back)
    .setY(kaufmo.position.y);

  function faceWall() {
    kaufmoApi.faceTowards(lookAt.copy(kaufmo.position).sub(normal));
  }

  function begin(next) {
    phase = next;
    phaseTime = 0;
    if (next === 'write' || next === 'theorize') {
      kaufmoApi.setActivity(next);
      faceWall();
      return;
    }
    // Walking: from where he is to the next place he'll stand.
    from.copy(kaufmo.position);
    if (next === 'stepBack') standAt(spot, THEORIZE_STEP_BACK, to);
    else {
      spot = (spot + 1) % WALL_SPOTS.length;
      standAt(spot, 0, to);
    }
    walkSeconds = Math.max(0.6, from.distanceTo(to) / WALK_SPEED);
    kaufmoApi.setActivity('walk');
    // He walks backward stepping back from the wall, forward otherwise.
    kaufmoApi.faceTowards(next === 'stepBack' ? lookAt.copy(kaufmo.position).sub(normal) : to);
  }

  function update(deltaSeconds) {
    if (!active) return;
    phaseTime += deltaSeconds;
    if (phase === 'write' && phaseTime >= WRITE_SECONDS) begin('stepBack');
    else if (phase === 'theorize' && phaseTime >= THEORIZE_SECONDS) begin('walk');
    else if (phase === 'stepBack' || phase === 'walk') {
      const t = THREE.MathUtils.smoothstep(phaseTime / walkSeconds, 0, 1);
      kaufmo.position.lerpVectors(from, to, t);
      if (phaseTime >= walkSeconds) begin(phase === 'stepBack' ? 'theorize' : 'write');
    }
  }

  function afterPose(deltaSeconds) {
    if (active && kaufmoApi.activity === 'write') theoryWall.draw(kaufmoApi.markerTip(tip), kaufmoApi.penDown);
    theoryWall.update(deltaSeconds);
  }

  return {
    update,
    afterPose,
    pause() {
      active = false;
      kaufmoApi.setActivity(null);
    },
    resume() {
      active = true;
      standAt(spot, 0, kaufmo.position);
      faceWall();
      kaufmo.rotation.y = Math.atan2(-normal.x, -normal.z);
      begin('write');
    },
    get active() { return active; },
  };
}
